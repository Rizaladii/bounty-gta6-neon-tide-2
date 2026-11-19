# Spec — game/src/state.js

Pure data, no Three.js, no DOM. Holds the game's mutable state.

Exports:
- START_MONEY, a number, 500.
- START_HEALTH, a number, 100.
- MAX_WANTED, a number, 5.
- WEAPONS, an object with three entries — pistol, smg, shotgun — each with
  a name, damage, fire rate, range, and starting ammo. The pistol is
  accurate with moderate damage; the SMG fires fast with lower damage per
  shot; the shotgun is strong at close range with a wide spread.
- An object named state with fields: money (starts at START_MONEY), health
  (starts at START_HEALTH), wanted (starts 0), missionIndex (starts 0),
  isWanted (true when wanted is above 0), inCar (true while Mara is
  driving), isBusted (true while the BUSTED screen is showing), weapon
  (the current weapon name, or "fists"), ammo (an object with the remaining
  ammo per weapon).
- resetState(), which restores every field to its starting value.
- saveSnapshot(), which returns a plain copy of the state (numbers, strings,
  and booleans only, safe to store).
- loadSnapshot(snap), which restores the state from a snapshot made by
  saveSnapshot.

Nothing else is guaranteed. Keep the file short and dependency-free.
