// weather.js — day/dusk/night cycle and occasional rain over Port Marigold.
//
// Depends only on the scene and the city object. The city exposes no
// handles to its sky, sun, lamps or neon, so this module discovers them by
// walking the scene graph (directional light, hemisphere light, the sky
// shader dome, the sun disc, lamp-head and neon materials, road
// materials). Every handle is optional: if one is missing the module
// simply skips that element and never throws.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Time-of-day keyframes. t runs 0 (midnight) -> 1 (midnight again);
// 0.25 is dawn, 0.5 is noon, 0.75 is dusk (the permanent sunset default).
// ---------------------------------------------------------------------------

const KEY = {
  day: {
    top: 0x2f6fd0, mid: 0x7fb2e8, horizon: 0xd8ecff, sun: 0xfff2c0,
    light: 0xfff0d0, fog: 0x9fc3e0, bg: 0x8fb8dd, cloud: 0xffffff,
    sunIntensity: 2.6, hemiIntensity: 1.2, lamp: 0.4, neon: 0.8, cloudOpacity: 0.5,
  },
  dusk: {
    top: 0x1b1440, mid: 0x8a2a6d, horizon: 0xff7a2a, sun: 0xffd27a,
    light: 0xffb36b, fog: 0x4a2350, bg: 0x2a1440, cloud: 0xffb8c8,
    sunIntensity: 2.2, hemiIntensity: 0.9, lamp: 2.4, neon: 2.6, cloudOpacity: 0.32,
  },
  night: {
    top: 0x050514, mid: 0x0d0a2e, horizon: 0x1a1030, sun: 0x8a7fd0,
    light: 0x5a6fd0, fog: 0x0a0618, bg: 0x05030f, cloud: 0x2a2440,
    sunIntensity: 0.35, hemiIntensity: 0.35, lamp: 3.2, neon: 3.4, cloudOpacity: 0.18,
  },
};

// The western horizon direction the city's sunset sun sits on.
const BASE_AZIMUTH = new THREE.Vector3(-0.62, 0, -0.28).normalize();

const RAIN_COUNT = 700;
const RAIN_TOP = 130;
const RAIN_SPAN = 260;

const _cA = new THREE.Color();
const _cB = new THREE.Color();
const _cC = new THREE.Color();
const _dir = new THREE.Vector3();

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp3(out, dayHex, duskHex, nightHex, wDay, wDusk, wNight) {
  _cA.set(dayHex);
  _cB.set(duskHex);
  _cC.set(nightHex);
  out.setRGB(
    _cA.r * wDay + _cB.r * wDusk + _cC.r * wNight,
    _cA.g * wDay + _cB.g * wDusk + _cC.g * wNight,
    _cA.b * wDay + _cB.b * wDusk + _cC.b * wNight
  );
  return out;
}

function lerpNum(day, dusk, night, wDay, wDusk, wNight) {
  return day * wDay + dusk * wDusk + night * wNight;
}

export function createWeather(scene, city) {
  let timeOfDay = 0.75; // permanent sunset by default
  let driftMode = true; // drift slowly between dusk and night until set
  let driftDir = 1; // 1 = towards night, -1 = back towards dusk
  let raining = false;
  let manualHold = 0; // seconds the auto scheduler leaves a manual setRain alone
  let spellTimer = 30 + Math.random() * 30; // first dry spell
  let camera = null;

  // --- discovered scene handles (all optional) -----------------------------
  const handles = {
    sunLight: null,
    hemiLight: null,
    skyUniforms: null,
    sunDisc: null,
    sunDiscMat: null,
    lampMats: [],
    neonMats: [],
    roadMats: [],
    cloudMats: [],
  };

  function discover() {
    if (!scene || typeof scene.traverse !== 'function') return;
    const lampSet = new Set();
    const neonSet = new Set();
    const roadSet = new Set();
    const cloudSet = new Set();
    try {
      scene.traverse((obj) => {
        if (obj.isDirectionalLight && !handles.sunLight) handles.sunLight = obj;
        if (obj.isHemisphereLight && !handles.hemiLight) handles.hemiLight = obj;
        const mat = obj.material;
        if (mat && mat.isShaderMaterial && mat.uniforms
          && mat.uniforms.topColor && mat.uniforms.midColor
          && mat.uniforms.horizonColor && mat.uniforms.sunDirection
          && mat.uniforms.sunColor) {
          handles.skyUniforms = mat.uniforms;
        }
        if (obj.geometry && obj.geometry.type === 'CircleGeometry' && !handles.sunDisc) {
          handles.sunDisc = obj;
          handles.sunDiscMat = mat || null;
        }
        if (!mat) return;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const m of mats) {
          if (!m) continue;
          // Streetlamp heads: shared material with warm emissive 0xffb347.
          if (m.emissive && typeof m.emissive.getHex === 'function'
            && m.emissive.getHex() === 0xffb347) lampSet.add(m);
          // Neon signs: white emissive driven by an emissiveMap texture.
          if (m.emissiveMap && m.emissive && typeof m.emissive.getHex === 'function'
            && m.emissive.getHex() === 0xffffff) neonSet.add(m);
          // Clouds: shared pink basic material.
          if (m.isMeshBasicMaterial && m.color && typeof m.color.getHex === 'function'
            && m.color.getHex() === 0xffb8c8) cloudSet.add(m);
          // Roads: flat planes sitting at y = 0.05 with the asphalt material.
          if (obj.geometry && obj.geometry.type === 'PlaneGeometry'
            && Math.abs(obj.position.y - 0.05) < 0.01
            && m.isMeshStandardMaterial) roadSet.add(m);
        }
      });
    } catch (err) {
      // Discovery must never break the game; missing handles just degrade.
    }
    handles.lampMats = Array.from(lampSet);
    handles.neonMats = Array.from(neonSet);
    handles.roadMats = Array.from(roadSet);
    handles.cloudMats = Array.from(cloudSet);
  }

  // --- rain ----------------------------------------------------------------
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_COUNT * 6); // top + bottom vertex per streak
  const rainSpeed = new Float32Array(RAIN_COUNT);
  const rainX = new Float32Array(RAIN_COUNT);
  const rainY = new Float32Array(RAIN_COUNT);
  const rainZ = new Float32Array(RAIN_COUNT);

  function resetStreak(i, top) {
    rainX[i] = (Math.random() * 2 - 1) * RAIN_SPAN;
    rainZ[i] = (Math.random() * 2 - 1) * RAIN_SPAN;
    rainY[i] = top ? RAIN_TOP + Math.random() * 20 : Math.random() * RAIN_TOP;
    rainSpeed[i] = 55 + Math.random() * 25;
  }

  for (let i = 0; i < RAIN_COUNT; i++) resetStreak(i, false);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0x9fb8d8, transparent: true, opacity: 0.35, fog: true,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.visible = false;
  rain.frustumCulled = false;
  try {
    if (scene && typeof scene.add === 'function') scene.add(rain);
  } catch (err) { /* rain stays invisible; never throws */ }

  function writeRainPositions() {
    for (let i = 0; i < RAIN_COUNT; i++) {
      const o = i * 6;
      rainPos[o] = rainX[i];
      rainPos[o + 1] = rainY[i];
      rainPos[o + 2] = rainZ[i];
      rainPos[o + 3] = rainX[i] - 0.12;
      rainPos[o + 4] = rainY[i] - 1.5;
      rainPos[o + 5] = rainZ[i];
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  function applyWetRoads(wet) {
    for (const m of handles.roadMats) {
      try {
        if (wet) {
          m.roughness = 0.08;
          m.metalness = 0.55;
        } else {
          m.roughness = 0.35;
          m.metalness = 0.15;
        }
        m.needsUpdate = true;
      } catch (err) { /* skip a stubborn material */ }
    }
    try {
      if (scene && scene.fog) {
        if (wet) {
          scene.fog.near = 100;
          scene.fog.far = 550;
        } else {
          scene.fog.near = 150;
          scene.fog.far = 750;
        }
      }
    } catch (err) { /* no fog to adjust */ }
  }

  // --- time of day ----------------------------------------------------------
  function applyTime() {
    const s = Math.sin((timeOfDay - 0.25) * Math.PI * 2); // -1 night .. 1 noon
    const wDay = clamp01(s);
    const wNight = clamp01(-s);
    const wDusk = 1 - Math.abs(s);
    const rainDim = raining ? 0.72 : 1;

    // Sun direction: fixed western azimuth, elevation follows the cycle.
    const horiz = Math.sqrt(Math.max(0, 1 - s * s));
    _dir.set(BASE_AZIMUTH.x * horiz, s, BASE_AZIMUTH.z * horiz).normalize();

    if (handles.sunLight) {
      try {
        handles.sunLight.position.copy(_dir).multiplyScalar(320);
        handles.sunLight.color.copy(
          lerp3(_cA, KEY.day.light, KEY.dusk.light, KEY.night.light, wDay, wDusk, wNight)
        );
        handles.sunLight.intensity = lerpNum(
          KEY.day.sunIntensity, KEY.dusk.sunIntensity, KEY.night.sunIntensity,
          wDay, wDusk, wNight
        ) * rainDim;
      } catch (err) { /* skip */ }
    }
    if (handles.hemiLight) {
      try {
        handles.hemiLight.intensity = lerpNum(
          KEY.day.hemiIntensity, KEY.dusk.hemiIntensity, KEY.night.hemiIntensity,
          wDay, wDusk, wNight
        ) * (raining ? 0.85 : 1);
      } catch (err) { /* skip */ }
    }
    if (handles.skyUniforms) {
      try {
        const u = handles.skyUniforms;
        lerp3(u.topColor.value, KEY.day.top, KEY.dusk.top, KEY.night.top, wDay, wDusk, wNight);
        lerp3(u.midColor.value, KEY.day.mid, KEY.dusk.mid, KEY.night.mid, wDay, wDusk, wNight);
        lerp3(u.horizonColor.value, KEY.day.horizon, KEY.dusk.horizon, KEY.night.horizon, wDay, wDusk, wNight);
        lerp3(u.sunColor.value, KEY.day.sun, KEY.dusk.sun, KEY.night.sun, wDay, wDusk, wNight);
        u.sunDirection.value.copy(_dir);
      } catch (err) { /* skip */ }
    }
    if (handles.sunDisc) {
      try {
        handles.sunDisc.position.copy(_dir).multiplyScalar(820);
        handles.sunDisc.lookAt(0, 0, 0);
        handles.sunDisc.visible = s > -0.03;
        if (handles.sunDiscMat && handles.sunDiscMat.color) {
          handles.sunDiscMat.color.copy(
            lerp3(_cA, 0xfff6c8, 0xffe9a8, 0xffe9a8, wDay, wDusk, wNight)
          );
        }
      } catch (err) { /* skip */ }
    }
    for (const m of handles.lampMats) {
      try {
        m.emissiveIntensity = lerpNum(KEY.day.lamp, KEY.dusk.lamp, KEY.night.lamp, wDay, wDusk, wNight);
      } catch (err) { /* skip */ }
    }
    for (const m of handles.neonMats) {
      try {
        m.emissiveIntensity = lerpNum(KEY.day.neon, KEY.dusk.neon, KEY.night.neon, wDay, wDusk, wNight);
      } catch (err) { /* skip */ }
    }
    for (const m of handles.cloudMats) {
      try {
        m.color.copy(
          lerp3(_cA, KEY.day.cloud, KEY.dusk.cloud, KEY.night.cloud, wDay, wDusk, wNight)
        );
        m.opacity = lerpNum(
          KEY.day.cloudOpacity, KEY.dusk.cloudOpacity, KEY.night.cloudOpacity,
          wDay, wDusk, wNight
        );
      } catch (err) { /* skip */ }
    }
    try {
      if (scene && scene.fog && scene.fog.color) {
        scene.fog.color.copy(
          lerp3(_cA, KEY.day.fog, KEY.dusk.fog, KEY.night.fog, wDay, wDusk, wNight)
        );
      }
      if (scene && scene.background && scene.background.isColor) {
        scene.background.copy(
          lerp3(_cA, KEY.day.bg, KEY.dusk.bg, KEY.night.bg, wDay, wDusk, wNight)
        );
      }
    } catch (err) { /* skip */ }
  }

  // --- public API -----------------------------------------------------------
  function setTimeOfDay(t) {
    timeOfDay = clamp01(typeof t === 'number' && isFinite(t) ? t : 0.75);
    driftMode = false; // the caller took over the clock
    applyTime();
  }

  function setRain(on) {
    raining = !!on;
    manualHold = 25; // let the manual choice stand before auto rain resumes
    try {
      rain.visible = raining;
    } catch (err) { /* skip */ }
    applyWetRoads(raining);
    applyTime(); // rain dims the sun a little
  }

  function setCamera(cam) {
    camera = cam || null;
  }

  function update(dt, cam) {
    const step = Math.min(Math.max(typeof dt === 'number' && isFinite(dt) ? dt : 0, 0), 0.1);
    if (cam) camera = cam;

    // Re-discover once if the first pass found nothing (e.g. city built late).
    if (!handles.sunLight && !handles.skyUniforms) discover();

    // Slow drift between dusk (0.75) and deep night (0.98) until set.
    if (driftMode) {
      timeOfDay += driftDir * step * 0.0009;
      if (timeOfDay >= 0.98) {
        timeOfDay = 0.98;
        driftDir = -1;
      } else if (timeOfDay <= 0.72) {
        timeOfDay = 0.72;
        driftDir = 1;
      }
    }

    // Occasional rain: long dry spells, short wet spells (rain minority).
    if (manualHold > 0) {
      manualHold -= step;
    } else {
      spellTimer -= step;
      if (spellTimer <= 0) {
        if (raining) {
          setRain(false);
          spellTimer = 25 + Math.random() * 45;
        } else {
          setRain(true);
          spellTimer = 8 + Math.random() * 17;
        }
        // setRain() just armed a manual hold; clear it so auto flips keep working.
        manualHold = 0;
      }
    }

    applyTime();

    if (raining) {
      // Keep the rain volume around the camera when one is known, so the
      // streaks always fall in front of the player; otherwise cover the city.
      if (camera && camera.position) {
        rain.position.x = camera.position.x;
        rain.position.z = camera.position.z;
      } else {
        rain.position.x = 0;
        rain.position.z = 0;
      }
      for (let i = 0; i < RAIN_COUNT; i++) {
        rainY[i] -= rainSpeed[i] * step;
        rainX[i] += 6 * step; // slight wind slant
        if (rainY[i] < 0) resetStreak(i, true);
      }
      writeRainPositions();
    }
  }

  discover();
  applyTime();

  return {
    setTimeOfDay,
    setRain,
    update,
    setCamera,
    getTimeOfDay() {
      return timeOfDay;
    },
    isRaining() {
      return raining;
    },
  };
}
