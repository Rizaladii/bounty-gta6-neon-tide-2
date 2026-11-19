// car.js — Cars and the speedboat for NEON TIDE (Port Marigold).
//
// The Zephyr RS (Mara's sports coupe) plus stealable parked cars — muscle,
// street hatchback, pickup, minibus, scooter — and the speedboat at the
// harbor dock. Driving is W accelerate, S brake/reverse, A/D steer, with
// distinct handling per car type. Cars slide along building collision
// boxes and stop at the city edge. Headlights are on.
//
// Depends only on scene, city, and input. Does not import police or
// missions. Stealing a parked car is reported through opts.onSteal, so the
// caller (main.js) can raise the wanted level.

import * as THREE from '../vendor/three.min.js';

// ---------------------------------------------------------------------------
// Handling table — one row per car type. Top speed in m/s, accel in m/s^2.
// ---------------------------------------------------------------------------

const CAR_TYPES = {
  zephyr: {
    name: 'Zephyr RS', topSpeed: 42, accel: 22, brake: 34, reverseSpeed: 13,
    steer: 1.9, grip: 1.0, health: 100, radius: 1.7, length: 4.3, width: 1.9,
    color: 0x0e7f7a, stripe: 0xf26a4b, underglow: true,
  },
  sports: {
    name: 'Sports Coupe', topSpeed: 38, accel: 20, brake: 32, reverseSpeed: 12,
    steer: 1.8, grip: 1.0, health: 100, radius: 1.7, length: 4.2, width: 1.9,
    color: 0xc23b4e, stripe: 0x1a1a1a, underglow: false,
  },
  muscle: {
    name: 'Muscle Car', topSpeed: 36, accel: 25, brake: 28, reverseSpeed: 11,
    steer: 1.25, grip: 0.85, health: 120, radius: 1.8, length: 4.6, width: 2.0,
    color: 0x2e4a8f, stripe: 0xd8d8d8, underglow: false,
  },
  hatchback: {
    name: 'Street Hatchback', topSpeed: 30, accel: 18, brake: 30, reverseSpeed: 11,
    steer: 2.2, grip: 1.0, health: 80, radius: 1.5, length: 3.6, width: 1.8,
    color: 0xe8a33d, stripe: 0x1a1a1a, underglow: false,
  },
  pickup: {
    name: 'Pickup Truck', topSpeed: 28, accel: 14, brake: 26, reverseSpeed: 10,
    steer: 1.4, grip: 0.9, health: 160, radius: 1.9, length: 4.8, width: 2.0,
    color: 0x4a6b3a, stripe: 0x1a1a1a, underglow: false,
  },
  minibus: {
    name: 'Minibus', topSpeed: 24, accel: 10, brake: 24, reverseSpeed: 9,
    steer: 1.15, grip: 0.9, health: 150, radius: 2.2, length: 5.0, width: 2.1,
    color: 0x7a5aa8, stripe: 0x1a1a1a, underglow: false,
  },
  scooter: {
    name: 'Scooter', topSpeed: 26, accel: 20, brake: 30, reverseSpeed: 6,
    steer: 2.6, grip: 1.0, health: 50, radius: 0.9, length: 1.9, width: 0.7,
    color: 0xd84a7a, stripe: 0x1a1a1a, underglow: false,
  },
  boat: {
    name: 'Speedboat', topSpeed: 34, accel: 16, brake: 20, reverseSpeed: 8,
    steer: 1.5, grip: 0.7, health: 120, radius: 2.2, length: 5.6, width: 2.1,
    color: 0xf2f2f2, stripe: 0x0e7f7a, underglow: false,
  },
};

const DARK_DAMAGE = new THREE.Color(0x141414);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

// Reads a key from the shared input object, tolerating several shapes:
// input.isDown(code), input.keys as a Set, input.keys as a plain object,
// or direct boolean fields on input. Accepts both the DOM code ('KeyW')
// and the plain letter ('w').
function isKey(input, code, letter) {
  if (!input) return false;
  if (typeof input.isDown === 'function') {
    return input.isDown(code) || input.isDown(letter);
  }
  const keys = input.keys;
  if (keys) {
    if (typeof keys.has === 'function') return keys.has(code) || keys.has(letter);
    if (keys[code] || keys[letter]) return true;
  }
  return !!input[code] || !!input[letter];
}

// Normalises a city collision box into { minX, maxX, minZ, maxZ }.
// City boxes may carry centre + size, half extents, or explicit bounds.
function normaliseBox(b) {
  if (b.minX !== undefined) {
    return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
  }
  const hw = b.hw !== undefined ? b.hw : (b.w !== undefined ? b.w / 2 : (b.width || 2) / 2);
  const hd = b.hd !== undefined ? b.hd : (b.d !== undefined ? b.d / 2 : (b.depth || 2) / 2);
  const cx = b.x !== undefined ? b.x : (b.cx || 0);
  const cz = b.z !== undefined ? b.z : (b.cz || 0);
  return { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd };
}

// ---------------------------------------------------------------------------
// Mesh builders — multi-part stylised meshes, no bare primitives.
// ---------------------------------------------------------------------------

function makeWheel(radius, width, rimMat, tireMat) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20), tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spin.add(tire);
  // Multi-spoke alloy rim: a bright disc plus five spokes that spin.
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 12), rimMat);
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);
  for (let i = 0; i < 5; i++) {
    const spoke = box(0.06, radius * 1.05, 0.07, rimMat, 0, 0, 0, (i * Math.PI * 2) / 5, 0, 0);
    spoke.position.set(0, 0, 0);
    // Spokes live in the wheel plane (Y/Z): rotate around the axle (X).
    spoke.rotation.set((i * Math.PI * 2) / 5, 0, 0);
    spin.add(spoke);
  }
  return { pivot, spin };
}

function addHeadlights(body, z, y, spread, lightMat) {
  const left = box(0.34, 0.14, 0.08, lightMat, -spread, y, z);
  const right = box(0.34, 0.14, 0.08, lightMat, spread, y, z);
  body.add(left, right);
}

function addTaillights(body, z, y, spread, tailMat) {
  const left = box(0.3, 0.12, 0.08, tailMat, -spread, y, z);
  const right = box(0.3, 0.12, 0.08, tailMat, spread, y, z);
  body.add(left, right);
}

// Builds a car mesh for the given type and paint colour. Returns
// { group, body, wheels, bodyMats, underglow }.
function buildCarMesh(type, colorHex) {
  const t = CAR_TYPES[type];
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.55, roughness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1b26, metalness: 0.9, roughness: 0.12 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x16181c, metalness: 0.4, roughness: 0.7 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.1, roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.9, roughness: 0.25 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1.0, roughness: 0.15 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffedb0, emissiveIntensity: 1.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a0d0d, emissive: 0xff1a1a, emissiveIntensity: 1.4 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: t.stripe, metalness: 0.4, roughness: 0.4, emissive: t.stripe, emissiveIntensity: 0.12 });

  const bodyMats = [bodyMat];
  const wheels = [];
  const L = t.length;
  const W = t.width;

  if (type === 'scooter') {
    // Two-wheeler: floorboard, seat, handlebar, front fairing.
    body.add(box(0.5, 0.16, 1.1, bodyMat, 0, 0.42, -0.15));
    body.add(box(0.42, 0.3, 0.5, bodyMat, 0, 0.62, -0.55)); // seat cowl
    body.add(box(0.4, 0.12, 0.55, trimMat, 0, 0.78, -0.5)); // seat
    body.add(box(0.34, 0.5, 0.3, bodyMat, 0, 0.72, 0.62, -0.35, 0, 0)); // fairing
    body.add(box(0.62, 0.06, 0.06, chromeMat, 0, 1.02, 0.42)); // handlebar
    body.add(box(0.08, 0.14, 0.04, trimMat, -0.34, 1.06, 0.42)); // mirror L
    body.add(box(0.08, 0.14, 0.04, trimMat, 0.34, 1.06, 0.42)); // mirror R
    addHeadlights(body, 0.78, 0.72, 0.1, lightMat);
    const wf = makeWheel(0.28, 0.12, rimMat, tireMat);
    wf.pivot.position.set(0, 0.28, 0.62);
    const wr = makeWheel(0.28, 0.12, rimMat, tireMat);
    wr.pivot.position.set(0, 0.28, -0.62);
    group.add(wf.pivot, wr.pivot);
    wheels.push({ ...wf, isFront: true }, { ...wr, isFront: false });
  } else if (type === 'minibus') {
    // Tall boxy van: body, window band, sliding door, roof rails.
    body.add(box(W, 1.5, L, bodyMat, 0, 1.15, 0));
    body.add(box(W + 0.04, 0.55, L * 0.82, glassMat, 0, 1.55, -0.1)); // window band
    body.add(box(W, 0.5, L * 0.8, bodyMat, 0, 0.62, 0)); // lower skirt
    body.add(box(0.06, 1.1, 0.9, trimMat, W / 2 + 0.01, 1.05, 0.6)); // door seam
    body.add(box(0.08, 0.08, L * 0.9, chromeMat, -W / 2 + 0.06, 1.94, 0)); // roof rail
    body.add(box(0.08, 0.08, L * 0.9, chromeMat, W / 2 - 0.06, 1.94, 0));
    body.add(box(W + 0.06, 0.16, 0.3, trimMat, 0, 0.55, L / 2)); // bumper
    body.add(box(W + 0.06, 0.16, 0.3, trimMat, 0, 0.55, -L / 2));
    addHeadlights(body, L / 2 + 0.02, 0.95, 0.62, lightMat);
    addTaillights(body, -L / 2 - 0.02, 0.95, 0.62, tailMat);
    const wheelY = 0.38;
    const positions = [
      [-W / 2 + 0.18, L / 2 - 0.85, true], [W / 2 - 0.18, L / 2 - 0.85, true],
      [-W / 2 + 0.18, -L / 2 + 0.85, false], [W / 2 - 0.18, -L / 2 + 0.85, false],
    ];
    for (const [x, z, front] of positions) {
      const w = makeWheel(0.38, 0.26, rimMat, tireMat);
      w.pivot.position.set(x, wheelY, z);
      group.add(w.pivot);
      wheels.push({ ...w, isFront: front });
    }
  } else if (type === 'pickup') {
    // Cab + open bed with walls, bed floor, roll bar.
    body.add(box(W, 0.6, L, bodyMat, 0, 0.62, 0)); // chassis / lower body
    body.add(box(W * 0.82, 0.85, 1.7, bodyMat, 0, 1.3, 1.15)); // cab
    body.add(box(W * 0.78, 0.5, 1.5, glassMat, 0, 1.42, 1.15)); // cab glass
    body.add(box(W, 0.5, 1.9, bodyMat, 0, 1.1, -1.35)); // bed walls
    body.add(box(W - 0.2, 0.08, 1.7, trimMat, 0, 0.95, -1.35)); // bed floor
    body.add(box(0.1, 0.5, 0.1, chromeMat, -W / 2 + 0.15, 1.5, -0.6)); // roll bar
    body.add(box(0.1, 0.5, 0.1, chromeMat, W / 2 - 0.15, 1.5, -0.6));
    body.add(box(W - 0.2, 0.08, 0.1, chromeMat, 0, 1.72, -0.6));
    body.add(box(W + 0.08, 0.18, 0.34, chromeMat, 0, 0.55, L / 2)); // bumpers
    body.add(box(W + 0.08, 0.18, 0.34, chromeMat, 0, 0.55, -L / 2));
    addHeadlights(body, L / 2 + 0.02, 0.85, 0.6, lightMat);
    addTaillights(body, -L / 2 - 0.02, 0.85, 0.6, tailMat);
    const positions = [
      [-W / 2 + 0.15, L / 2 - 1.0, true], [W / 2 - 0.15, L / 2 - 1.0, true],
      [-W / 2 + 0.15, -L / 2 + 1.0, false], [W / 2 - 0.15, -L / 2 + 1.0, false],
    ];
    for (const [x, z, front] of positions) {
      const w = makeWheel(0.42, 0.3, rimMat, tireMat);
      w.pivot.position.set(x, 0.42, z);
      group.add(w.pivot);
      wheels.push({ ...w, isFront: front });
    }
  } else {
    // Coupes / muscle / hatchback share a sculpted silhouette with
    // per-type proportions: low wide wedge, cabin, hood, spoiler, skirts.
    const low = type === 'zephyr' || type === 'sports';
    const bodyH = low ? 0.5 : 0.58;
    const bodyY = low ? 0.55 : 0.6;
    const cabH = type === 'hatchback' ? 0.62 : 0.48;
    const cabL = type === 'hatchback' ? 2.0 : type === 'muscle' ? 1.9 : 2.1;
    const cabZ = type === 'muscle' ? -0.35 : -0.15;

    body.add(box(W, bodyH, L, bodyMat, 0, bodyY, 0)); // lower body
    body.add(box(W * 0.86, cabH, cabL, glassMat, 0, bodyY + bodyH / 2 + cabH / 2 - 0.06, cabZ)); // glasshouse
    body.add(box(W * 0.88, 0.1, cabL * 0.9, bodyMat, 0, bodyY + bodyH / 2 + cabH - 0.02, cabZ)); // roof
    // Sloping hood panel and sculpted nose.
    body.add(box(W * 0.92, 0.1, 0.9, bodyMat, 0, bodyY + bodyH / 2 + 0.02, L / 2 - 0.55, -0.1, 0, 0));
    body.add(box(W * 0.7, 0.22, 0.12, trimMat, 0, bodyY - 0.05, L / 2 + 0.02)); // grille
    body.add(box(W + 0.06, 0.14, 0.3, trimMat, 0, bodyY - bodyH / 2 + 0.05, L / 2 - 0.05)); // splitter
    body.add(box(W + 0.06, 0.14, 0.3, trimMat, 0, bodyY - bodyH / 2 + 0.05, -L / 2 + 0.05)); // diffuser
    // Side skirts.
    body.add(box(0.08, 0.12, L * 0.7, trimMat, -W / 2 - 0.01, bodyY - bodyH / 2 + 0.08, 0));
    body.add(box(0.08, 0.12, L * 0.7, trimMat, W / 2 + 0.01, bodyY - bodyH / 2 + 0.08, 0));

    if (type === 'zephyr') {
      // Coral-orange racing stripes down both flanks and over the roof.
      body.add(box(0.02, 0.1, L * 0.96, stripeMat, -W / 2 - 0.02, bodyY + 0.12, 0));
      body.add(box(0.02, 0.1, L * 0.96, stripeMat, W / 2 + 0.02, bodyY + 0.12, 0));
      body.add(box(0.34, 0.02, L * 0.96, stripeMat, 0, bodyY + bodyH / 2 + cabH + 0.02, cabZ));
      // Rear wing on two sculpted supports.
      body.add(box(0.08, 0.3, 0.08, trimMat, -0.55, bodyY + bodyH / 2 + 0.12, -L / 2 + 0.25));
      body.add(box(0.08, 0.3, 0.08, trimMat, 0.55, bodyY + bodyH / 2 + 0.12, -L / 2 + 0.25));
      body.add(box(W * 0.9, 0.06, 0.5, bodyMat, 0, bodyY + bodyH / 2 + 0.3, -L / 2 + 0.25, 0.12, 0, 0));
      // Full-width taillight bar.
      body.add(box(W * 0.8, 0.1, 0.06, tailMat, 0, bodyY + 0.08, -L / 2 - 0.02));
    } else if (type === 'muscle') {
      // Hood scoop, chrome bumpers, wide rear wing lip.
      body.add(box(0.7, 0.16, 0.9, bodyMat, 0, bodyY + bodyH / 2 + 0.1, L / 2 - 0.9));
      body.add(box(W + 0.1, 0.16, 0.3, chromeMat, 0, bodyY - 0.08, L / 2));
      body.add(box(W + 0.1, 0.16, 0.3, chromeMat, 0, bodyY - 0.08, -L / 2));
      body.add(box(W * 0.85, 0.08, 0.4, bodyMat, 0, bodyY + bodyH / 2 + 0.16, -L / 2 + 0.2, 0.15, 0, 0));
      body.add(box(0.02, 0.1, L * 0.9, stripeMat, -W / 2 - 0.02, bodyY + 0.1, 0));
      body.add(box(0.02, 0.1, L * 0.9, stripeMat, W / 2 + 0.02, bodyY + 0.1, 0));
    } else if (type === 'sports') {
      body.add(box(W * 0.86, 0.06, 0.45, bodyMat, 0, bodyY + bodyH / 2 + 0.28, -L / 2 + 0.25, 0.12, 0, 0));
    }

    addHeadlights(body, L / 2 + 0.02, bodyY + 0.05, 0.58, lightMat);
    if (type !== 'zephyr') addTaillights(body, -L / 2 - 0.02, bodyY + 0.05, 0.58, tailMat);

    const wheelR = type === 'muscle' ? 0.4 : 0.36;
    const positions = [
      [-W / 2 + 0.12, L / 2 - 0.95, true], [W / 2 - 0.12, L / 2 - 0.95, true],
      [-W / 2 + 0.12, -L / 2 + 0.95, false], [W / 2 - 0.12, -L / 2 + 0.95, false],
    ];
    for (const [x, z, front] of positions) {
      const w = makeWheel(wheelR, 0.28, rimMat, tireMat);
      w.pivot.position.set(x, wheelR, z);
      group.add(w.pivot);
      wheels.push({ ...w, isFront: front });
    }
  }

  // Red underglow: a glowing plane under the car (Zephyr RS only).
  let underglow = null;
  if (t.underglow) {
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff2222, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    underglow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.7, L + 0.7), glowMat);
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.y = 0.06;
    group.add(underglow);
  }

  return { group, body, wheels, bodyMats, underglow };
}

// Builds the speedboat mesh. Returns { group, body, bodyMats }.
function buildBoatMesh() {
  const t = CAR_TYPES.boat;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const hullMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.3, roughness: 0.3 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: t.stripe, metalness: 0.4, roughness: 0.35 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, metalness: 0.2, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1b26, metalness: 0.9, roughness: 0.12, transparent: true, opacity: 0.85 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1.0, roughness: 0.15 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x16181c, metalness: 0.4, roughness: 0.7 });
  const redLight = new THREE.MeshStandardMaterial({ color: 0x7a0d0d, emissive: 0xff1a1a, emissiveIntensity: 1.6 });
  const greenLight = new THREE.MeshStandardMaterial({ color: 0x0d5c1a, emissive: 0x22ff66, emissiveIntensity: 1.6 });

  // Hull, pointed bow (flattened cone), deck, windshield, seats, motor.
  body.add(box(2.1, 0.7, 4.6, hullMat, 0, 0.45, -0.4));
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.7, 4), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.scale.set(1, 0.42, 1);
  bow.position.set(0, 0.45, 2.7);
  bow.castShadow = true;
  body.add(bow);
  body.add(box(2.14, 0.08, 4.4, stripeMat, 0, 0.62, -0.4)); // teal sheer stripe
  body.add(box(1.9, 0.1, 3.6, deckMat, 0, 0.82, -0.5)); // deck
  body.add(box(1.6, 0.5, 0.08, glassMat, 0, 1.25, 0.9, -0.35, 0, 0)); // windshield
  body.add(box(0.55, 0.5, 0.55, trimMat, -0.45, 1.05, 0.1)); // seats
  body.add(box(0.55, 0.5, 0.55, trimMat, 0.45, 1.05, 0.1));
  body.add(box(0.5, 0.45, 0.4, trimMat, 0, 1.05, -0.9)); // rear bench
  body.add(box(0.4, 0.7, 0.3, trimMat, 0, 0.6, -2.75)); // outboard motor
  body.add(box(0.5, 0.12, 0.12, chromeMat, 0, 1.0, -2.8));
  // Navigation lights: red port, green starboard, white mast light.
  const port = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), redLight);
  port.position.set(-1.05, 0.95, 1.6);
  const starboard = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), greenLight);
  starboard.position.set(1.05, 0.95, 1.6);
  body.add(port, starboard);

  return { group, body, bodyMats: [hullMat] };
}

// ---------------------------------------------------------------------------
// createCars
// ---------------------------------------------------------------------------

export function createCars(scene, city, input, opts = {}) {
  const collisionBoxes = (city.collisionBoxes || []).map(normaliseBox);

  // City edge, derived from the city's own spawn data so the limit always
  // matches the built city: the furthest spawn plus a margin.
  let bound = 200;
  const probePoints = [city.spawn, city.boatSpawn, ...(city.carSpawns || [])];
  for (const p of probePoints) {
    if (!p) continue;
    bound = Math.max(bound, Math.abs(p.x || 0) + 30, Math.abs(p.z || 0) + 30);
  }

  // One shared spotlight: re-parented to whichever car is being driven.
  const headlight = new THREE.SpotLight(0xffe9b0, 60, 55, 0.5, 0.45, 1.2);
  headlight.position.set(0, 1.0, 2.0);
  const headlightTarget = new THREE.Object3D();
  headlightTarget.position.set(0, 0.2, 18);
  headlight.target = headlightTarget;

  function attachHeadlight(car) {
    if (headlight.parent) headlight.parent.remove(headlight);
    if (headlightTarget.parent) headlightTarget.parent.remove(headlightTarget);
    if (car && car.mesh) {
      car.mesh.group.add(headlight, headlightTarget);
    }
  }

  // -- Smoke pool (per car): grey puffs that rise and fade when damaged. --
  function makeSmoke(car) {
    const puffs = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0 });
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), mat.clone());
      puff.visible = false;
      scene.add(puff);
      puffs.push({ mesh: puff, life: 0 });
    }
    car.smoke = puffs;
    car.smokeTimer = 0;
  }

  function updateSmoke(car, dt) {
    if (!car.smoke) return;
    const smoking = car.health < 60;
    car.smokeTimer -= dt;
    if (smoking && car.smokeTimer <= 0) {
      car.smokeTimer = car.health < 30 ? 0.12 : 0.3;
      const puff = car.smoke.find((p) => p.life <= 0);
      if (puff) {
        const fx = car.x + Math.sin(car.heading) * 1.2;
        const fz = car.z + Math.cos(car.heading) * 1.2;
        puff.mesh.position.set(fx, 1.2, fz);
        puff.mesh.visible = true;
        puff.life = 1.4;
      }
    }
    for (const puff of car.smoke) {
      if (puff.life <= 0) continue;
      puff.life -= dt;
      puff.mesh.position.y += dt * 1.6;
      const s = 0.35 + (1.4 - puff.life) * 0.9;
      puff.mesh.scale.setScalar(s);
      puff.mesh.material.opacity = Math.max(0, puff.life / 1.4) * 0.55;
      if (puff.life <= 0) puff.mesh.visible = false;
    }
  }

  function applyDamageVisuals(car) {
    const f = 1 - car.health / car.maxHealth;
    for (const m of car.mesh.bodyMats) {
      if (!car._origColor) car._origColor = m.color.clone();
      m.color.copy(car._origColor).lerp(DARK_DAMAGE, f * 0.7);
    }
  }

  // -- Car factory ---------------------------------------------------------
  function makeCar(type, x, z, heading, colorHex) {
    const t = CAR_TYPES[type];
    const mesh = type === 'boat' ? buildBoatMesh() : buildCarMesh(type, colorHex !== undefined ? colorHex : t.color);
    mesh.group.position.set(x, 0, z);
    mesh.group.rotation.y = heading;
    scene.add(mesh.group);
    const car = {
      type,
      name: t.name,
      group: mesh.group,
      mesh,
      x, z, heading,
      speed: 0,
      steer: 0,
      health: t.health,
      maxHealth: t.health,
      radius: t.radius,
      driven: false,
      stolen: false,
      color: colorHex !== undefined ? colorHex : t.color,
      _bounceT: Math.random() * 10,
    };
    makeSmoke(car);
    return car;
  }

  // -- The fleet -----------------------------------------------------------
  const spawn = city.spawn || { x: 0, z: 0, facing: 0 };
  const playerCar = makeCar('zephyr', spawn.x, spawn.z, spawn.facing || 0, CAR_TYPES.zephyr.color);
  playerCar.driven = true;

  const parkedTypes = ['muscle', 'hatchback', 'pickup', 'minibus', 'scooter', 'sports', 'muscle', 'hatchback', 'pickup', 'scooter'];
  const parkedColors = [0x2e4a8f, 0xe8a33d, 0x4a6b3a, 0x7a5aa8, 0xd84a7a, 0x3aa88f, 0x8f2e2e, 0xd8d8d8, 0x2b2b3a, 0xc26a1a];
  const cars = [playerCar];
  const spawns = city.carSpawns || [];
  for (let i = 0; i < spawns.length; i++) {
    const p = spawns[i];
    const type = parkedTypes[i % parkedTypes.length];
    const car = makeCar(type, p.x, p.z, p.facing !== undefined ? p.facing : (i * 1.1) % (Math.PI * 2), parkedColors[i % parkedColors.length]);
    cars.push(car);
  }

  // -- The speedboat at the harbor dock ------------------------------------
  const boatSpawn = city.boatSpawn || { x: 120, z: -192, facing: 0 };
  const boat = makeCar('boat', boatSpawn.x, boatSpawn.z, boatSpawn.facing || 0);
  boat.group.position.y = 0.1;

  let currentCar = playerCar;
  let controlsEnabled = true;
  attachHeadlight(currentCar);

  // -- Collision: slide along building boxes, stop at the city edge. -------
  function resolveCollisions(car) {
    const r = car.radius;
    for (const b of collisionBoxes) {
      if (car.x < b.minX - r || car.x > b.maxX + r || car.z < b.minZ - r || car.z > b.maxZ + r) continue;
      const pushL = car.x - (b.minX - r);
      const pushR = (b.maxX + r) - car.x;
      const pushT = car.z - (b.minZ - r);
      const pushB = (b.maxZ + r) - car.z;
      const min = Math.min(pushL, pushR, pushT, pushB);
      if (min === pushL) car.x = b.minX - r;
      else if (min === pushR) car.x = b.maxX + r;
      else if (min === pushT) car.z = b.minZ - r;
      else car.z = b.maxZ + r;
      // A scrape, not a dead stop: keep the tangential slide, lose speed.
      car.speed *= 0.55;
    }
    if (Math.abs(car.x) > bound) {
      car.x = clamp(car.x, -bound, bound);
      car.speed *= 0.4;
    }
    if (Math.abs(car.z) > bound) {
      car.z = clamp(car.z, -bound, bound);
      car.speed *= 0.4;
    }
  }

  // -- Driving ---------------------------------------------------------------
  function drive(car, dt) {
    const t = CAR_TYPES[car.type];
    const fwd = isKey(input, 'KeyW', 'w');
    const back = isKey(input, 'KeyS', 's');
    const left = isKey(input, 'KeyA', 'a');
    const right = isKey(input, 'KeyD', 'd');

    if (fwd) {
      car.speed += t.accel * dt;
    } else if (back) {
      if (car.speed > 0.5) car.speed -= t.brake * dt;
      else car.speed -= t.accel * 0.55 * dt;
    } else {
      // Rolling drag + engine braking when no pedal is pressed.
      car.speed -= car.speed * 1.4 * dt;
      if (Math.abs(car.speed) < 0.05) car.speed = 0;
    }
    car.speed = clamp(car.speed, -t.reverseSpeed, t.topSpeed);

    // Steering: sharper at speed, reversed while reversing, eased by grip.
    const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
    const speedFactor = clamp(car.speed / 8, -1, 1);
    const targetSteer = steerInput * t.steer * speedFactor * t.grip;
    car.steer += (targetSteer - car.steer) * Math.min(1, dt * 8);
    car.heading += car.steer * dt;

    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    resolveCollisions(car);

    car.group.position.set(car.x, car.group.position.y, car.z);
    car.group.rotation.y = car.heading;

    // Wheels: front wheels steer, all wheels spin with road speed.
    const wheelR = car.type === 'scooter' ? 0.28 : 0.38;
    for (const w of car.mesh.wheels || []) {
      if (w.isFront) w.pivot.rotation.y = car.steer * 0.45;
      w.spin.rotation.x += (car.speed * dt) / wheelR;
    }

    // Suspension bounce + body lean: the body dips and rises on bumps,
    // leans into steering, pitches under acceleration.
    car._bounceT += dt * (3 + Math.abs(car.speed) * 0.35);
    const bounce = Math.abs(car.speed) > 0.5 ? Math.sin(car._bounceT) * 0.03 * Math.min(1, Math.abs(car.speed) / 20) : 0;
    const body = car.mesh.body;
    body.position.y = bounce;
    body.rotation.z = -car.steer * 0.05;
    body.rotation.x = clamp(-(fwd ? 1 : 0) * 0.02 + (back ? 1 : 0) * 0.015, -0.05, 0.05);

    // Zephyr underglow pulses gently with speed.
    if (car.mesh.underglow) {
      car.mesh.underglow.material.opacity = 0.35 + 0.2 * Math.min(1, Math.abs(car.speed) / t.topSpeed) + Math.sin(car._bounceT * 2) * 0.05;
    }
  }

  function driveBoat(boatCar, dt) {
    const t = CAR_TYPES.boat;
    const fwd = isKey(input, 'KeyW', 'w');
    const back = isKey(input, 'KeyS', 's');
    const left = isKey(input, 'KeyA', 'a');
    const right = isKey(input, 'KeyD', 'd');

    if (fwd) boatCar.speed += t.accel * dt;
    else if (back) boatCar.speed -= t.brake * 0.5 * dt;
    else {
      boatCar.speed -= boatCar.speed * 0.8 * dt;
      if (Math.abs(boatCar.speed) < 0.05) boatCar.speed = 0;
    }
    boatCar.speed = clamp(boatCar.speed, -t.reverseSpeed, t.topSpeed);

    // Boats drift: steering is softer and the hull slides a little.
    const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
    const speedFactor = clamp(boatCar.speed / 10, -1, 1);
    boatCar.heading += steerInput * t.steer * speedFactor * t.grip * dt;

    boatCar.x += Math.sin(boatCar.heading) * boatCar.speed * dt;
    boatCar.z += Math.cos(boatCar.heading) * boatCar.speed * dt;
    if (Math.abs(boatCar.x) > bound) { boatCar.x = clamp(boatCar.x, -bound, bound); boatCar.speed *= 0.5; }
    if (Math.abs(boatCar.z) > bound) { boatCar.z = clamp(boatCar.z, -bound, bound); boatCar.speed *= 0.5; }

    // Bobbing on the water + heel into turns.
    boatCar._bounceT += dt * 1.3;
    boatCar.group.position.set(
      boatCar.x,
      0.1 + Math.sin(boatCar._bounceT) * 0.07 + Math.min(0.12, Math.abs(boatCar.speed) * 0.004),
      boatCar.z,
    );
    boatCar.group.rotation.y = boatCar.heading;
    boatCar.group.rotation.z = -steerInput * 0.05 * Math.min(1, Math.abs(boatCar.speed) / 15);
    boatCar.group.rotation.x = Math.sin(boatCar._bounceT * 0.7) * 0.02;
  }

  // -- Public API ------------------------------------------------------------

  function stealCar(car) {
    if (!car || car === currentCar) return currentCar;
    if (currentCar) {
      currentCar.driven = false;
      currentCar.speed = 0;
    }
    currentCar = car;
    car.driven = true;
    if (car !== playerCar && !car.stolen) {
      car.stolen = true;
      if (typeof opts.onSteal === 'function') opts.onSteal(car);
    }
    attachHeadlight(car.type === 'boat' ? null : car);
    return car;
  }

  function exitCar() {
    if (!currentCar) return null;
    const car = currentCar;
    car.driven = false;
    car.speed = 0;
    // Step out on the car's left side, clear of the body.
    const sideX = car.x - Math.cos(car.heading) * (car.radius + 0.7);
    const sideZ = car.z + Math.sin(car.heading) * (car.radius + 0.7);
    currentCar = null;
    attachHeadlight(null);
    return { x: sideX, z: sideZ };
  }

  function nearestStealable(position, maxDistance) {
    let best = null;
    let bestD = maxDistance;
    for (const car of cars) {
      if (car === playerCar || car === currentCar || car.type === 'boat') continue;
      const dx = car.x - position.x;
      const dz = car.z - position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function boardBoat(position) {
    const near = position
      ? Math.hypot(boat.x - position.x, boat.z - position.z) < 5
      : true;
    if (!near) return false;
    if (currentCar) {
      currentCar.driven = false;
      currentCar.speed = 0;
    }
    currentCar = boat;
    boat.driven = true;
    attachHeadlight(null);
    return true;
  }

  function damage(amount) {
    const car = currentCar;
    if (!car) return 0;
    car.health = Math.max(0, car.health - amount);
    applyDamageVisuals(car);
    return car.health;
  }

  function repair() {
    const car = currentCar;
    if (!car) return;
    car.health = car.maxHealth;
    applyDamageVisuals(car);
  }

  function update(dt) {
    if (currentCar && controlsEnabled) {
      if (currentCar.type === 'boat') driveBoat(currentCar, dt);
      else drive(currentCar, dt);
    }
    // Idle bobbing for the boat even when nobody is aboard.
    if (boat !== currentCar) {
      boat._bounceT += dt * 1.3;
      boat.group.position.y = 0.1 + Math.sin(boat._bounceT) * 0.07;
    }
    // Smoke follows any damaged car (in practice only the driven one).
    for (const car of cars) updateSmoke(car, dt);
    updateSmoke(boat, dt);
  }

  return {
    cars,
    playerCar,
    boat,
    stealCar,
    exitCar,
    nearestStealable,
    boardBoat,
    update,
    damage,
    repair,
    setControlsEnabled(v) { controlsEnabled = !!v; },
    get currentCar() { return currentCar; },
    get speed() { return currentCar ? currentCar.speed : 0; },
    get speedKmh() { return Math.abs(currentCar ? currentCar.speed : 0) * 3.6; },
    get isDriving() { return !!currentCar; },
  };
}
