// game/src/combat.js — Fists and three firearms for NEON TIDE.
//
// createCombat(scene, player, police, opts) wires Mara's weapons to the
// world: tracer lines, muzzle flash, impact sparks, recoil, ammo, and the
// wanted-level consequences of firing a gun in public.
//
// Depends only on scene, player, and police (plus the shared state).
// Sounds and camera recoil are optional hooks in opts, because the audio
// and camera modules own those systems:
//   opts.audio            — optional audio object; gunshot(weapon) /
//                           punch() are called when present (also accepts
//                           playGunshot / playPunch names).
//   opts.camera           — optional camera object; kick(amount) is
//                           called when present.
//   opts.onGunshot        — optional fn(weaponName) called on every shot.
//   opts.onPunch          — optional fn(hit) called on every swing.
//   opts.onEmpty          — optional fn(weaponName) called on a dry fire.
//   opts.onRecoil         — optional fn(recoilAmount) called on every shot.
//   opts.getAimPoint      — optional fn() returning a THREE.Vector3-like
//                           aim point (mouse raycast, from main.js).
//   opts.aimPoint         — optional static aim point (same shape).
//   opts.getAimDirection  — optional fn() returning a direction vector.
//   opts.input / opts.cameraYaw — fallback: forward from the camera yaw.

import * as THREE from '../vendor/three.min.js';
import { state, WEAPONS } from './state.js';

// Fists are not in WEAPONS (they have no ammo and make no noise).
export const FISTS = {
  name: 'Fists',
  damage: 10,
  rate: 2.8, // swings per second
  range: 1.8,
  spread: 0,
  ammo: Infinity,
};

const SHOTGUN_PELLETS = 6;
const MUZZLE_HEIGHT = 1.35; // metres above Mara's feet
const TRACER_POOL = 12; // reused tracer lines
const SPARK_POOL = 4; // reused impact sprites
const AMMO_REFILL_INTERVAL = 4; // seconds per +1 bullet per weapon
const WANTED_RAISE_COOLDOWN = 3; // seconds between wanted bumps from gunfire
const PUNCH_ARC = Math.PI / 3; // half-angle of the melee cone

// Soft radial glow used by the muzzle flash and the impact sparks.
function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,220,130,0.9)');
  g.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCombat(scene, player, police, opts = {}) {
  // Mara starts with a pistol; the SMG and shotgun are granted by
  // missions (see giveWeapon). selectWeapon refuses anything unowned.
  const owned = { pistol: true, smg: false, shotgun: false };

  let lastShotAt = 0;
  let lastPunchAt = 0;
  let lastWantedRaiseAt = -Infinity;
  let refillTimer = 0;
  let recoil = 0;

  // --- visuals: muzzle flash, tracers, impact sparks -------------------

  const flashTexture = makeGlowTexture();

  const flashSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: flashTexture,
      color: 0xffd27a,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    }),
  );
  flashSprite.scale.setScalar(1.1);
  const flashLight = new THREE.PointLight(0xffc46b, 0, 14, 2);
  if (scene) {
    scene.add(flashSprite);
    scene.add(flashLight);
  }
  let flashLife = 0;

  // Pool of tracer lines, reused so a shot never allocates.
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    if (scene) scene.add(line);
    tracers.push({ line, life: 0, maxLife: 0.09 });
  }
  let tracerCursor = 0;

  // Pool of impact sparks (small additive glow sprites).
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i++) {
    const mat = new THREE.SpriteMaterial({
      map: flashTexture,
      color: 0xffa040,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.6);
    if (scene) scene.add(sprite);
    sparks.push({ sprite, life: 0 });
  }
  let sparkCursor = 0;

  // --- scratch vectors ---------------------------------------------------

  const _muzzle = new THREE.Vector3();
  const _perp = new THREE.Vector3();

  function muzzlePosition() {
    _muzzle.copy(player.position);
    _muzzle.y += MUZZLE_HEIGHT;
    return _muzzle;
  }

  // Aim direction: explicit aim point first (mouse raycast from main.js),
  // then an explicit direction, then the camera forward as a fallback.
  function aimDirection(out) {
    let point = null;
    if (typeof opts.getAimPoint === 'function') point = opts.getAimPoint();
    else if (opts.aimPoint) point = opts.aimPoint;
    if (point && typeof point.x === 'number' && typeof point.z === 'number') {
      const m = muzzlePosition();
      out.set(point.x - m.x, (point.y ?? 1.2) - m.y, point.z - m.z);
      if (out.lengthSq() > 1e-6) return out.normalize();
    }
    if (typeof opts.getAimDirection === 'function') {
      const d = opts.getAimDirection();
      if (d && typeof d.x === 'number') {
        out.set(d.x, d.y || 0, d.z);
        if (out.lengthSq() > 1e-6) return out.normalize();
      }
    }
    const yaw =
      typeof opts.cameraYaw === 'number'
        ? opts.cameraYaw
        : opts.input && typeof opts.input.cameraYaw === 'number'
          ? opts.input.cameraYaw
          : 0;
    out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    return out;
  }

  // Jitter a direction inside a cone of half-angle `spread` (radians).
  function applySpread(dir, spread) {
    if (!spread) return dir;
    const rx = (Math.random() * 2 - 1) * spread;
    const ry = (Math.random() * 2 - 1) * spread;
    _perp.set(-dir.z, 0, dir.x);
    if (_perp.lengthSq() < 1e-6) _perp.set(1, 0, 0);
    _perp.normalize();
    dir.addScaledVector(_perp, rx);
    dir.y += ry;
    return dir.normalize();
  }

  // Nearest police ground unit the ray from `origin` along `dir` hits
  // within `range`, or null. Units are treated as spheres at chest height;
  // the helicopter can never be shot down, so it is skipped.
  function rayHitUnit(origin, dir, range) {
    const list =
      police && typeof police.getPoliceList === 'function'
        ? police.getPoliceList()
        : [];
    let best = null;
    let bestT = Infinity;
    for (const u of list) {
      if (!u || u.disabled || u.kind === 'heli') continue;
      const cx =
        typeof u.x === 'number' ? u.x : u.position ? u.position.x : 0;
      const cz =
        typeof u.z === 'number' ? u.z : u.position ? u.position.z : 0;
      const cy = (u.position ? u.position.y : 0) + 1.0;
      const r = (u.radius || 1.7) + 0.35;
      const ox = cx - origin.x;
      const oy = cy - origin.y;
      const oz = cz - origin.z;
      const tca = ox * dir.x + oy * dir.y + oz * dir.z;
      if (tca < 0 || tca > range) continue;
      const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
      if (d2 > r * r) continue;
      const t = tca - Math.sqrt(Math.max(0, r * r - d2));
      if (t < bestT) {
        bestT = t;
        best = u;
      }
    }
    return best ? { unit: best, distance: Math.max(0, bestT) } : null;
  }

  function spawnTracer(from, to) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.95;
    t.life = t.maxLife;
  }

  function spawnSpark(point) {
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % sparks.length;
    s.sprite.position.copy(point);
    s.sprite.scale.setScalar(0.7);
    s.sprite.material.opacity = 1;
    s.life = 0.15;
  }

  function fireFlash(dir) {
    const m = muzzlePosition();
    flashSprite.position.copy(m).addScaledVector(dir, 0.6);
    flashSprite.material.opacity = 1;
    flashSprite.scale.setScalar(0.9 + Math.random() * 0.5);
    flashLight.position.copy(m);
    flashLight.intensity = 8;
    flashLife = 0.06;
  }

  // Optional sound hooks: try the audio object's method first, then the
  // matching onXxx callback from opts.
  function playSound(kind, arg) {
    const audio = opts.audio;
    if (audio) {
      const fn =
        audio[kind] ||
        audio['play' + kind[0].toUpperCase() + kind.slice(1)];
      if (typeof fn === 'function') {
        fn.call(audio, arg);
        return;
      }
    }
    if (kind === 'gunshot' && typeof opts.onGunshot === 'function') {
      opts.onGunshot(arg);
    }
    if (kind === 'punch' && typeof opts.onPunch === 'function') {
      opts.onPunch(arg);
    }
  }

  // Firing a gun in public draws the police, but not one star per bullet:
  // the wanted level rises at most once per cooldown window.
  function raiseWantedFromGunfire(now) {
    if (now - lastWantedRaiseAt < WANTED_RAISE_COOLDOWN * 1000) return;
    lastWantedRaiseAt = now;
    if (police && typeof police.raiseWanted === 'function') {
      police.raiseWanted(1);
    } else {
      state.wanted = state.wanted + 1;
    }
  }

  // --- public API --------------------------------------------------------

  // Fire the current weapon toward the aim point. A shot that hits
  // nothing still shows the tracer, the flash, and the sound.
  function shoot() {
    if (!player || !police) return false;
    if (state.inCar || state.isBusted) return false; // no shooting while driving
    const name = state.weapon;
    if (name === 'fists') return false;
    const def = WEAPONS[name];
    if (!def) return false;
    const now = performance.now();
    if (now - lastShotAt < 1000 / def.rate) return false; // fire-rate gate
    if ((state.ammo[name] || 0) <= 0) {
      if (typeof opts.onEmpty === 'function') opts.onEmpty(name);
      return false;
    }
    lastShotAt = now;
    state.ammo[name] -= 1;

    const muzzle = muzzlePosition().clone();
    const baseDir = aimDirection(new THREE.Vector3());
    const pellets = name === 'shotgun' ? SHOTGUN_PELLETS : 1;
    const perPellet =
      name === 'shotgun'
        ? Math.ceil(def.damage / SHOTGUN_PELLETS)
        : def.damage;
    for (let i = 0; i < pellets; i++) {
      const dir = baseDir.clone();
      applySpread(dir, def.spread);
      const hit = rayHitUnit(muzzle, dir, def.range);
      const end = new THREE.Vector3();
      if (hit) {
        end.copy(muzzle).addScaledVector(dir, hit.distance);
        let dmg = perPellet;
        if (name === 'shotgun') {
          // Shotgun pellets lose punch with distance.
          dmg = Math.max(
            1,
            Math.round(perPellet * (1 - (hit.distance / def.range) * 0.5)),
          );
        }
        if (police && typeof police.damageUnit === 'function') {
          police.damageUnit(hit.unit, dmg);
        }
        spawnSpark(end);
      } else {
        end.copy(muzzle).addScaledVector(dir, def.range);
      }
      spawnTracer(muzzle, end);
    }

    fireFlash(baseDir);
    playSound('gunshot', name);
    raiseWantedFromGunfire(now);
    if (typeof player.shoot === 'function') player.shoot(); // recoil pose
    recoil = Math.min(
      1,
      recoil + (name === 'shotgun' ? 0.9 : name === 'smg' ? 0.25 : 0.5),
    );
    if (opts.camera && typeof opts.camera.kick === 'function') {
      opts.camera.kick(name === 'shotgun' ? 0.09 : 0.05);
    }
    if (typeof opts.onRecoil === 'function') opts.onRecoil(recoil);
    return true;
  }

  // Short-range melee swing. The swing animation is delegated to the
  // player module; this module decides the damage. Fists make no noise,
  // so a punch never raises the wanted level. On foot only.
  function punch() {
    if (!player || !police) return false;
    if (state.inCar || state.isBusted) return false;
    const now = performance.now();
    if (now - lastPunchAt < 1000 / FISTS.rate) return false;
    lastPunchAt = now;

    // player.punch() plays the swing and reports (via its own facing
    // check against player.punchTargets) whether anything was in range.
    const swung =
      typeof player.punch === 'function' ? player.punch() : false;

    const px = player.position.x;
    const pz = player.position.z;
    const facing = aimDirection(new THREE.Vector3());
    facing.y = 0;
    if (facing.lengthSq() > 1e-6) facing.normalize();
    else facing.set(0, 0, 1);

    const list =
      typeof police.getPoliceList === 'function'
        ? police.getPoliceList()
        : [];
    let best = null;
    let bestD = Infinity;
    let bestAny = null;
    let bestAnyD = Infinity;
    for (const u of list) {
      if (!u || u.disabled || u.kind === 'heli') continue;
      const ux = typeof u.x === 'number' ? u.x : u.position.x;
      const uz = typeof u.z === 'number' ? u.z : u.position.z;
      const dx = ux - px;
      const dz = uz - pz;
      const d = Math.hypot(dx, dz);
      if (d > FISTS.range || d < 1e-6) continue;
      if (d < bestAnyD) {
        bestAnyD = d;
        bestAny = u;
      }
      const dot = (dx * facing.x + dz * facing.z) / d;
      if (dot > Math.cos(PUNCH_ARC) && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    // Prefer a target inside the swing cone; if the player's own facing
    // check says the swing connected, take the nearest unit in reach.
    const target = best || (swung ? bestAny : null);
    if (target) {
      if (typeof police.damageUnit === 'function') {
        police.damageUnit(target, FISTS.damage);
      }
      const hitPoint = new THREE.Vector3(
        typeof target.x === 'number' ? target.x : target.position.x,
        1.2,
        typeof target.z === 'number' ? target.z : target.position.z,
      );
      spawnSpark(hitPoint);
    }
    playSound('punch', !!target);
    return !!target;
  }

  // Switch weapons. "fists" is always available; a firearm switches
  // only when Mara owns it (see giveWeapon).
  function selectWeapon(name) {
    if (name === 'fists') {
      state.weapon = 'fists';
      return true;
    }
    if (!WEAPONS[name]) return false;
    if (!owned[name]) return false;
    state.weapon = name;
    return true;
  }

  // Grant a weapon (mission rewards call this) and top its ammo up to
  // at least the starting amount. Returns false for unknown names.
  function giveWeapon(name) {
    if (!WEAPONS[name]) return false;
    owned[name] = true;
    if ((state.ammo[name] || 0) < WEAPONS[name].ammo) {
      state.ammo[name] = WEAPONS[name].ammo;
    }
    return true;
  }

  // Fully refill every weapon's ammo (called on mission completion).
  function refillAmmo() {
    for (const name of Object.keys(WEAPONS)) {
      state.ammo[name] = WEAPONS[name].ammo;
    }
  }

  function update(dt) {
    const step = Math.min(Math.max(typeof dt === 'number' ? dt : 0, 0), 0.1);

    if (recoil > 0) recoil = Math.max(0, recoil - step * 6);

    if (flashLife > 0) {
      flashLife -= step;
      const k = Math.max(0, flashLife / 0.06);
      flashSprite.material.opacity = k;
      flashLight.intensity = 8 * k;
      if (flashLife <= 0) {
        flashSprite.material.opacity = 0;
        flashLight.intensity = 0;
      }
    }

    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= step;
      const k = Math.max(0, t.life / t.maxLife);
      t.line.material.opacity = 0.95 * k;
      if (t.life <= 0) t.line.visible = false;
    }

    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= step;
      const k = Math.max(0, s.life / 0.15);
      s.sprite.material.opacity = k;
      s.sprite.scale.setScalar(0.7 * (0.5 + k));
      if (s.life <= 0) s.sprite.material.opacity = 0;
    }

    // Ammo refills slowly over time, one bullet per weapon per interval.
    refillTimer += step;
    if (refillTimer >= AMMO_REFILL_INTERVAL) {
      refillTimer = 0;
      for (const name of Object.keys(WEAPONS)) {
        if (state.ammo[name] < WEAPONS[name].ammo) state.ammo[name] += 1;
      }
    }

    // Keep the player's own melee check in sync with the live police
    // list, so player.punch() can report a hit from its facing check.
    if (player && police && typeof police.getPoliceList === 'function') {
      player.punchTargets = police
        .getPoliceList()
        .filter((u) => u && !u.disabled && u.kind !== 'heli');
    }
  }

  return {
    shoot,
    punch,
    selectWeapon,
    update,
    refillAmmo,
    giveWeapon,
    ownsWeapon: (name) => !!owned[name],
    getWeapon: () => state.weapon,
    getAmmo: (name) => state.ammo[name],
    WEAPONS,
    FISTS,
    get recoil() {
      return recoil;
    },
  };
}
