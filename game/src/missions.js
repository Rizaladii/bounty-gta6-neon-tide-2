// game/src/missions.js — NEON TIDE story missions, cutscenes and side jobs.
//
// The 8-mission chain across 5 chapters, plus 5 repeatable side jobs.
// Every mission is completable in the real game loop: arrival missions
// complete on reaching their target, holdout missions on surviving their
// timer, and the finale ends the story. All reads of police / car /
// characters state are defensive — a missing module is treated as
// "no police, wanted 0", never as an exception — because main.js wires
// the modules in Stage 9 and this file must never throw before then.
//
// Cutscenes play through the dialogue module (showDialogue); each shot
// also reports to opts.onCutsceneShot so main.js can move the camera.
// All in-game text is English. No external resources, no network.

import { showDialogue } from './dialogue.js';

// ---------------------------------------------------------------------------
// Data: chapters, missions, cutscenes, side jobs
// ---------------------------------------------------------------------------

export const CHAPTERS = [
  { number: 1, title: 'First Light', first: 1, last: 2, missions: [1, 2] },
  { number: 2, title: 'Static', first: 3, last: 4, missions: [3, 4] },
  { number: 3, title: 'Velvet', first: 5, last: 5, missions: [5] },
  { number: 4, title: 'Fire', first: 6, last: 7, missions: [6, 7] },
  { number: 5, title: 'Neon Tide', first: 8, last: 8, missions: [8] },
];

export const MISSIONS = [
  {
    id: 1,
    title: 'First Light',
    briefing:
      'Teo has a simple job for you: pick up a package at the Saltworks Docks and drive it to the Boardwalk. Easy money — just do not keep the buyer waiting.',
    objective: 'Pick up the package at the Saltworks Docks, then deliver it to the Boardwalk.',
    target: { district: 'Saltworks Docks', x: 0, z: 180 },
    character: 'Teo',
    chapter: 1,
    reward: 500,
  },
  {
    id: 2,
    title: "Switch's Favor",
    briefing:
      'Dex needs a part from a rival garage in Old Cinder Town, and the owner will not sell it. Take a car, grab the part, and bring it back to the safehouse.',
    objective: 'Steal a car, grab the part in Old Cinder Town, and drive it back to the safehouse.',
    target: { district: 'Old Cinder Town', x: 0, z: 120 },
    character: 'Dex',
    chapter: 1,
    reward: 500,
  },
  {
    id: 3,
    title: "Nia's Eyes",
    briefing:
      'Nia is waiting on the Boardwalk at night. She says the police are watching Teo — and now they are watching you too. Reach her without getting busted.',
    objective: 'Meet Nia on the Boardwalk. Do not get busted at wanted level 2.',
    target: { district: 'Sunset Boardwalk', x: -200, z: -40 },
    character: 'Nia',
    chapter: 2,
    reward: 500,
  },
  {
    id: 4,
    title: 'Harbor Run',
    briefing:
      'A job went bad at Glass Harbor and two patrol cars are already on you. Outrun them across the harbor bridge, then break their line of sight and lose them.',
    objective: 'Cross the harbor bridge, then lose the police.',
    target: { district: 'Glass Harbor', x: 120, z: -120 },
    character: 'Dex',
    chapter: 2,
    reward: 750,
  },
  {
    id: 5,
    title: 'Velvet Job',
    briefing:
      'Silas Orrin is meeting a buyer at a mansion in Velvet Hills tonight. Get close, photograph the meeting, and stay near the mansion for 20 seconds without being spotted.',
    objective: 'Stay near the Velvet Hills mansion for 20 seconds without being spotted, then leave.',
    target: { district: 'Velvet Hills', x: -60, z: -150 },
    character: 'Nia',
    chapter: 3,
    reward: 750,
  },
  {
    id: 6,
    title: 'Hold the Boardwalk',
    briefing:
      'Captain Valdez has surrounded the Boardwalk and the helicopter is already overhead. Hold out for 60 seconds at wanted level 3 until Teo’s van arrives.',
    objective: 'Survive on the Boardwalk for 60 seconds until Teo’s van arrives.',
    target: { district: 'Sunset Boardwalk', x: -200, z: 40 },
    character: 'Teo',
    chapter: 4,
    reward: 1000,
  },
  {
    id: 7,
    title: 'Docks on Fire',
    briefing:
      'Silas torched a warehouse in the Saltworks Docks with Nia inside. Drive there fast and protect her for 30 seconds while the police close in at wanted level 4.',
    objective: 'Reach the burning warehouse and protect Nia for 30 seconds.',
    target: { district: 'Saltworks Docks', x: 30, z: 180 },
    character: 'Nia',
    chapter: 4,
    reward: 1000,
  },
  {
    id: 8,
    title: 'Neon Tide',
    briefing:
      'This is it. Deliver the evidence to the radio station, then escape the city by speedboat from the harbor. Wanted level 5 — helicopter, roadblocks, spike strips, everything they have.',
    objective: 'Deliver the evidence to the radio station, then escape by speedboat from the harbor.',
    target: { district: 'Glass Harbor', x: 180, z: -100 },
    character: 'Dex',
    chapter: 5,
    reward: 1500,
  },
];

export const CUTSCENES = [
  {
    id: 'intro',
    title: 'Intro',
    character: 'Teo',
    shots: [
      {
        character: 'Teo',
        lines: [
          'Port Marigold. Sunset that never ends, and neon that never sleeps.',
          'You are the best getaway driver in this city, Mara. And tonight, the city needs you.',
        ],
        camera: {
          position: { x: -52, y: 6, z: 118 },
          lookAt: { x: -60, y: 2, z: 100 },
        },
      },
      {
        character: 'Mara',
        lines: [
          'One job, Teo. A package from the Docks to the Boardwalk. Then I am done for the night.',
          'At least, that is what I keep telling myself.',
        ],
        camera: {
          position: { x: -68, y: 4, z: 88 },
          lookAt: { x: -60, y: 2, z: 100 },
        },
      },
    ],
  },
  {
    id: 'reveal',
    title: 'Silas Reveal',
    character: 'Silas',
    shots: [
      {
        character: 'Nia',
        lines: [
          'Mara, listen. The buyer at the mansion tonight — it is Silas Orrin himself.',
          'The Tidewater Syndicate has been behind every job that went wrong. He wants your streets.',
        ],
        camera: {
          position: { x: -48, y: 8, z: -132 },
          lookAt: { x: -60, y: 3, z: -150 },
        },
      },
      {
        character: 'Silas',
        lines: [
          'Miss Quill. You drive very well — for someone with no future in my city.',
          'Take your photographs. Then run. It will not help.',
        ],
        camera: {
          position: { x: -72, y: 5, z: -168 },
          lookAt: { x: -60, y: 3, z: -150 },
        },
      },
    ],
  },
  {
    id: 'finale',
    title: 'Finale',
    character: 'Dex',
    shots: [
      {
        character: 'Dex',
        lines: [
          'This is Static Tide 104.7, and the tide just turned. The evidence is live, Marigold.',
          'Every deal, every payoff — the whole Syndicate, on air.',
        ],
        camera: {
          position: { x: 168, y: 7, z: -84 },
          lookAt: { x: 180, y: 3, z: -100 },
        },
      },
      {
        character: 'Mara',
        lines: [
          'The harbor is the only way out now. One last run — and then the city is free.',
          'Neon tide, take me home.',
        ],
        camera: {
          position: { x: 226, y: 6, z: -92 },
          lookAt: { x: 238, y: 1, z: -108 },
        },
      },
    ],
  },
];

export const SIDEJOBS = [
  {
    kind: 'taxi',
    title: 'Taxi Fare',
    description: 'Drive a passenger to the marker.',
    minPay: 100,
    maxPay: 150,
    pay: 150,
  },
  {
    kind: 'courier',
    title: 'Courier Drop',
    description: 'Deliver a package fast — beat the clock.',
    minPay: 150,
    maxPay: 200,
    pay: 200,
  },
  {
    kind: 'getaway',
    title: 'Getaway Practice',
    description: 'Lose a wanted level before the clock runs out.',
    minPay: 200,
    maxPay: 250,
    pay: 250,
  },
  {
    kind: 'race',
    title: 'Street Race',
    description: 'Beat a rival to the checkpoint.',
    minPay: 250,
    maxPay: 300,
    pay: 300,
  },
  {
    kind: 'theft',
    title: 'Car Theft List',
    description: 'Steal the named car and deliver it to the safehouse.',
    minPay: 200,
    maxPay: 250,
    pay: 250,
  },
];

// Wanted level each mission starts at (0 = no heat).
const MISSION_WANTED = { 1: 0, 2: 0, 3: 2, 4: 2, 5: 0, 6: 3, 7: 4, 8: 5 };

// Holdout durations in seconds.
const HOLD_VELVET = 20;
const HOLD_BOARDWALK = 60;
const HOLD_DOCKS = 30;
// Seconds with no police nearby needed to lose them in mission 4.
const LOSE_QUIET_SECONDS = 8;
// How close (metres) counts as "spotted" / "nearby" for police checks.
const SPOT_RADIUS = 30;
const LOSE_RADIUS = 45;
const ARRIVE_RADIUS = 8;

// Side-job time limits in seconds (0 = no limit).
const SIDEJOB_LIMITS = { taxi: 90, courier: 60, getaway: 60, race: 45, theft: 120 };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clamp01(v) {
  if (typeof v !== 'number' || !isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function dist2D(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x || 0) - (b.x || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dz * dz);
}

function pick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// setupMissions
// ---------------------------------------------------------------------------

export function setupMissions(state, city, player, car, police, opts) {
  opts = opts || {};
  const characters = opts.characters || null;
  const saveKey = opts.saveKey || 'neon-tide-save-v1';

  // Runtime state for the current mission.
  let status = 'idle'; // "idle" | "active" | "complete" | "failed"
  let phase = null; // per-mission phase name
  let timer = 0; // holdout / quiet timer for the current phase
  let phaseStartDist = 0; // distance to target when the phase began
  let failedNotified = false;
  let introPlayed = false;
  let sideJob = null; // { kind, title, pay, target, timeLeft, duration } or null

  // -- defensive readers ----------------------------------------------------

  function playerPos() {
    if (!player) return null;
    const p = player.position || (player.group && player.group.position) || null;
    if (p && typeof p.x === 'number' && typeof p.z === 'number') {
      return { x: p.x, z: p.z };
    }
    if (typeof player.x === 'number' && typeof player.z === 'number') {
      return { x: player.x, z: player.z };
    }
    return null;
  }

  function isDriving() {
    if (car) {
      if (car.isDriving) return true;
      if (car.currentCar) return true;
    }
    return !!(state && state.inCar);
  }

  function inBoat() {
    if (!car) return false;
    const current = car.currentCar || null;
    if (current && current.type === 'boat') return true;
    if (car.boat && car.boat === current) return true;
    return false;
  }

  function getWanted() {
    if (police && typeof police.getWanted === 'function') {
      try {
        const w = police.getWanted();
        if (typeof w === 'number') return w;
      } catch (err) { /* fall through to state */ }
    }
    return state && typeof state.wanted === 'number' ? state.wanted : 0;
  }

  function setWanted(level) {
    const n = Math.max(0, Math.min(5, Math.floor(level) || 0));
    try {
      if (police && typeof police.setWanted === 'function') {
        police.setWanted(n);
        return;
      }
      if (police && typeof police.raiseWanted === 'function' && typeof police.lowerWanted === 'function') {
        const current = getWanted();
        if (n > current) {
          for (let i = 0; i < n - current; i++) police.raiseWanted(1);
        } else if (n < current) {
          for (let i = 0; i < current - n; i++) police.lowerWanted(1);
        }
        return;
      }
    } catch (err) { /* fall through to direct state write */ }
    if (state) state.wanted = n;
  }

  function nearestPoliceDist() {
    if (!police || typeof police.getPoliceList !== 'function') return Infinity;
    let list = null;
    try {
      list = police.getPoliceList();
    } catch (err) {
      return Infinity;
    }
    if (!Array.isArray(list) || list.length === 0) return Infinity;
    const pos = playerPos();
    if (!pos) return Infinity;
    let best = Infinity;
    for (const unit of list) {
      if (!unit) continue;
      const ux = typeof unit.x === 'number' ? unit.x : (unit.group && unit.group.position ? unit.group.position.x : null);
      const uz = typeof unit.z === 'number' ? unit.z : (unit.group && unit.group.position ? unit.group.position.z : null);
      if (ux === null || uz === null) continue;
      best = Math.min(best, dist2D(pos, { x: ux, z: uz }));
    }
    return best;
  }

  function characterEntry(key) {
    if (!characters || !key) return null;
    return characters[key] || null;
  }

  function persistSave() {
    try {
      if (typeof opts.onSave === 'function') {
        opts.onSave();
        return;
      }
    } catch (err) { /* fall through */ }
    try {
      if (typeof opts.onMissionComplete === 'function') {
        // onMissionComplete is also the save hook in save.js wiring.
        opts.onMissionComplete(currentMission(), 0);
      }
    } catch (err) { /* ignore */ }
    // Last resort: persist the bare essentials ourselves so progress is
    // never silently lost when main.js has not wired a save hook yet.
    try {
      if (typeof localStorage !== 'undefined' && state) {
        let prev = {};
        try {
          prev = JSON.parse(localStorage.getItem(saveKey) || '{}') || {};
        } catch (err) {
          prev = {};
        }
        prev.money = state.money;
        prev.missionIndex = state.missionIndex;
        localStorage.setItem(saveKey, JSON.stringify(prev));
      }
    } catch (err) { /* storage unavailable — never throw */ }
  }

  // -- mission data access ---------------------------------------------------

  function currentMission() {
    if (!state) return null;
    const idx = state.missionIndex || 0;
    if (idx < 0 || idx >= MISSIONS.length) return null;
    return MISSIONS[idx];
  }

  function missionTarget(mission) {
    if (!mission || !mission.target) return null;
    return {
      x: mission.target.x,
      z: mission.target.z,
      district: mission.target.district,
      label: mission.title,
    };
  }

  // Target point for the phase currently in progress.
  function phaseTarget() {
    const mission = currentMission();
    if (!mission) return null;
    const spawn = city && city.spawn ? { x: city.spawn.x, z: city.spawn.z } : { x: -60, z: 100 };
    const boat = city && city.boatSpawn
      ? { x: city.boatSpawn.x, z: city.boatSpawn.z }
      : { x: 238, z: -108 };
    switch (mission.id) {
      case 1:
        // pickup at the Docks, then deliver to the Boardwalk.
        return phase === 'deliver'
          ? { x: -200, z: 40, district: 'Sunset Boardwalk', label: 'Deliver the package' }
          : missionTarget(mission);
      case 2:
        // garage first, then back to the safehouse in a car.
        return phase === 'return'
          ? { x: spawn.x, z: spawn.z, district: 'Old Cinder Town', label: 'Bring the part to the safehouse' }
          : missionTarget(mission);
      case 5:
        return missionTarget(mission);
      case 6:
        return { x: -200, z: 40, district: 'Sunset Boardwalk', label: 'Hold the Boardwalk' };
      case 7:
        return missionTarget(mission);
      case 8:
        // radio station first, then the harbor boat.
        return phase === 'escape'
          ? { x: boat.x, z: boat.z, district: 'Glass Harbor', label: 'Escape by speedboat' }
          : missionTarget(mission);
      default:
        return missionTarget(mission);
    }
  }

  function setPhase(next) {
    phase = next;
    timer = 0;
    const target = phaseTarget();
    const pos = playerPos();
    phaseStartDist = target && pos ? dist2D(pos, target) : 0;
  }

  function placeCharacter(key, x, z, facing) {
    try {
      if (characters && typeof characters.place === 'function') {
        characters.place(key, x, z, typeof facing === 'number' ? facing : 0);
      }
    } catch (err) { /* placing is cosmetic — never throw */ }
  }

  function hideCharacters() {
    try {
      if (characters && typeof characters.hideAll === 'function') {
        characters.hideAll();
      }
    } catch (err) { /* ignore */ }
  }

  // -- briefing ---------------------------------------------------------------

  function showBriefing(mission) {
    if (!mission) return;
    const entry = characterEntry(mission.character) || characterEntry('Teo');
    const lines = [mission.briefing, mission.objective];
    try {
      if (typeof document === 'undefined') return;
      if (entry) {
        showDialogue(entry, lines, null);
      }
    } catch (err) { /* dialogue unavailable — mission still starts */ }
  }

  // -- public API ---------------------------------------------------------------

  function startMission(i) {
    const idx = Math.max(0, Math.min(MISSIONS.length - 1, Math.floor(i) || 0));
    if (state) state.missionIndex = idx;
    const mission = MISSIONS[idx];
    status = 'active';
    failedNotified = false;
    sideJob = null;
    // First phase per mission.
    if (mission.id === 1) setPhase('pickup');
    else if (mission.id === 2) setPhase('garage');
    else if (mission.id === 4) setPhase('cross');
    else if (mission.id === 5) setPhase('watch');
    else if (mission.id === 6) setPhase('hold');
    else if (mission.id === 7) setPhase('reach');
    else if (mission.id === 8) setPhase('deliver');
    else setPhase('reach');
    setWanted(MISSION_WANTED[mission.id] || 0);
    // Stage the characters for the mission's key scene.
    if (mission.id === 3) placeCharacter('Nia', -200, -40, Math.PI / 2);
    if (mission.id === 5) placeCharacter('Silas', -60, -150, 0);
    if (mission.id === 6) placeCharacter('Teo', -200, 40, 0);
    if (mission.id === 7) placeCharacter('Nia', 30, 180, 0);
    showBriefing(mission);
    if (typeof opts.onMissionStart === 'function') {
      try { opts.onMissionStart(mission); } catch (err) { /* ignore */ }
    }
    return mission;
  }

  function startCurrent() {
    if (!state) return null;
    if ((state.missionIndex || 0) >= MISSIONS.length) {
      status = 'complete';
      return null;
    }
    return startMission(state.missionIndex || 0);
  }

  function completeMission() {
    const mission = currentMission();
    if (!mission || status !== 'active') return null;
    if (state) {
      state.money = (typeof state.money === 'number' ? state.money : 0) + mission.reward;
      state.missionIndex = (state.missionIndex || 0) + 1;
    }
    status = 'complete';
    phase = null;
    timer = 0;
    // Clear the heat from the finished job.
    setWanted(0);
    hideCharacters();
    persistSave();
    if (typeof opts.onMissionComplete === 'function') {
      try { opts.onMissionComplete(mission, mission.reward); } catch (err) { /* ignore */ }
    }
    // The finale: play the closing cutscene, then show the end screen.
    if (mission.id === 8) {
      playCutscene('finale', function () {
        if (typeof opts.onGameComplete === 'function') {
          try { opts.onGameComplete(mission); } catch (err) { /* ignore */ }
        }
      });
    }
    return mission;
  }

  function failMission() {
    const mission = currentMission();
    if (!mission) return null;
    // BUSTED retry: full health again, heat cleared, same mission restarts.
    if (state) {
      state.health = 100;
      state.isBusted = false;
    }
    // NOTE: player.health is a getter-only mirror of state.health
    // (player.js) — do NOT assign it; state.health above already restores it.
    status = 'active';
    failedNotified = false;
    if (mission.id === 1) setPhase('pickup');
    else if (mission.id === 2) setPhase('garage');
    else if (mission.id === 4) setPhase('cross');
    else if (mission.id === 5) setPhase('watch');
    else if (mission.id === 6) setPhase('hold');
    else if (mission.id === 7) setPhase('reach');
    else if (mission.id === 8) setPhase('deliver');
    else setPhase('reach');
    setWanted(MISSION_WANTED[mission.id] || 0);
    if (typeof opts.onMissionFailed === 'function') {
      try { opts.onMissionFailed(mission); } catch (err) { /* ignore */ }
    }
    return mission;
  }

  function reset() {
    if (state) state.missionIndex = 0;
    status = 'idle';
    phase = null;
    timer = 0;
    sideJob = null;
    failedNotified = false;
    introPlayed = false;
    hideCharacters();
    setWanted(0);
  }

  function getStatus() {
    if (state && (state.missionIndex || 0) >= MISSIONS.length) return 'complete';
    return status;
  }

  function getProgress() {
    const mission = currentMission();
    if (mission && status === 'active') {
      const target = phaseTarget();
      const pos = playerPos();
      const d = target && pos ? dist2D(pos, target) : Infinity;
      switch (mission.id) {
        case 1:
          // Two legs: pickup (0–0.5), deliver (0.5–1).
          if (phase === 'deliver') {
            return 0.5 + 0.5 * clamp01(1 - d / Math.max(phaseStartDist, 1));
          }
          return 0.5 * clamp01(1 - d / Math.max(phaseStartDist, 1));
        case 2:
          if (phase === 'return') {
            return 0.5 + 0.5 * clamp01(1 - d / Math.max(phaseStartDist, 1));
          }
          return 0.5 * clamp01(1 - d / Math.max(phaseStartDist, 1));
        case 4:
          if (phase === 'lose') return clamp01(timer / LOSE_QUIET_SECONDS);
          return 0.5 * clamp01(1 - d / Math.max(phaseStartDist, 1));
        case 5:
          if (phase === 'leave') return 0.9 + 0.1 * clamp01(d / 45);
          return clamp01(timer / HOLD_VELVET);
        case 6:
          return clamp01(timer / HOLD_BOARDWALK);
        case 7:
          if (phase === 'protect') return 0.5 + 0.5 * clamp01(timer / HOLD_DOCKS);
          return 0.5 * clamp01(1 - d / Math.max(phaseStartDist, 1));
        case 8:
          if (phase === 'escape') {
            return 0.5 + 0.5 * clamp01(1 - d / Math.max(phaseStartDist, 1));
          }
          return 0.5 * clamp01(1 - d / Math.max(phaseStartDist, 1));
        default:
          return clamp01(1 - d / Math.max(phaseStartDist, 1));
      }
    }
    if (status === 'complete') return 1;
    if (sideJob) {
      if (sideJob.duration > 0) return clamp01(1 - sideJob.timeLeft / sideJob.duration);
      return 0;
    }
    return 0;
  }

  function getTarget() {
    const mission = currentMission();
    if (mission && status === 'active') return phaseTarget();
    if (sideJob) return sideJob.target;
    return null;
  }

  // -- side jobs ----------------------------------------------------------------

  function startSideJob(kind) {
    const def = SIDEJOBS.find((s) => s.kind === kind);
    if (!def) return null;
    if (sideJob) return null; // one side job at a time
    let target = null;
    if (kind === 'getaway') {
      // Practice losing heat: if there is none, stir some up first.
      if (getWanted() === 0) setWanted(2);
      target = null;
    } else if (kind === 'theft') {
      const spawn = city && city.spawn ? { x: city.spawn.x, z: city.spawn.z } : { x: -60, z: 100 };
      target = {
        x: spawn.x,
        z: spawn.z,
        district: 'Old Cinder Town',
        label: 'Deliver the stolen car to the safehouse',
      };
    } else {
      let point = null;
      try {
        if (city && typeof city.randomRoadPoint === 'function') point = city.randomRoadPoint();
      } catch (err) { point = null; }
      if (!point) point = { x: 0, z: 0 };
      const district = city && typeof city.getDistrictAt === 'function'
        ? city.getDistrictAt(point.x, point.z)
        : 'Port Marigold';
      target = {
        x: point.x,
        z: point.z,
        district: district,
        label: def.title,
      };
    }
    const duration = SIDEJOB_LIMITS[kind] || 0;
    sideJob = {
      kind: def.kind,
      title: def.title,
      pay: def.pay,
      target: target,
      duration: duration,
      timeLeft: duration,
      status: 'active',
    };
    if (typeof opts.onSideJobStart === 'function') {
      try { opts.onSideJobStart(sideJob); } catch (err) { /* ignore */ }
    }
    return sideJob;
  }

  function completeSideJob() {
    if (!sideJob) return null;
    const job = sideJob;
    sideJob = null;
    if (state) {
      state.money = (typeof state.money === 'number' ? state.money : 0) + job.pay;
    }
    persistSave();
    if (typeof opts.onSideJobComplete === 'function') {
      try { opts.onSideJobComplete(job); } catch (err) { /* ignore */ }
    }
    return job;
  }

  function failSideJob() {
    if (!sideJob) return null;
    const job = sideJob;
    sideJob = null;
    if (typeof opts.onSideJobFailed === 'function') {
      try { opts.onSideJobFailed(job); } catch (err) { /* ignore */ }
    }
    return job;
  }

  function getSideJob() {
    return sideJob;
  }

  // -- cutscenes ------------------------------------------------------------------

  function playCutscene(id, onDone) {
    const scene = CUTSCENES.find((c) => c.id === id);
    const done = typeof onDone === 'function' ? onDone : null;
    if (!scene) {
      if (done) done();
      return;
    }
    if (id === 'intro') introPlayed = true;
    // No DOM (headless check / unit run): nothing to show, finish at once.
    if (typeof document === 'undefined') {
      if (done) done();
      return;
    }
    let shotIndex = 0;
    function playNextShot() {
      if (shotIndex >= scene.shots.length) {
        if (done) done();
        return;
      }
      const shot = scene.shots[shotIndex];
      shotIndex += 1;
      if (typeof opts.onCutsceneShot === 'function') {
        try { opts.onCutsceneShot(shot, shotIndex - 1, scene); } catch (err) { /* ignore */ }
      }
      const entry = characterEntry(shot.character);
      try {
        if (entry) {
          showDialogue(entry, shot.lines, playNextShot);
        } else {
          playNextShot();
        }
      } catch (err) {
        playNextShot();
      }
    }
    playNextShot();
  }

  // Which cutscene belongs before / after a mission (0-based index).
  function getCutsceneForMission(index) {
    if (index === 0) return 'intro';
    if (index === 4) return 'reveal';
    if (index >= MISSIONS.length) return 'finale';
    return null;
  }

  // -- per-frame update -------------------------------------------------------------

  function update(dt) {
    const step = typeof dt === 'number' && isFinite(dt) && dt > 0 ? Math.min(dt, 0.5) : 0;

    // Busted while a mission is running: mark failed once, let main.js
    // show the BUSTED screen and call failMission() on retry.
    if (status === 'active' && state && state.isBusted) {
      status = 'failed';
      if (!failedNotified) {
        failedNotified = true;
        if (typeof opts.onMissionFailed === 'function') {
          try { opts.onMissionFailed(currentMission()); } catch (err) { /* ignore */ }
        }
      }
      return;
    }

    if (status === 'active') {
      const mission = currentMission();
      if (mission) {
        const target = phaseTarget();
        const pos = playerPos();
        const d = target && pos ? dist2D(pos, target) : Infinity;
        const nearPolice = nearestPoliceDist();

        switch (mission.id) {
          case 1: {
            if (phase === 'pickup' && d <= ARRIVE_RADIUS) {
              setPhase('deliver');
            } else if (phase === 'deliver' && d <= ARRIVE_RADIUS) {
              completeMission();
            }
            break;
          }
          case 2: {
            if (phase === 'garage' && d <= ARRIVE_RADIUS) {
              setPhase('return');
            } else if (phase === 'return' && d <= ARRIVE_RADIUS && isDriving()) {
              completeMission();
            }
            break;
          }
          case 3: {
            if (d <= ARRIVE_RADIUS) completeMission();
            break;
          }
          case 4: {
            if (phase === 'cross' && d <= 10) {
              setPhase('lose');
            } else if (phase === 'lose') {
              // Lose them: wanted gone, or no unit close for 8 seconds.
              if (getWanted() === 0) {
                completeMission();
              } else if (nearPolice > LOSE_RADIUS) {
                timer += step;
                if (timer >= LOSE_QUIET_SECONDS) completeMission();
              } else {
                timer = Math.max(0, timer - step);
              }
            }
            break;
          }
          case 5: {
            if (phase === 'watch') {
              if (d <= SPOT_RADIUS) {
                // Spotted if a unit closes in or heat rises.
                if (nearPolice <= SPOT_RADIUS || getWanted() > 0) {
                  timer = 0;
                } else {
                  timer += step;
                  if (timer >= HOLD_VELVET) setPhase('leave');
                }
              }
            } else if (phase === 'leave' && d > 45) {
              completeMission();
            }
            break;
          }
          case 6: {
            // Hold out: the clock runs while the mission is live.
            timer += step;
            if (timer >= HOLD_BOARDWALK) completeMission();
            break;
          }
          case 7: {
            if (phase === 'reach' && d <= 10) {
              setPhase('protect');
            } else if (phase === 'protect') {
              // The clock only runs while Mara stays close to Nia.
              if (d <= 25) {
                timer += step;
                if (timer >= HOLD_DOCKS) completeMission();
              }
            }
            break;
          }
          case 8: {
            if (phase === 'deliver' && d <= 10) {
              setPhase('escape');
            } else if (phase === 'escape' && d <= ARRIVE_RADIUS) {
              completeMission();
            }
            break;
          }
          default: {
            if (d <= ARRIVE_RADIUS) completeMission();
            break;
          }
        }
      }
    }

    // Side jobs run alongside (or between) missions.
    if (sideJob) {
      if (sideJob.duration > 0) {
        sideJob.timeLeft -= step;
        if (sideJob.timeLeft <= 0) {
          failSideJob();
          return;
        }
      }
      if (sideJob.kind === 'getaway') {
        if (getWanted() === 0) completeSideJob();
      } else if (sideJob.target) {
        const pos = playerPos();
        const d = pos ? dist2D(pos, sideJob.target) : Infinity;
        if (d <= ARRIVE_RADIUS) {
          // Theft only counts when Mara delivers in a car.
          if (sideJob.kind === 'theft' && !isDriving()) {
            // Arrived on foot — wait for her to bring a car.
          } else {
            completeSideJob();
          }
        }
      }
    }
  }

  return {
    startMission,
    startCurrent,
    update,
    completeMission,
    failMission,
    reset,
    getStatus,
    getProgress,
    getTarget,
    startSideJob,
    playCutscene,
    getSideJob,
    getCutsceneForMission,
    getCurrentMission: currentMission,
    get introPlayed() {
      return introPlayed;
    },
  };
}

export { setupMissions as createMissions };
