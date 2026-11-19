// state.js — pure game state for NEON TIDE. No Three.js, no DOM.
// Holds Mara's money, health, wanted level, mission progress, current
// weapon and ammo. Other modules read and mutate this single object;
// save.js persists it through saveSnapshot / loadSnapshot.

// Starting money in dollars.
export const START_MONEY = 500;

// Starting health in hit points.
export const START_HEALTH = 100;

// Highest wanted level the police can reach.
export const MAX_WANTED = 5;

// Weapon definitions. rate is shots per second; range is in metres;
// ammo is the starting reserve for that weapon. The pistol is accurate
// with moderate damage, the SMG fires fast with lower damage per shot,
// and the shotgun hits hard at close range with a wide spread.
export const WEAPONS = {
  pistol: {
    name: "Pistol",
    damage: 25,
    rate: 2.5,
    fireRate: 2.5,
    range: 60,
    spread: 0,
    ammo: 24,
  },
  smg: {
    name: "SMG",
    damage: 12,
    rate: 9,
    fireRate: 9,
    range: 40,
    spread: 0.04,
    ammo: 90,
  },
  shotgun: {
    name: "Shotgun",
    damage: 45,
    rate: 1.2,
    fireRate: 1.2,
    range: 18,
    spread: 0.22,
    ammo: 12,
  },
};

// Fresh starting ammo per weapon, copied from the weapon definitions so
// the state never shares a reference with WEAPONS.
function startingAmmo() {
  return {
    pistol: WEAPONS.pistol.ammo,
    smg: WEAPONS.smg.ammo,
    shotgun: WEAPONS.shotgun.ammo,
  };
}

// The mutable game state. wanted is an accessor so isWanted always stays
// in sync with it (true exactly while wanted is above 0) and the level
// can never leave 0..MAX_WANTED, no matter which module changes it.
export const state = {
  money: START_MONEY,
  health: START_HEALTH,
  missionIndex: 0,
  isWanted: false,
  inCar: false,
  isBusted: false,
  weapon: "fists",
  ammo: startingAmmo(),
  _wanted: 0,

  get wanted() {
    return this._wanted;
  },
  set wanted(value) {
    const level = Math.max(0, Math.min(MAX_WANTED, Math.floor(value) || 0));
    this._wanted = level;
    this.isWanted = level > 0;
  },
};

// Restore every field to its starting value.
export function resetState() {
  state.money = START_MONEY;
  state.health = START_HEALTH;
  state.wanted = 0;
  state.missionIndex = 0;
  state.inCar = false;
  state.isBusted = false;
  state.weapon = "fists";
  state.ammo = startingAmmo();
}

// Return a plain copy of the state (numbers, strings and booleans only),
// safe to store in localStorage.
export function saveSnapshot() {
  return {
    money: state.money,
    health: state.health,
    wanted: state.wanted,
    missionIndex: state.missionIndex,
    isWanted: state.isWanted,
    inCar: state.inCar,
    isBusted: state.isBusted,
    weapon: state.weapon,
    ammo: {
      pistol: state.ammo.pistol,
      smg: state.ammo.smg,
      shotgun: state.ammo.shotgun,
    },
  };
}

// Restore the state from a snapshot made by saveSnapshot. Missing fields
// fall back to their starting values; a missing or invalid snapshot
// simply resets the state.
export function loadSnapshot(snap) {
  if (!snap || typeof snap !== "object") {
    resetState();
    return;
  }
  state.money = typeof snap.money === "number" ? snap.money : START_MONEY;
  state.health =
    typeof snap.health === "number" ? snap.health : START_HEALTH;
  state.wanted = typeof snap.wanted === "number" ? snap.wanted : 0;
  state.missionIndex =
    typeof snap.missionIndex === "number" ? snap.missionIndex : 0;
  state.inCar = snap.inCar === true;
  state.isBusted = snap.isBusted === true;
  state.weapon = typeof snap.weapon === "string" ? snap.weapon : "fists";
  const snapAmmo = snap.ammo && typeof snap.ammo === "object" ? snap.ammo : {};
  state.ammo = {
    pistol:
      typeof snapAmmo.pistol === "number"
        ? snapAmmo.pistol
        : WEAPONS.pistol.ammo,
    smg:
      typeof snapAmmo.smg === "number" ? snapAmmo.smg : WEAPONS.smg.ammo,
    shotgun:
      typeof snapAmmo.shotgun === "number"
        ? snapAmmo.shotgun
        : WEAPONS.shotgun.ammo,
  };
}
