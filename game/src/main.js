// NEON TIDE — game/src/main.js
//
// Entry point. Wires every subsystem together in the DESIGN.md order:
// state, city, weather, player, car, camera, traffic, police, combat,
// characters, dialogue, missions, HUD, map, audio, save.
//
// Start screen, pause, BUSTED screen, settings menu, frame loop, and the
// window.__NEON_TIDE_READY__ / window.__NEON_TIDE_DEBUG__ contract live
// here. Every subsystem call is guarded so a missing module, a missing
// DOM id, or a failed factory can never throw at boot.

import * as THREE from 'three';
import { state, START_HEALTH, resetState } from './state.js';
import { createCity } from './city.js';
import { createWeather } from './weather.js';
import { createPlayer } from './player.js';
import { createCars } from './car.js';
import { createChaseCamera } from './camera.js';
import { createTraffic } from './traffic.js';
import { setupPolice } from './police.js';
import { createCombat } from './combat.js';
import { createCharacters } from './characters.js';
import { isDialogueOpen } from './dialogue.js';
import { setupMissions } from './missions.js';
import { createHUD } from './hud.js';
import { setupMap } from './map.js';
import { audio } from './audio.js';
import {
  save as saveGame,
  load as loadSave,
  hasSave,
  onMissionComplete as saveOnMissionComplete,
  getSettings,
  setSettings,
  DEFAULT_SETTINGS,
} from './save.js';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function $(id) {
  try {
    return document.getElementById(id) || null;
  } catch (err) {
    return null;
  }
}

// Run fn, return its result, or return fallback when it throws / is absent.
function safe(fn, fallback) {
  try {
    const out = typeof fn === 'function' ? fn() : fn;
    return out === undefined ? fallback : out;
  } catch (err) {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------

const container = $('game-container') || document.body;

let renderer = null;
let scene = null;
let camera = null;

try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(1280, 720);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const canvas = renderer.domElement;
  canvas.id = 'neon-tide-canvas';
  container.appendChild(canvas);
} catch (err) {
  renderer = null;
}

try {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1440);
  scene.fog = new THREE.Fog(0x4a2350, 120, 520);
} catch (err) {
  scene = null;
}

try {
  camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 1200);
  camera.position.set(-60, 8, 116);
  camera.lookAt(-60, 2, 100);
} catch (err) {
  camera = null;
}

// ---------------------------------------------------------------------------
// Settings (loaded before the subsystems so defaults apply at boot)
// ---------------------------------------------------------------------------

let currentSettings = safe(() => getSettings(), null) || { ...DEFAULT_SETTINGS };

const QUALITY_PIXEL_RATIO = { low: 0.75, medium: 1, high: 2 };
let basePixelRatio = 1;
let livePixelRatio = 1;

function applyPixelRatio(ratio) {
  livePixelRatio = clamp(ratio, 0.5, 2);
  if (renderer) {
    try {
      renderer.setPixelRatio(livePixelRatio);
    } catch (err) {
      /* ignore */
    }
  }
}

function applyQuality() {
  const quality = currentSettings.quality || 'medium';
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  basePixelRatio = Math.min(QUALITY_PIXEL_RATIO[quality] || 1, Math.max(dpr, 1));
  if (quality === 'low') basePixelRatio = 0.75;
  applyPixelRatio(basePixelRatio);
  if (renderer) {
    try {
      renderer.shadowMap.enabled = quality !== 'low';
      renderer.shadowMap.needsUpdate = true;
      if (scene) {
        scene.traverse((child) => {
          if (child && child.material) child.material.needsUpdate = true;
        });
      }
    } catch (err) {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Shared input (one object for the on-foot and driving modules)
// ---------------------------------------------------------------------------

const input = {
  keys: new Set(),
  cameraYaw: Math.PI,
  invertY: !!currentSettings.invertY,
  isDown(code, letter) {
    if (this.keys.has(code)) return true;
    if (letter && this.keys.has(letter)) return true;
    if (letter && this.keys.has('Key' + letter)) return true;
    return false;
  },
};

// ---------------------------------------------------------------------------
// Subsystems — wired in the DESIGN.md order
// ---------------------------------------------------------------------------

// state: imported above (the shared singleton).

const city = scene ? safe(() => createCity(scene), null) : null;

const weather = scene && city ? safe(() => createWeather(scene, city), null) : null;

const player = scene && city ? safe(() => createPlayer(scene, state, input, city), null) : null;

const cars = scene && city
  ? safe(
      () =>
        createCars(scene, city, input, {
          // Stealing a parked car (not Mara's own Zephyr) draws heat.
          onSteal(car) {
            try {
              if (police && typeof police.raiseWanted === 'function') {
                police.raiseWanted(1);
              }
            } catch (err) {
              /* ignore */
            }
          },
        }),
      null,
    )
  : null;

const chaseCam = camera ? safe(() => createChaseCamera(camera), null) : null;
if (chaseCam && city && Array.isArray(city.collisionBoxes)) {
  safe(() => chaseCam.setCollisionBoxes(city.collisionBoxes));
}

const traffic = scene && city ? safe(() => createTraffic(scene, city, state), null) : null;
if (traffic && player && typeof traffic.setPlayer === 'function') {
  safe(() => traffic.setPlayer(player));
}

let bustedShown = false;
let started = false;
let paused = false;
let storyComplete = false;
const playedCutscenes = new Set();
let cutsceneCam = null; // { position: {x,y,z}, lookAt: {x,y,z} } while a cutscene plays

function showBusted(reason) {
  if (bustedShown) return;
  bustedShown = true;
  const reasonEl = $('busted-reason');
  if (reasonEl && reason) reasonEl.textContent = reason;
  const screen = $('busted-screen');
  if (screen) screen.classList.remove('hidden');
}

const police = scene && city && player && cars
  ? safe(
      () =>
        setupPolice(scene, city, player, cars, {
          state,
          onBusted() {
            showBusted('The Marigold Harbor Police caught up with you.');
          },
        }),
      null,
    )
  : null;

const combat = scene && player && police
  ? safe(() => createCombat(scene, player, police, { audio, input }), null)
  : null;

const characters = scene ? safe(() => createCharacters(scene), null) : null;

// Missions need the characters for briefings and cutscenes, plus the
// callbacks that drive saves, the next mission, and cutscene cameras.
let missions = null;
function startMissionWithCutscene(index) {
  if (!missions) return;
  let cut = null;
  try {
    cut = missions.getCutsceneForMission(index);
  } catch (err) {
    cut = null;
  }
  if (cut && !playedCutscenes.has(cut)) {
    playedCutscenes.add(cut);
    const startedCut = safe(() => {
      missions.playCutscene(cut, () => {
        cutsceneCam = null;
        safe(() => missions.startMission(index));
      });
      return true;
    }, false);
    if (startedCut) return;
  }
  safe(() => missions.startMission(index));
}

if (state && city && player && cars && police) {
  missions = safe(
    () =>
      setupMissions(state, city, player, cars, police, {
        characters,
        onSave() {
          safe(() => saveGame());
        },
        onMissionStart() {
          /* briefing dialogue is shown by the missions module itself */
        },
        onMissionComplete(mission) {
          try {
            if (audio && typeof audio.playJingle === 'function') audio.playJingle();
          } catch (err) {
            /* ignore */
          }
          try {
            if (combat && typeof combat.refillAmmo === 'function') combat.refillAmmo();
          } catch (err) {
            /* ignore */
          }
          safe(() => saveOnMissionComplete());
          // Advance to the next mission (the finale cutscene plays
          // internally for mission 8, then onGameComplete fires).
          if (mission && mission.id < 8) {
            startMissionWithCutscene(state.missionIndex || 0);
          }
        },
        onMissionFailed() {
          showBusted('The job went wrong — the Marigold Harbor Police caught up with you.');
        },
        onSideJobComplete() {
          try {
            if (audio && typeof audio.playJingle === 'function') audio.playJingle();
          } catch (err) {
            /* ignore */
          }
          safe(() => saveGame());
        },
        onCutsceneShot(shot) {
          // Move the camera to the cutscene's scripted framing.
          if (shot && shot.camera && shot.camera.position && shot.camera.lookAt) {
            cutsceneCam = shot.camera;
          }
        },
        onGameComplete() {
          cutsceneCam = null;
          storyComplete = true;
          try {
            if (audio && typeof audio.playJingle === 'function') audio.playJingle();
          } catch (err) {
            /* ignore */
          }
          safe(() => saveGame());
        },
      }),
    null,
  );
}

const hud = city && police
  ? safe(
      () =>
        createHUD(city, police, {
          state,
          player,
          car: cars,
          missions,
          audio,
          playerPosition: () => (player ? player.position : null),
        }),
      null,
    )
  : null;

const gameMap = city && police
  ? safe(
      () =>
        setupMap(city, police, missions, {
          player,
          getPlayerPosition: () => (player ? player.position : null),
          onNewGame: () => startNewGame(),
          onContinue: () => continueGame(),
          onSettings: () => openSettings(null),
        }),
      null,
    )
  : null;

// Audio unlocks on the first user gesture (see the listeners below).
safe(() => {
  if (audio && typeof audio.applySettings === 'function') audio.applySettings();
});

// ---------------------------------------------------------------------------
// HUD visibility (settings: showHUD / minimap)
// ---------------------------------------------------------------------------

function applyHudVisibility() {
  if (!hud || !hud.element) return;
  try {
    hud.element.style.display = currentSettings.showHUD === false ? 'none' : '';
    const minimap = hud.element.querySelector('#hud-minimap');
    if (minimap) {
      minimap.style.display = currentSettings.minimap === false ? 'none' : '';
    }
  } catch (err) {
    /* ignore */
  }
}

function applyCameraDefault() {
  if (!chaseCam || typeof chaseCam.getMode !== 'function') return;
  const wanted = currentSettings.cameraMode === 'far' ? 'far' : 'near';
  try {
    if (chaseCam.getMode() !== wanted && typeof chaseCam.toggleMode === 'function') {
      chaseCam.toggleMode();
    }
  } catch (err) {
    /* ignore */
  }
}

function applySettingsToGame() {
  input.invertY = !!currentSettings.invertY;
  applyQuality();
  applyHudVisibility();
  applyCameraDefault();
  safe(() => {
    if (audio && typeof audio.setVolume === 'function') {
      audio.setVolume(currentSettings.volume);
    }
    if (audio && typeof audio.applySettings === 'function') audio.applySettings();
  });
}

// ---------------------------------------------------------------------------
// Overlays: start screen, settings, pause, BUSTED
// ---------------------------------------------------------------------------

function hideOverlays() {
  for (const id of ['start-screen', 'settings-overlay', 'pause-overlay', 'busted-screen']) {
    const el = $(id);
    if (el) el.classList.add('hidden');
  }
}

function refreshStartScreen() {
  const btnContinue = $('btn-continue');
  if (btnContinue) {
    btnContinue.disabled = !safe(() => hasSave(), false);
  }
}

let settingsReturn = null; // element to show again when settings close

function openSettings(returnEl) {
  settingsReturn = returnEl || null;
  syncSettingsUI();
  const overlay = $('settings-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function closeSettings() {
  const overlay = $('settings-overlay');
  if (overlay) overlay.classList.add('hidden');
  if (settingsReturn) {
    settingsReturn.classList.remove('hidden');
    settingsReturn = null;
  } else if (!started) {
    const start = $('start-screen');
    if (start) start.classList.remove('hidden');
  }
}

function syncSettingsUI() {
  const s = currentSettings;
  const setVal = (id, value) => {
    const el = $(id);
    if (el) el.value = value;
  };
  const setChecked = (id, value) => {
    const el = $(id);
    if (el) el.checked = !!value;
  };
  setVal('settings-volume', Math.round((s.volume ?? 0.8) * 100));
  const volLabel = $('settings-volume-value');
  if (volLabel) volLabel.textContent = Math.round((s.volume ?? 0.8) * 100) + '%';
  setChecked('settings-music', s.music !== false);
  setVal('settings-camera', s.cameraMode === 'far' ? 'far' : 'near');
  setChecked('settings-hud', s.showHUD !== false);
  setChecked('settings-minimap', s.minimap !== false);
  setVal('settings-quality', s.quality || 'medium');
  setChecked('settings-autodownscale', s.autoDownscale !== false);
  setChecked('settings-inverty', !!s.invertY);
}

function patchSettings(patch) {
  currentSettings = safe(() => setSettings(patch), currentSettings) || currentSettings;
  applySettingsToGame();
}

function bindSettingsControls() {
  const on = (id, event, fn) => {
    const el = $(id);
    if (el) el.addEventListener(event, fn);
  };
  on('settings-volume', 'input', (e) => {
    const v = clamp(Number(e.target.value) / 100, 0, 1);
    const label = $('settings-volume-value');
    if (label) label.textContent = Math.round(v * 100) + '%';
    patchSettings({ volume: v });
  });
  on('settings-music', 'change', (e) => patchSettings({ music: !!e.target.checked }));
  on('settings-camera', 'change', (e) => patchSettings({ cameraMode: e.target.value }));
  on('settings-hud', 'change', (e) => patchSettings({ showHUD: !!e.target.checked }));
  on('settings-minimap', 'change', (e) => patchSettings({ minimap: !!e.target.checked }));
  on('settings-quality', 'change', (e) => patchSettings({ quality: e.target.value }));
  on('settings-autodownscale', 'change', (e) => patchSettings({ autoDownscale: !!e.target.checked }));
  on('settings-inverty', 'change', (e) => patchSettings({ invertY: !!e.target.checked }));
  on('settings-close', 'click', () => closeSettings());
  on('settings-reset', 'click', () => {
    currentSettings = safe(() => setSettings({ ...DEFAULT_SETTINGS }), currentSettings) || {
      ...DEFAULT_SETTINGS,
    };
    syncSettingsUI();
    applySettingsToGame();
  });
}

function setPaused(value) {
  if (!started || bustedShown) return;
  paused = !!value;
  const overlay = $('pause-overlay');
  if (overlay) overlay.classList.toggle('hidden', !paused);
}

function respawnAtSafehouse() {
  try {
    if (cars && typeof cars.exitCar === 'function') cars.exitCar();
  } catch (err) {
    /* ignore */
  }
  try {
    if (player && typeof player.exitCar === 'function') player.exitCar();
  } catch (err) {
    /* ignore */
  }
  try {
    if (player && player.position && city && city.spawn) {
      player.position.set(city.spawn.x || 0, 0, city.spawn.z || 0);
    }
  } catch (err) {
    /* ignore */
  }
}

function retryAfterBusted() {
  const screen = $('busted-screen');
  if (screen) screen.classList.add('hidden');
  bustedShown = false;
  // Health to full — in the state object; the player object mirrors
  // state.health through its getter, so this resets both at once.
  try {
    state.health = START_HEALTH;
  } catch (err) {
    /* ignore */
  }
  try {
    state.isBusted = false;
    state.wanted = 0;
  } catch (err) {
    /* ignore */
  }
  try {
    if (police && typeof police.reset === 'function') police.reset();
  } catch (err) {
    /* ignore */
  }
  respawnAtSafehouse();
  // Restart the failed mission. failMission() itself restores health and
  // clears the busted flag; if it throws part-way, restart the current
  // mission directly so the game is never left in a failed state.
  if (missions) {
    const restarted = safe(() => {
      if (missions.getStatus() === 'failed') {
        missions.failMission();
        return missions.getStatus() !== 'failed';
      }
      return true;
    }, false);
    if (!restarted) {
      safe(() => missions.startCurrent());
    }
  }
  paused = false;
}

function startNewGame() {
  try {
    resetState();
  } catch (err) {
    /* ignore */
  }
  try {
    if (missions && typeof missions.reset === 'function') missions.reset();
  } catch (err) {
    /* ignore */
  }
  try {
    if (police && typeof police.reset === 'function') police.reset();
  } catch (err) {
    /* ignore */
  }
  try {
    if (cars && typeof cars.repair === 'function') cars.repair();
  } catch (err) {
    /* ignore */
  }
  try {
    if (characters && typeof characters.hideAll === 'function') characters.hideAll();
  } catch (err) {
    /* ignore */
  }
  playedCutscenes.clear();
  storyComplete = false;
  bustedShown = false;
  paused = false;
  hideOverlays();
  started = true;
  // Mara begins mission 1 in her Zephyr RS at the safehouse spawn.
  try {
    if (player && cars && cars.playerCar) player.enterCar(cars.playerCar);
  } catch (err) {
    /* ignore */
  }
  applySettingsToGame();
  startMissionWithCutscene(0);
  safe(() => saveGame());
  refreshStartScreen();
}

function continueGame() {
  const loaded = safe(() => loadSave(), undefined);
  if (loaded === undefined && !safe(() => hasSave(), false)) {
    startNewGame();
    return;
  }
  playedCutscenes.clear();
  storyComplete = (state.missionIndex || 0) >= 8;
  bustedShown = false;
  paused = false;
  hideOverlays();
  started = true;
  // Restore Mara's driving state from the save. A saved on-foot Mara
  // stands at the spawn; the Zephyr is detached so it never drives off
  // on its own while she walks.
  try {
    if (state.inCar) {
      if (player && cars && cars.playerCar) player.enterCar(cars.playerCar);
    } else {
      if (cars && typeof cars.exitCar === 'function') cars.exitCar();
      if (player && player.position && city && city.spawn) {
        player.position.set(city.spawn.x || 0, 0, city.spawn.z || 0);
      }
    }
  } catch (err) {
    /* ignore */
  }
  try {
    state.isBusted = false;
  } catch (err) {
    /* ignore */
  }
  applySettingsToGame();
  if ((state.missionIndex || 0) >= 8) {
    // Story already complete: free roam, no mission to start.
    storyComplete = true;
  } else {
    startMissionWithCutscene(state.missionIndex || 0);
  }
  refreshStartScreen();
}

function quitToTitle() {
  started = false;
  paused = false;
  bustedShown = false;
  hideOverlays();
  refreshStartScreen();
  const start = $('start-screen');
  if (start) start.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Car enter / exit (F key)
// ---------------------------------------------------------------------------

function pressF() {
  if (!started || paused || bustedShown || isDialogueOpen()) return;
  if (!player || !cars) return;
  try {
    if (state.inCar) {
      // Exit the car (or the speedboat) and step out on foot.
      try {
        cars.exitCar();
      } catch (err) {
        /* ignore */
      }
      try {
        player.exitCar();
      } catch (err) {
        /* ignore */
      }
      return;
    }
    const p = player.position;
    if (!p) return;
    // Board the speedboat near the harbor dock.
    if (cars.boat) {
      const dBoat = Math.hypot((cars.boat.x || 0) - p.x, (cars.boat.z || 0) - p.z);
      if (dBoat < 5) {
        const boarded = safe(() => cars.boardBoat(p), false);
        if (boarded) {
          try {
            player.enterCar(cars.boat);
          } catch (err) {
            /* ignore */
          }
        }
        return;
      }
    }
    // Steal the nearest parked car (raises wanted by 1 via onSteal).
    const near = safe(() => cars.nearestStealable(p, 4), null);
    if (near) {
      try {
        cars.stealCar(near);
      } catch (err) {
        /* ignore */
      }
      try {
        player.enterCar(near);
      } catch (err) {
        /* ignore */
      }
      return;
    }
    // Her own Zephyr RS: enter without drawing heat.
    if (cars.playerCar) {
      const dOwn = Math.hypot((cars.playerCar.x || 0) - p.x, (cars.playerCar.z || 0) - p.z);
      if (dOwn < 4) {
        try {
          cars.stealCar(cars.playerCar);
        } catch (err) {
          /* ignore */
        }
        try {
          player.enterCar(cars.playerCar);
        } catch (err) {
          /* ignore */
        }
      }
    }
  } catch (err) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Keyboard / mouse
// ---------------------------------------------------------------------------

function unlockAudioOnce() {
  safe(() => {
    if (audio && typeof audio.unlockAudio === 'function') audio.unlockAudio();
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    unlockAudioOnce();
    if (!e || !e.code) return;
    input.keys.add(e.code);
    if (e.repeat) return;

    // Enter starts the game from the title screen (dialogue handles its
    // own Enter key in the capture phase before this runs).
    if (e.code === 'Enter' && !started) {
      if (safe(() => hasSave(), false)) continueGame();
      else startNewGame();
      return;
    }
    if (!started) return;
    if (isDialogueOpen()) return;

    // Escape pauses. The map's own capture-phase handler runs first and
    // stops the event when the map is open, so closing the map never
    // also pauses the game.
    if (e.code === 'Escape') {
      if (bustedShown) return;
      setPaused(!paused);
      return;
    }
    if (paused || bustedShown) return;

    switch (e.code) {
      case 'KeyF':
        pressF();
        break;
      case 'KeyE':
        if (combat && typeof combat.punch === 'function') {
          safe(() => combat.punch());
        }
        break;
      case 'Digit1':
        if (combat && typeof combat.selectWeapon === 'function') {
          safe(() => combat.selectWeapon('pistol'));
        }
        break;
      case 'Digit2':
        if (combat && typeof combat.selectWeapon === 'function') {
          safe(() => combat.selectWeapon('smg'));
        }
        break;
      case 'Digit3':
        if (combat && typeof combat.selectWeapon === 'function') {
          safe(() => combat.selectWeapon('shotgun'));
        }
        break;
      case 'KeyQ':
        if (combat && typeof combat.selectWeapon === 'function') {
          safe(() => combat.selectWeapon('fists'));
        }
        break;
      case 'KeyR':
        safe(() => {
          if (audio && typeof audio.nextStation === 'function') audio.nextStation();
        });
        break;
      case 'KeyT':
        safe(() => {
          if (audio && typeof audio.toggleRadio === 'function') audio.toggleRadio();
        });
        break;
      case 'KeyV':
        if (chaseCam && typeof chaseCam.toggleMode === 'function') {
          safe(() => chaseCam.toggleMode());
        }
        break;
      default:
        break;
    }
    // Note: M is handled by map.js itself (capture phase, stops
    // propagation), so main.js deliberately never handles it.
  });

  window.addEventListener('keyup', (e) => {
    if (e && e.code) input.keys.delete(e.code);
  });

  window.addEventListener('pointerdown', () => unlockAudioOnce(), true);

  window.addEventListener('resize', () => {
    if (!renderer || !camera) return;
    try {
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 720;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    } catch (err) {
      /* ignore */
    }
  });
}

// Mouse: click shoots, press-and-hold aims. Listeners sit on the canvas
// only, so clicks on menus and buttons never fire a shot.
if (renderer && renderer.domElement) {
  renderer.domElement.addEventListener('pointerdown', (e) => {
    unlockAudioOnce();
    if (!started || paused || bustedShown || isDialogueOpen()) return;
    if (gameMap && typeof gameMap.isMapOpen === 'function' && safe(() => gameMap.isMapOpen(), false)) {
      return;
    }
    if (e.button === 0) {
      safe(() => {
        if (player && typeof player.aim === 'function') player.aim(true);
      });
      safe(() => {
        if (combat && typeof combat.shoot === 'function') combat.shoot();
      });
    }
  });
  renderer.domElement.addEventListener('pointerup', () => {
    safe(() => {
      if (player && typeof player.aim === 'function') player.aim(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Start screen / pause / BUSTED buttons
// ---------------------------------------------------------------------------

function bindButton(id, fn) {
  const el = $(id);
  if (el) el.addEventListener('click', () => {
    unlockAudioOnce();
    fn();
  });
}

bindButton('btn-new-game', () => startNewGame());
bindButton('btn-continue', () => continueGame());
bindButton('btn-settings', () => openSettings($('start-screen')));
bindButton('btn-resume', () => setPaused(false));
bindButton('btn-pause-settings', () => openSettings($('pause-overlay')));
bindButton('btn-pause-quit', () => quitToTitle());
bindButton('btn-retry', () => retryAfterBusted());
bindButton('btn-busted-title', () => {
  const screen = $('busted-screen');
  if (screen) screen.classList.add('hidden');
  bustedShown = false;
  quitToTitle();
});
bindSettingsControls();

// ---------------------------------------------------------------------------
// Boot: apply settings, show the title screen, start the frame loop
// ---------------------------------------------------------------------------

applySettingsToGame();
refreshStartScreen();

if (weather && camera && typeof weather.setCamera === 'function') {
  safe(() => weather.setCamera(camera));
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();
const _camDir = new THREE.Vector3();
let emaDt = 1 / 60;
let frameCount = 0;

function animate() {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(animate);
  }
  const rawDt = safe(() => clock.getDelta(), 0.016);
  const dt = clamp(typeof rawDt === 'number' ? rawDt : 0.016, 0, 0.05);

  // Auto-downscale: ease the pixel ratio down when frames run slow, and
  // back up toward the quality target when the game runs smoothly.
  emaDt = emaDt * 0.95 + dt * 0.05;
  frameCount += 1;
  if (frameCount % 90 === 0 && currentSettings.autoDownscale !== false) {
    const fps = emaDt > 0 ? 1 / emaDt : 60;
    if (fps < 42 && livePixelRatio > 0.5) {
      applyPixelRatio(livePixelRatio - 0.25);
    } else if (fps > 57 && livePixelRatio < basePixelRatio) {
      applyPixelRatio(livePixelRatio + 0.25);
    }
  }

  const dialogueOpen = safe(() => isDialogueOpen(), false);
  const mapOpen = gameMap && typeof gameMap.isMapOpen === 'function'
    ? safe(() => gameMap.isMapOpen(), false)
    : false;
  const worldFrozen = !started || paused || bustedShown || dialogueOpen || mapOpen;

  if (!worldFrozen) {
    safe(() => weather && weather.update(dt, camera));
    safe(() => city && typeof city.update === 'function' && city.update(dt));
    safe(() => player && player.update(dt));
    safe(() => cars && cars.update(dt));
    safe(() => traffic && traffic.update(dt));
    safe(() => police && police.update(dt));
    safe(() => combat && combat.update(dt));
    safe(() => missions && missions.update(dt));
  }

  // Camera: a scripted cutscene framing wins while its dialogue is open;
  // otherwise the chase camera follows Mara (or her car) every frame.
  if (cutsceneCam && dialogueOpen) {
    try {
      camera.position.set(
        cutsceneCam.position.x,
        cutsceneCam.position.y,
        cutsceneCam.position.z,
      );
      camera.lookAt(cutsceneCam.lookAt.x, cutsceneCam.lookAt.y, cutsceneCam.lookAt.z);
    } catch (err) {
      cutsceneCam = null;
    }
  } else {
    if (!dialogueOpen) cutsceneCam = null;
    safe(() => {
      if (!chaseCam || !camera) return;
      const target =
        state.inCar && cars && cars.currentCar ? cars.currentCar : player;
      const heli =
        police && typeof police.getHeli === 'function' ? police.getHeli() : null;
      const speed = cars ? cars.speedKmh || 0 : 0;
      chaseCam.update(target, heli, dt, speed);
    });
  }

  // Keep WASD relative to the camera for the next frame.
  safe(() => {
    if (!camera) return;
    camera.getWorldDirection(_camDir);
    input.cameraYaw = Math.atan2(-_camDir.x, -_camDir.z);
  });

  safe(() => hud && hud.update(dt));
  if (mapOpen) safe(() => gameMap.updateMap());

  // Audio follows the driving state and the pursuit.
  safe(() => {
    if (!audio) return;
    const driving = !!(cars && cars.isDriving);
    const speedKmh = cars ? cars.speedKmh || 0 : 0;
    if (typeof audio.setDriving === 'function') audio.setDriving(driving);
    if (typeof audio.setSpeed === 'function') audio.setSpeed(speedKmh);
    if (typeof audio.setSiren === 'function') {
      const pursued =
        police && typeof police.isPursued === 'function' ? police.isPursued() : false;
      audio.setSiren(!!pursued);
    }
    if (typeof audio.update === 'function') audio.update(driving, speedKmh);
  });

  // BUSTED can also arrive through the state flag (police sets it before
  // its callback fires); the flag guard keeps the screen to one showing.
  if (started && state.isBusted && !bustedShown) {
    showBusted('The Marigold Harbor Police caught up with you.');
  }

  safe(() => {
    if (renderer && scene && camera) renderer.render(scene, camera);
  });
}

if (renderer && scene && camera) {
  animate();
}

// ---------------------------------------------------------------------------
// Debug contract (for testing / screenshots)
// ---------------------------------------------------------------------------

try {
  window.__NEON_TIDE_DEBUG__ = {
    state,
    city,
    weather,
    player,
    cars,
    camera: chaseCam,
    threeCamera: camera,
    traffic,
    police,
    combat,
    characters,
    missions,
    hud,
    map: gameMap,
    audio,
    renderer,
    scene,
    input,
    get settings() {
      return currentSettings;
    },
    get started() {
      return started;
    },
    get paused() {
      return paused;
    },
    get storyComplete() {
      return storyComplete;
    },
    startNewGame,
    continueGame,
    quitToTitle,
    retryAfterBusted,
    pressF,
    setPaused,
  };
  window.__NEON_TIDE_READY__ = !!(renderer && scene && camera);
} catch (err) {
  try {
    window.__NEON_TIDE_READY__ = false;
  } catch (ignored) {
    /* ignore */
  }
}
