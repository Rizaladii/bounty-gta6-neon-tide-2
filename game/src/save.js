// save.js — save / load / continue + settings via localStorage.
// Persists the live game state through state.js saveSnapshot /
// loadSnapshot, and keeps the settings object under its own key.
// Every storage access is guarded: when localStorage is unavailable
// (or throws) the module behaves as if there is no save and falls back
// to the default settings, and never throws.

import { saveSnapshot, loadSnapshot } from "./state.js";

// Storage keys (fixed by the spec — do not rename).
export const SAVE_KEY = "neon-tide-save-v1";
export const SETTINGS_KEY = "neon-tide-settings-v1";

// Save format version, stored inside the save payload so a future
// format change can be detected instead of misread.
const SAVE_VERSION = 1;

// Sensible default settings. volume is 0..1; cameraMode is the chase
// camera default ("near" or "far"); quality is "low" / "medium" /
// "high"; the rest are plain on/off flags.
export const DEFAULT_SETTINGS = {
  volume: 0.8,
  music: true,
  cameraMode: "near",
  showHUD: true,
  minimap: true,
  quality: "medium",
  autoDownscale: true,
  invertY: false,
};

const QUALITY_LEVELS = ["low", "medium", "high"];
const CAMERA_MODES = ["near", "far"];

// Return the localStorage object, or null when it is unavailable or
// unusable (private mode, file:// restrictions, SSR, or any throw).
function storage() {
  try {
    if (typeof localStorage === "undefined" || localStorage === null) {
      return null;
    }
    return localStorage;
  } catch (err) {
    return null;
  }
}

// Read a raw string value from storage, or null when it is missing or
// storage is unavailable. Never throws.
function readRaw(key) {
  const store = storage();
  if (!store) return null;
  try {
    const value = store.getItem(key);
    return typeof value === "string" ? value : null;
  } catch (err) {
    return null;
  }
}

// Write a raw string value to storage. Never throws.
function writeRaw(key, value) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch (err) {
    // Storage full or unavailable — the save is simply not persisted.
  }
}

// Remove a key from storage. Never throws.
function removeRaw(key) {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch (err) {
    // Nothing to do — the key is already effectively gone.
  }
}

// Weapons Mara owns: every weapon with reserve ammo, plus the weapon
// currently in her hands (when it is not her fists). Derived from the
// snapshot so the save stays plain numbers, strings and booleans.
function ownedWeaponsFromSnapshot(snap) {
  const owned = [];
  const ammo = snap && typeof snap.ammo === "object" && snap.ammo !== null
    ? snap.ammo
    : {};
  for (const name of ["pistol", "smg", "shotgun"]) {
    if (typeof ammo[name] === "number" && ammo[name] > 0) {
      owned.push(name);
    }
  }
  if (
    typeof snap.weapon === "string" &&
    snap.weapon !== "fists" &&
    !owned.includes(snap.weapon)
  ) {
    owned.push(snap.weapon);
  }
  return owned;
}

// Save the current game: money, mission index, health, owned weapons
// and ammo (via the state snapshot), plus the save format version.
export function save() {
  const snap = saveSnapshot();
  const payload = {
    version: SAVE_VERSION,
    money: snap.money,
    health: snap.health,
    wanted: snap.wanted,
    missionIndex: snap.missionIndex,
    isWanted: snap.isWanted,
    inCar: snap.inCar,
    isBusted: snap.isBusted,
    weapon: snap.weapon,
    ammo: snap.ammo,
    ownedWeapons: ownedWeaponsFromSnapshot(snap),
  };
  try {
    writeRaw(SAVE_KEY, JSON.stringify(payload));
  } catch (err) {
    // Serialization cannot fail on plain values; storage writes are
    // already guarded. Swallow anything unexpected so saving never
    // breaks the game.
  }
}

// Read the save and apply it to the live state, returning the stored
// values. Returns undefined when there is no save (or the stored save
// is unreadable), in which case the live state is left untouched.
export function load() {
  const raw = readRaw(SAVE_KEY);
  if (raw === null) return undefined;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    return undefined;
  }
  if (!payload || typeof payload !== "object") return undefined;
  if (typeof payload.money !== "number") return undefined;
  if (typeof payload.missionIndex !== "number") return undefined;
  loadSnapshot(payload);
  return {
    version: typeof payload.version === "number" ? payload.version : 1,
    money: payload.money,
    health:
      typeof payload.health === "number" ? payload.health : undefined,
    wanted: typeof payload.wanted === "number" ? payload.wanted : 0,
    missionIndex: payload.missionIndex,
    isWanted: payload.isWanted === true,
    inCar: payload.inCar === true,
    isBusted: payload.isBusted === true,
    weapon:
      typeof payload.weapon === "string" ? payload.weapon : "fists",
    ammo:
      payload.ammo && typeof payload.ammo === "object" ? payload.ammo : {},
    ownedWeapons: Array.isArray(payload.ownedWeapons)
      ? payload.ownedWeapons
      : ownedWeaponsFromSnapshot(payload),
  };
}

// True when a readable save exists in storage.
export function hasSave() {
  const raw = readRaw(SAVE_KEY);
  if (raw === null) return false;
  try {
    const payload = JSON.parse(raw);
    return (
      !!payload &&
      typeof payload === "object" &&
      typeof payload.money === "number" &&
      typeof payload.missionIndex === "number"
    );
  } catch (err) {
    return false;
  }
}

// Remove the save from storage.
export function clearSave() {
  removeRaw(SAVE_KEY);
}

// Called when a mission is completed: persist the game so the player
// can continue from the next mission after a reload.
export function onMissionComplete() {
  save();
}

// Validate one stored settings object against the defaults: unknown
// keys are dropped, wrong types fall back to their default, volume is
// clamped to 0..1, and quality / cameraMode must be known values.
function sanitizeSettings(stored) {
  const clean = { ...DEFAULT_SETTINGS };
  if (!stored || typeof stored !== "object") return clean;
  if (typeof stored.volume === "number" && Number.isFinite(stored.volume)) {
    clean.volume = Math.max(0, Math.min(1, stored.volume));
  }
  if (typeof stored.music === "boolean") clean.music = stored.music;
  if (
    typeof stored.cameraMode === "string" &&
    CAMERA_MODES.includes(stored.cameraMode)
  ) {
    clean.cameraMode = stored.cameraMode;
  }
  if (typeof stored.showHUD === "boolean") clean.showHUD = stored.showHUD;
  if (typeof stored.minimap === "boolean") clean.minimap = stored.minimap;
  if (
    typeof stored.quality === "string" &&
    QUALITY_LEVELS.includes(stored.quality)
  ) {
    clean.quality = stored.quality;
  }
  if (typeof stored.autoDownscale === "boolean") {
    clean.autoDownscale = stored.autoDownscale;
  }
  if (typeof stored.invertY === "boolean") clean.invertY = stored.invertY;
  return clean;
}

// Return the settings object: the stored settings merged over the
// defaults, or the defaults when nothing is stored (or storage is
// unavailable). Always returns a fresh object.
export function getSettings() {
  const raw = readRaw(SETTINGS_KEY);
  if (raw === null) return { ...DEFAULT_SETTINGS };
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch (err) {
    return { ...DEFAULT_SETTINGS };
  }
  return sanitizeSettings(stored);
}

// Merge the given values into the stored settings and persist them.
// Unknown keys and invalid values are ignored (see sanitizeSettings).
// Returns the resulting settings object.
export function setSettings(patch) {
  const next = sanitizeSettings({
    ...getSettings(),
    ...(patch && typeof patch === "object" ? patch : {}),
  });
  try {
    writeRaw(SETTINGS_KEY, JSON.stringify(next));
  } catch (err) {
    // Storage writes are already guarded; never throw.
  }
  return next;
}
