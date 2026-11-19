// NEON TIDE — audio.js
// Radio (3 synthesized stations) + engine, siren, gunshot, punch and
// jingle sounds. Everything is synthesized with the Web Audio API:
// no audio files, no network requests, no external resources.
//
// The module never throws when audio is unavailable (headless Chrome,
// no AudioContext): every AudioContext creation and every play call is
// guarded, and all exported functions become no-ops in that case.
//
// Wiring (see DESIGN.md): main.js calls unlockAudio() once after a user
// gesture (key press / click), then calls update(driving, speed) every
// frame so the engine hum follows the car's speed and the radio only
// plays while Mara is driving. R calls nextStation(), T calls
// toggleRadio(). The HUD reads the current station through
// audio.getStation() / audio.currentStation / audio.stations +
// audio.stationIndex, and shows "RADIO OFF" when audio.radioOn is false.

export const STATION_NAMES = [
  "Sunset FM 91.3",
  "Static Tide 104.7",
  "Night Pulse 88.8",
];

// ---------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------

let ctx = null; // AudioContext, created lazily by unlockAudio()
let unlocked = false; // true once a user gesture has unlocked audio
let audioAvailable = false; // false when no AudioContext can be created
let masterGain = null;
let radioGain = null;
let sfxGain = null;
let engineGain = null;
let engineFilter = null;
let engineOsc = null;
let engineSubOsc = null;
let sirenOsc = null;
let sirenLfo = null;
let sirenGain = null;
let sirenOn = false;
let noiseBuffer = null;

let radioOn = true; // T key toggles this
let stationIndex = 0; // R key advances this
let driving = false; // set by update(driving, speed)
let speedNorm = 0; // 0..1 normalized car speed
let volume = 0.8; // from settings, default 0.8
let musicOn = true; // from settings

// Radio scheduler state.
let schedulerTimer = null;
let nextNoteTime = 0;
let step = 0; // 16th-note step inside the current bar
let chordStep = 0; // position inside the chord progression

const SCHEDULER_INTERVAL_MS = 50;
const LOOKAHEAD_S = 0.15;
const STEPS_PER_BAR = 16;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function clamp01(v) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(1, n));
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Read the saved settings defensively. Never throws, even when
// localStorage is unavailable (headless / private mode).
function readSettings() {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem("neon-tide-settings-v1");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    if (typeof parsed.volume === "number" && Number.isFinite(parsed.volume)) {
      volume = Math.max(0, Math.min(1, parsed.volume));
    }
    if (typeof parsed.music === "boolean") musicOn = parsed.music;
  } catch (e) {
    // Settings are optional; keep the defaults.
  }
}

function applyVolume() {
  if (!ctx || !masterGain) return;
  try {
    masterGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  } catch (e) {
    // Audio graph hiccup: stay silent rather than throw.
  }
}

function makeNoiseBuffer() {
  if (noiseBuffer || !ctx) return noiseBuffer;
  try {
    const len = Math.floor(ctx.sampleRate * 1);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } catch (e) {
    noiseBuffer = null;
  }
  return noiseBuffer;
}

// One short oscillator blip with an exponential decay envelope.
function blip(freq, time, dur, type, peak, destination) {
  if (!ctx || !destination) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(Math.max(1, freq), time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  } catch (e) {
    // Ignore: a failed blip must never break the game loop.
  }
}

// One filtered noise burst with a decay envelope (gunshots, punches).
function noiseBurst(time, dur, filterType, filterFreq, peak, destination) {
  if (!ctx || !destination) return;
  const buf = makeNoiseBuffer();
  if (!buf) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || "lowpass";
    filter.frequency.setValueAtTime(filterFreq || 1000, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    src.start(time);
    src.stop(time + dur + 0.05);
  } catch (e) {
    // Ignore.
  }
}

// ---------------------------------------------------------------------
// Radio stations — distinct looping moods, all scheduled notes.
// Each station: bpm, chord progression (arrays of MIDI notes, one chord
// per bar), bass pattern (MIDI notes per 16th step, 0 = rest), lead
// pattern (MIDI notes per 16th step, 0 = rest), and wave types.
// ---------------------------------------------------------------------

const STATIONS = [
  {
    name: "Sunset FM 91.3",
    mood: "upbeat sunset pop",
    bpm: 112,
    chords: [
      [60, 64, 67], // C major
      [55, 59, 62], // G major
      [57, 60, 64], // A minor
      [53, 57, 60], // F major
    ],
    bass: [48, 0, 0, 48, 0, 0, 48, 0, 43, 0, 0, 43, 0, 0, 43, 0],
    lead: [72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 67, 0, 69, 0],
    leadType: "triangle",
    bassType: "sine",
    padType: "triangle",
    leadLevel: 0.16,
    bassLevel: 0.22,
    padLevel: 0.05,
  },
  {
    name: "Static Tide 104.7",
    mood: "mellow tide groove",
    bpm: 76,
    chords: [
      [57, 60, 64, 67], // Am7
      [53, 57, 60, 65], // Fmaj7
      [48, 52, 55, 59], // Cmaj7
      [55, 59, 62, 66], // G6
    ],
    bass: [45, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0, 52, 0],
    lead: [69, 0, 0, 0, 72, 0, 0, 0, 71, 0, 0, 0, 67, 0, 0, 0],
    leadType: "sine",
    bassType: "sine",
    padType: "sine",
    leadLevel: 0.13,
    bassLevel: 0.2,
    padLevel: 0.06,
  },
  {
    name: "Night Pulse 88.8",
    mood: "driving night pulse",
    bpm: 128,
    chords: [
      [57, 60, 64], // Am
      [53, 57, 60], // F
      [48, 52, 55], // C
      [55, 59, 62], // G
    ],
    bass: [45, 0, 45, 0, 45, 0, 45, 0, 45, 0, 45, 0, 45, 0, 45, 0],
    lead: [69, 0, 72, 0, 76, 0, 72, 0, 69, 0, 67, 0, 64, 0, 67, 0],
    leadType: "square",
    bassType: "sawtooth",
    padType: "sawtooth",
    leadLevel: 0.07,
    bassLevel: 0.18,
    padLevel: 0.03,
  },
];

function currentStationDef() {
  return STATIONS[stationIndex] || STATIONS[0];
}

function stepDuration() {
  const def = currentStationDef();
  return 60 / def.bpm / 4; // one 16th note
}

// Schedule one 16th-note step of the current station at `time`.
function scheduleStep(stepIndex, time) {
  const def = currentStationDef();
  const chord = def.chords[chordStep % def.chords.length];

  // Pad: one soft chord tone at the start of each bar.
  if (stepIndex === 0) {
    for (const midi of chord) {
      blip(midiToFreq(midi), time, stepDuration() * 16, def.padType, def.padLevel, radioGain);
    }
  }

  // Bass line.
  const bassNote = def.bass[stepIndex % STEPS_PER_BAR];
  if (bassNote) {
    blip(midiToFreq(bassNote - 12), time, stepDuration() * 1.8, def.bassType, def.bassLevel, radioGain);
  }

  // Lead melody.
  const leadNote = def.lead[stepIndex % STEPS_PER_BAR];
  if (leadNote) {
    blip(midiToFreq(leadNote), time, stepDuration() * 1.6, def.leadType, def.leadLevel, radioGain);
  }
}

function schedulerTick() {
  if (!ctx || !unlocked) return;
  try {
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD_S) {
      scheduleStep(step, nextNoteTime);
      step = (step + 1) % STEPS_PER_BAR;
      if (step === 0) chordStep += 1;
      nextNoteTime += stepDuration();
    }
  } catch (e) {
    // Scheduler hiccup: reset the clock and keep going.
    try {
      nextNoteTime = ctx.currentTime + 0.05;
    } catch (e2) {
      // Ignore.
    }
  }
}

function startScheduler() {
  if (schedulerTimer !== null || !ctx) return;
  try {
    nextNoteTime = ctx.currentTime + 0.06;
    step = 0;
    chordStep = 0;
    schedulerTimer = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
  } catch (e) {
    schedulerTimer = null;
  }
}

function stopScheduler() {
  if (schedulerTimer !== null) {
    try {
      clearInterval(schedulerTimer);
    } catch (e) {
      // Ignore.
    }
    schedulerTimer = null;
  }
}

// Fade the radio bus in or out depending on driving / radio / music.
function updateRadioGain() {
  if (!ctx || !radioGain) return;
  try {
    const target =
      unlocked && radioOn && musicOn && driving ? 1 : 0;
    radioGain.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
  } catch (e) {
    // Ignore.
  }
}

// ---------------------------------------------------------------------
// Engine hum — two detuned oscillators through a low-pass filter.
// Pitch and brightness follow the car's normalized speed (0..1).
// ---------------------------------------------------------------------

function startEngine() {
  if (!ctx || engineOsc) return;
  try {
    engineOsc = ctx.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.setValueAtTime(55, ctx.currentTime);
    engineSubOsc = ctx.createOscillator();
    engineSubOsc.type = "square";
    engineSubOsc.frequency.setValueAtTime(27.5, ctx.currentTime);
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.setValueAtTime(320, ctx.currentTime);
    engineFilter.Q.setValueAtTime(1.2, ctx.currentTime);
    engineGain = ctx.createGain();
    engineGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    engineOsc.connect(engineFilter);
    engineSubOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(sfxGain);
    engineOsc.start();
    engineSubOsc.start();
  } catch (e) {
    engineOsc = null;
    engineSubOsc = null;
    engineFilter = null;
    engineGain = null;
  }
}

function updateEngine() {
  if (!ctx || !engineOsc || !engineGain || !engineFilter) return;
  try {
    const t = ctx.currentTime;
    const active = unlocked && driving;
    const rpm = 55 + speedNorm * 165; // 55 Hz idle -> 220 Hz flat out
    engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    engineSubOsc.frequency.setTargetAtTime(rpm / 2, t, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + speedNorm * 1800, t, 0.1);
    const level = active ? 0.05 + speedNorm * 0.09 : 0.0001;
    engineGain.gain.setTargetAtTime(level, t, 0.1);
  } catch (e) {
    // Ignore.
  }
}

// ---------------------------------------------------------------------
// Police siren — alternating two-tone wail, loops while active.
// ---------------------------------------------------------------------

function startSirenGraph() {
  if (!ctx || sirenOsc) return;
  try {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = "triangle";
    sirenOsc.frequency.setValueAtTime(720, ctx.currentTime);
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = "square";
    sirenLfo.frequency.setValueAtTime(0.55, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(180, ctx.currentTime);
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(sfxGain);
    sirenOsc.start();
    sirenLfo.start();
  } catch (e) {
    sirenOsc = null;
    sirenLfo = null;
    sirenGain = null;
  }
}

function setSirenLevel(on) {
  sirenOn = !!on;
  if (!ctx || !sirenGain) return;
  try {
    sirenGain.gain.setTargetAtTime(on ? 0.05 : 0.0001, ctx.currentTime, 0.2);
  } catch (e) {
    // Ignore.
  }
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

// Create (or resume) the AudioContext. Call once after a user gesture
// (key press or click); before that, audio stays silent. Safe to call
// more than once. Never throws, even with no AudioContext available.
export function unlockAudio() {
  readSettings();
  if (unlocked && ctx) {
    try {
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) {
      // Ignore.
    }
    return true;
  }
  try {
    const AC =
      typeof window !== "undefined"
        ? window.AudioContext || window.webkitAudioContext
        : null;
    if (!AC) {
      audioAvailable = false;
      return false;
    }
    ctx = new AC();
    audioAvailable = true;

    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    radioGain = ctx.createGain();
    radioGain.gain.setValueAtTime(0, ctx.currentTime);
    radioGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.setValueAtTime(1, ctx.currentTime);
    sfxGain.connect(masterGain);

    if (ctx.state === "suspended") ctx.resume();
    unlocked = true;
    makeNoiseBuffer();
    startEngine();
    startSirenGraph();
    startScheduler();
    updateRadioGain();
    updateEngine();
    return true;
  } catch (e) {
    ctx = null;
    audioAvailable = false;
    unlocked = false;
    return false;
  }
}

// Switch to the next radio station (R key). Wraps around after the
// last station. Safe to call before unlock; the station is remembered
// and plays once audio is unlocked and Mara is driving.
export function nextStation() {
  stationIndex = (stationIndex + 1) % STATIONS.length;
  step = 0;
  chordStep = 0;
  return getStation();
}

// Turn the radio on or off (T key). Returns the new radio state.
export function toggleRadio() {
  radioOn = !radioOn;
  updateRadioGain();
  return radioOn;
}

// Set the radio on or off directly.
export function setRadioOn(on) {
  radioOn = !!on;
  updateRadioGain();
  return radioOn;
}

// Current station name, for the HUD radio widget.
export function getStation() {
  return currentStationDef().name;
}

// True while the radio is switched on (ignores driving / music gates).
export function isRadioOn() {
  return radioOn;
}

// Tell the audio module whether Mara is driving. The radio only plays
// while driving; the engine hum also follows this flag.
export function setDriving(isDriving) {
  driving = !!isDriving;
  updateRadioGain();
  updateEngine();
}

// Set the car's normalized speed (0..1). The engine hum pitch follows
// it. Values above 1 are treated as km/h and scaled (top speed ~200).
export function setSpeed(speed) {
  let s = typeof speed === "number" && Number.isFinite(speed) ? speed : 0;
  if (s > 1) s = s / 200;
  speedNorm = Math.max(0, Math.min(1, s));
  updateEngine();
}

// Single per-frame call from main.js: update(driving, speed).
export function update(isDriving, speed) {
  if (typeof isDriving === "boolean") driving = isDriving;
  if (typeof speed === "number") {
    let s = Number.isFinite(speed) ? speed : 0;
    if (s > 1) s = s / 200;
    speedNorm = Math.max(0, Math.min(1, s));
  }
  updateRadioGain();
  updateEngine();
}

// Start or stop the looping police siren (pursuit active / escaped).
export function setSiren(on) {
  setSirenLevel(on);
  return sirenOn;
}

// Play a short police siren burst (about 4 seconds). Use setSiren(true)
// instead for a looping pursuit siren.
export function playSiren() {
  if (!ctx || !unlocked || !sfxGain) return false;
  try {
    startSirenGraph();
    setSirenLevel(true);
    const t = ctx.currentTime;
    if (sirenGain) sirenGain.gain.setTargetAtTime(0.0001, t + 3.5, 0.3);
    setTimeout(() => setSirenLevel(false), 4200);
    return true;
  } catch (e) {
    return false;
  }
}

// Gunshot, different per weapon: pistol (sharp crack), smg (short
// rapid crack), shotgun (deep boom). Unknown names fall back to pistol.
export function playGunshot(weapon) {
  if (!ctx || !unlocked || !sfxGain) return false;
  try {
    const t = ctx.currentTime;
    const name = typeof weapon === "string" ? weapon.toLowerCase() : "pistol";
    if (name === "shotgun") {
      noiseBurst(t, 0.35, "lowpass", 900, 0.9, sfxGain);
      blip(90, t, 0.3, "sine", 0.7, sfxGain);
      noiseBurst(t, 0.12, "highpass", 2500, 0.35, sfxGain);
    } else if (name === "smg") {
      noiseBurst(t, 0.09, "bandpass", 1800, 0.55, sfxGain);
      blip(190, t, 0.07, "square", 0.25, sfxGain);
    } else {
      // pistol
      noiseBurst(t, 0.16, "bandpass", 1400, 0.8, sfxGain);
      blip(150, t, 0.12, "square", 0.4, sfxGain);
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Fist impact: a short low thud.
export function playPunch() {
  if (!ctx || !unlocked || !sfxGain) return false;
  try {
    const t = ctx.currentTime;
    noiseBurst(t, 0.12, "lowpass", 500, 0.7, sfxGain);
    blip(70, t, 0.12, "sine", 0.6, sfxGain);
    return true;
  } catch (e) {
    return false;
  }
}

// Short mission-complete jingle: a bright ascending arpeggio.
export function playJingle() {
  if (!ctx || !unlocked || !sfxGain) return false;
  try {
    const t = ctx.currentTime;
    const notes = [72, 76, 79, 84, 79, 84];
    notes.forEach((midi, i) => {
      blip(midiToFreq(midi), t + i * 0.11, 0.35, "triangle", 0.25, sfxGain);
      blip(midiToFreq(midi - 12), t + i * 0.11, 0.3, "sine", 0.12, sfxGain);
    });
    blip(midiToFreq(84), t + notes.length * 0.11, 0.7, "triangle", 0.2, sfxGain);
    return true;
  } catch (e) {
    return false;
  }
}

// Apply a volume level (0..1), e.g. from the settings menu. Also
// re-reads the saved settings so a change made elsewhere is picked up.
export function setVolume(v) {
  readSettings();
  if (typeof v === "number" && Number.isFinite(v)) {
    volume = Math.max(0, Math.min(1, v));
  }
  applyVolume();
  return volume;
}

// Re-read the saved settings (volume, music on/off) and apply them.
export function applySettings() {
  readSettings();
  applyVolume();
  updateRadioGain();
}

// True once unlockAudio() has created a working AudioContext.
export function isAvailable() {
  return audioAvailable && unlocked;
}

// ---------------------------------------------------------------------
// The module's main export: one object carrying the stations and every
// function above, shaped the way the HUD reads it (opts.audio):
//   audio.getStation() / audio.currentStation / audio.stations +
//   audio.stationIndex, and audio.radioOn === false -> "RADIO OFF".
// ---------------------------------------------------------------------

export const audio = {
  stations: STATIONS,
  get stationIndex() {
    return stationIndex;
  },
  get radioOn() {
    return radioOn;
  },
  get enabled() {
    return audioAvailable;
  },
  get currentStation() {
    return getStation();
  },
  getStation,
  unlockAudio,
  nextStation,
  toggleRadio,
  setRadioOn,
  isRadioOn,
  setDriving,
  setSpeed,
  update,
  setSiren,
  playSiren,
  playGunshot,
  playPunch,
  playJingle,
  setVolume,
  applySettings,
  isAvailable,
};

export default audio;
