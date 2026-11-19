// police.js — Wanted system, MHP police SUVs, riot-van, roadblocks, spike
// strips, and the police helicopter for NEON TIDE (Port Marigold).
//
// The wanted level (0-5) lives in the shared state object. setupPolice
// keeps the right number of units on the road for the current level,
// chases Mara, rams her car, and busts her when a unit reaches her on
// foot (or pins her stopped car). When Mara breaks line of sight from
// every unit for a while the pursuit drops into SEARCH: units wander her
// last known position, and if she stays hidden the wanted level falls.
//
// The helicopter (wanted 3+) orbits above Mara with a searchlight cone
// and a bright pool of light on the ground. It can see her unless a
// building blocks the line from the helicopter to her, so hiding between
// tall buildings is the way to shake it.
//
// Depends on scene, city, player, and car. Does not import missions.

import * as THREE from '../vendor/three.min.js';
import { state as sharedState, MAX_WANTED } from './state.js';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const CITY_BOUND = 218; // units never drive past the island edge
const SPAWN_MIN_DIST = 35; // units spawn at least this far from Mara
const LOS_GROUND_RANGE = 85; // ground units see this far on open road
const LOS_HELI_RANGE = 160; // the helicopter sees this far
const SEARCH_ENGAGE_TIME = 4; // seconds unseen before units start searching
const HIDDEN_DROP_TIME = 14; // seconds hidden before wanted drops a level
const RAM_RANGE = 7; // metres: inside this, a unit tries to ram
const RAM_DAMAGE = 12; // hull damage per ram hit (plus the wanted level)
const RAM_COOLDOWN = 0.9; // seconds between ram hits from one unit
const BUSTED_FOOT_RANGE = 2.0; // a unit this close to Mara on foot busts her
const BUSTED_CAR_RANGE = 3.0; // a unit this close to her stopped car pins her
const BUSTED_CAR_HOLD = 1.5; // seconds pinned while stopped before BUSTED
const HELI_HEIGHT = 40; // helicopter cruise altitude in metres
const HELI_ORBIT_RADIUS = 26; // orbit radius around its focus point
const HELI_ORBIT_SPEED = 0.3; // radians per second around the orbit
const ROADBLOCK_REPOSITION_TIME = 14; // seconds before a roadblock moves
const ROAD_LINES = [-180, -120, -60, 0, 60, 120, 180];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Wrapped angle difference a - b, in (-PI, PI].
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function angleLerp(a, b, t) {
  return a + angleDiff(b, a) * t;
}

// Normalise a city collision box into { minX, maxX, minZ, maxZ, top }.
// City boxes arrive as centre + width/depth with a top height.
function normalizeBox(b) {
  if (!b) return null;
  if (typeof b.minX === 'number' && typeof b.maxX === 'number') {
    return {
      minX: b.minX,
      maxX: b.maxX,
      minZ: b.minZ,
      maxZ: b.maxZ,
      top: typeof b.top === 'number' ? b.top : Infinity,
    };
  }
  if (typeof b.x === 'number' && typeof b.z === 'number') {
    const w = b.w ?? b.width ?? 0;
    const d = b.d ?? b.depth ?? 0;
    return {
      minX: b.x - w / 2,
      maxX: b.x + w / 2,
      minZ: b.z - d / 2,
      maxZ: b.z + d / 2,
      top: typeof b.top === 'number' ? b.top : Infinity,
    };
  }
  return null;
}

// Is the point (x, z) inside any tall box (with padding)? Low planters
// and curbs (top under 1.5 m) never block a car.
function pointBlocked(boxes, x, z, pad) {
  for (const b of boxes) {
    if (b.top < 1.5) continue;
    if (x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad) {
      return true;
    }
  }
  return false;
}

// Does the 2D segment (ax,az)-(bx,bz) cross the footprint of box b?
// Slab method; returns true when the segment touches the box.
function segmentBlocked2D(ax, az, bx, bz, b) {
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < b.minX || ax > b.maxX) return false;
  } else {
    let t1 = (b.minX - ax) / dx;
    let t2 = (b.maxX - ax) / dx;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < b.minZ || az > b.maxZ) return false;
  } else {
    let t1 = (b.minZ - az) / dz;
    let t2 = (b.maxZ - az) / dz;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// Does the 3D segment (ax,ay,az)-(bx,by,bz) pass through box b?
// The box spans y 0..top. Slab method on all three axes.
function segmentHitsBox3D(ax, ay, az, bx, by, bz, b) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < b.minX || ax > b.maxX) return false;
  } else {
    let t1 = (b.minX - ax) / dx;
    let t2 = (b.maxX - ax) / dx;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (ay < 0 || ay > b.top) return false;
  } else {
    let t1 = (0 - ay) / dy;
    let t2 = (b.top - ay) / dy;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < b.minZ || az > b.maxZ) return false;
  } else {
    let t1 = (b.minZ - az) / dz;
    let t2 = (b.maxZ - az) / dz;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------

function std(color, roughness = 0.6, metalness = 0.3) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(w, h, d, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}

function makeTextTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 96);
  ctx.font = 'bold 56px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeWheelMesh(radius, width) {
  const tireMat = std(0x111111, 0.95, 0.05);
  const hubMat = std(0xb8bec8, 0.3, 0.9);
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spin.add(tire);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 12),
    hubMat,
  );
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  return { pivot, spin };
}

function lightBarMats() {
  return {
    redMat: new THREE.MeshStandardMaterial({
      color: 0x7a0d0d,
      emissive: 0xff1a1a,
      emissiveIntensity: 0.15,
    }),
    blueMat: new THREE.MeshStandardMaterial({
      color: 0x0d1a7a,
      emissive: 0x2255ff,
      emissiveIntensity: 0.15,
    }),
  };
}

// ---------------------------------------------------------------------------
// Vehicle builders — multi-part stylised meshes, all facing +Z.
// ---------------------------------------------------------------------------

// MHP patrol SUV: white body, black hood and trunk, glass cabin, push
// bar, roof light bar, MHP door decals, spinning alloy wheels.
function buildPoliceSUV() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const white = std(0xf2f2f2, 0.35, 0.5);
  const black = std(0x14161a, 0.5, 0.4);
  const glass = std(0x0d1b26, 0.12, 0.9);
  const chrome = std(0xd8dde2, 0.15, 1.0);
  const { redMat, blueMat } = lightBarMats();
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d8,
    emissive: 0xffedb0,
    emissiveIntensity: 1.6,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x7a0d0d,
    emissive: 0xff1a1a,
    emissiveIntensity: 1.4,
  });

  body.add(box(1.9, 0.55, 4.3, white, 0, 0.55, 0)); // lower body
  body.add(box(1.86, 0.1, 1.1, black, 0, 0.86, 1.5)); // hood
  body.add(box(1.86, 0.1, 0.9, black, 0, 0.86, -1.6)); // trunk
  body.add(box(1.7, 0.5, 2.0, glass, 0, 1.05, -0.2)); // cabin glass
  body.add(box(1.72, 0.08, 2.02, white, 0, 1.32, -0.2)); // roof
  // Push bar and bumpers.
  body.add(box(1.7, 0.28, 0.12, black, 0, 0.5, 2.18));
  body.add(box(0.1, 0.5, 0.1, black, -0.6, 0.55, 2.2));
  body.add(box(0.1, 0.5, 0.1, black, 0.6, 0.55, 2.2));
  body.add(box(1.94, 0.16, 0.3, chrome, 0, 0.42, 2.12));
  body.add(box(1.94, 0.16, 0.3, chrome, 0, 0.42, -2.12));
  // Headlights / taillights.
  body.add(box(0.34, 0.14, 0.08, headMat, -0.58, 0.72, 2.16));
  body.add(box(0.34, 0.14, 0.08, headMat, 0.58, 0.72, 2.16));
  body.add(box(0.3, 0.12, 0.08, tailMat, -0.58, 0.72, -2.16));
  body.add(box(0.3, 0.12, 0.08, tailMat, 0.58, 0.72, -2.16));
  // Roof light bar: black base, red left, blue right.
  body.add(box(1.1, 0.1, 0.3, black, 0, 1.42, 0.1));
  body.add(box(0.48, 0.16, 0.28, redMat, -0.28, 1.5, 0.1));
  body.add(box(0.48, 0.16, 0.28, blueMat, 0.28, 1.5, 0.1));
  // MHP door decals.
  const decal = makeTextTexture('MHP', '#0a2a5e');
  const decalMat = new THREE.MeshBasicMaterial({ map: decal, transparent: true });
  for (const side of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), decalMat);
    d.position.set(side * 0.97, 0.62, 0.1);
    d.rotation.y = (side * Math.PI) / 2;
    body.add(d);
  }
  // Wheels.
  const wheels = [];
  const positions = [
    [-0.82, 1.35, true],
    [0.82, 1.35, true],
    [-0.82, -1.35, false],
    [0.82, -1.35, false],
  ];
  for (const [x, z, front] of positions) {
    const w = makeWheelMesh(0.36, 0.26);
    w.pivot.position.set(x, 0.36, z);
    group.add(w.pivot);
    wheels.push({ pivot: w.pivot, spin: w.spin, isFront: front });
  }
  return { group, body, wheels, redMat, blueMat };
}

// MHP riot-van: tall armoured navy box, sloped windscreen, window slits,
// armoured front plate, roof light bar and rails, MHP RIOT decals.
function buildRiotVan() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const navy = std(0x1a2a44, 0.5, 0.5);
  const dark = std(0x10151f, 0.5, 0.4);
  const glass = std(0x0d1b26, 0.12, 0.9);
  const chrome = std(0xd8dde2, 0.15, 1.0);
  const { redMat, blueMat } = lightBarMats();
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d8,
    emissive: 0xffedb0,
    emissiveIntensity: 1.6,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x7a0d0d,
    emissive: 0xff1a1a,
    emissiveIntensity: 1.4,
  });

  body.add(box(2.2, 2.0, 5.0, navy, 0, 1.35, -0.1)); // armoured body
  body.add(box(2.1, 0.9, 1.0, navy, 0, 1.0, 2.6)); // cab nose
  body.add(box(1.9, 0.55, 0.1, glass, 0, 1.35, 3.08, -0.18, 0, 0)); // windscreen
  for (const side of [-1, 1]) {
    body.add(box(0.06, 0.35, 1.2, glass, side * 1.11, 1.9, 1.6)); // window slits
    body.add(box(0.06, 0.35, 1.2, glass, side * 1.11, 1.9, -0.6));
    body.add(box(0.06, 1.4, 2.2, dark, side * 1.11, 1.0, -1.2)); // armour panel
  }
  // Sloped armoured front plate, grille, bumpers.
  body.add(box(2.0, 0.9, 0.12, dark, 0, 0.85, 3.12, -0.25, 0, 0));
  body.add(box(1.6, 0.2, 0.1, dark, 0, 0.55, 3.14));
  body.add(box(2.24, 0.2, 0.34, chrome, 0, 0.45, 3.1));
  body.add(box(2.24, 0.2, 0.34, chrome, 0, 0.45, -2.66));
  // Rear doors with a centre seam.
  body.add(box(2.0, 1.8, 0.08, navy, 0, 1.3, -2.64));
  body.add(box(0.06, 1.8, 0.1, dark, 0, 1.3, -2.66));
  // Headlights / taillights.
  body.add(box(0.36, 0.16, 0.08, headMat, -0.62, 0.95, 3.12));
  body.add(box(0.36, 0.16, 0.08, headMat, 0.62, 0.95, 3.12));
  body.add(box(0.3, 0.14, 0.08, tailMat, -0.62, 0.95, -2.68));
  body.add(box(0.3, 0.14, 0.08, tailMat, 0.62, 0.95, -2.68));
  // Roof light bar and roof rails.
  body.add(box(1.2, 0.1, 0.32, dark, 0, 2.42, 1.6));
  body.add(box(0.52, 0.16, 0.3, redMat, -0.3, 2.5, 1.6));
  body.add(box(0.52, 0.16, 0.3, blueMat, 0.3, 2.5, 1.6));
  body.add(box(0.08, 0.08, 4.6, chrome, -0.95, 2.38, -0.2));
  body.add(box(0.08, 0.08, 4.6, chrome, 0.95, 2.38, -0.2));
  // MHP RIOT decals on the flanks.
  const decal = makeTextTexture('MHP RIOT', '#c8d4e8');
  const decalMat = new THREE.MeshBasicMaterial({ map: decal, transparent: true });
  for (const side of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), decalMat);
    d.position.set(side * 1.12, 1.35, -0.4);
    d.rotation.y = (side * Math.PI) / 2;
    body.add(d);
  }
  // Wheels.
  const wheels = [];
  const positions = [
    [-0.95, 1.8, true],
    [0.95, 1.8, true],
    [-0.95, -1.8, false],
    [0.95, -1.8, false],
  ];
  for (const [x, z, front] of positions) {
    const w = makeWheelMesh(0.45, 0.32);
    w.pivot.position.set(x, 0.45, z);
    group.add(w.pivot);
    wheels.push({ pivot: w.pivot, spin: w.spin, isFront: front });
  }
  return { group, body, wheels, redMat, blueMat };
}

// MHP helicopter: dark fuselage, glass nose, tail boom and fin, skids,
// spinning main and tail rotors, blinking tail beacon, searchlight housing.
function buildHelicopter() {
  const group = new THREE.Group();
  const dark = std(0x1c2126, 0.45, 0.6);
  const glass = std(0x0d1b26, 0.1, 0.9);
  const chrome = std(0xd8dde2, 0.15, 1.0);

  group.add(box(1.9, 1.6, 3.2, dark, 0, 0, 0)); // fuselage
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), glass);
  nose.scale.set(1, 0.85, 0.8);
  nose.position.set(0, -0.05, 1.7);
  nose.castShadow = true;
  group.add(nose);
  group.add(box(0.5, 0.5, 4.2, dark, 0, 0.25, -3.4)); // tail boom
  group.add(box(0.12, 1.4, 0.9, dark, 0, 0.9, -5.3)); // tail fin
  // Skids.
  for (const side of [-1, 1]) {
    group.add(box(0.08, 0.08, 3.0, chrome, side * 0.85, -1.05, 0.2));
    group.add(box(0.08, 0.5, 0.08, chrome, side * 0.85, -0.8, 1.0));
    group.add(box(0.08, 0.5, 0.08, chrome, side * 0.85, -0.8, -0.6));
  }
  // Main rotor on a mast: two crossed blades.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), dark);
  mast.position.y = 1.1;
  group.add(mast);
  const rotor = new THREE.Group();
  rotor.position.y = 1.5;
  rotor.add(box(7.6, 0.06, 0.28, dark, 0, 0, 0));
  rotor.add(box(0.28, 0.06, 7.6, dark, 0, 0, 0));
  group.add(rotor);
  // Tail rotor (spins around the X axis).
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.32, 0.5, -5.2);
  tailRotor.add(box(0.06, 1.6, 0.14, dark, 0, 0, 0));
  tailRotor.add(box(0.06, 0.14, 1.6, dark, 0, 0, 0));
  group.add(tailRotor);
  // Red anti-collision beacon on the tail.
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x7a0d0d,
    emissive: 0xff1a1a,
    emissiveIntensity: 2,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), beaconMat);
  beacon.position.set(0, 1.7, -5.2);
  group.add(beacon);
  // Searchlight housing under the nose.
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 10), chrome);
  lamp.position.set(0, -0.95, 1.2);
  group.add(lamp);
  return { group, rotor, tailRotor, beaconMat };
}

// A roadblock: two parked police SUVs across the road, striped sawhorse
// barriers, and traffic cones. Static; the caller repositions it.
function buildRoadblock(scene) {
  const group = new THREE.Group();
  const orange = std(0xff6b1a, 0.7, 0.1);
  const white = std(0xf2f2f2, 0.6, 0.2);
  const suvA = buildPoliceSUV();
  suvA.group.position.set(-2.4, 0, 0);
  suvA.group.rotation.y = 0.15;
  const suvB = buildPoliceSUV();
  suvB.group.position.set(2.4, 0, 0);
  suvB.group.rotation.y = -0.15;
  group.add(suvA.group, suvB.group);
  // Striped sawhorse barriers between and beside the cars.
  for (const bx of [-4.6, 0, 4.6]) {
    const barrier = new THREE.Group();
    barrier.add(box(1.8, 0.18, 0.1, orange, 0, 0.85, 0));
    barrier.add(box(1.8, 0.18, 0.1, white, 0, 0.65, 0));
    barrier.add(box(0.1, 0.9, 0.1, orange, -0.8, 0.45, 0));
    barrier.add(box(0.1, 0.9, 0.1, orange, 0.8, 0.45, 0));
    barrier.position.set(bx, 0, 1.2);
    group.add(barrier);
  }
  // Traffic cones ahead of the block.
  const coneMat = std(0xff5a1a, 0.8, 0.05);
  for (const cx of [-6, -3, 3, 6]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 10), coneMat);
    cone.position.set(cx, 0.35, 2.6);
    cone.castShadow = true;
    group.add(cone);
  }
  scene.add(group);
  return {
    group,
    suvs: [suvA, suvB],
    carPositions: [],
    lastHit: -10,
    center: { x: 0, z: 0 },
    rotation: 0,
    repositionAt: 0,
  };
}

// A spike strip: a dark base across the road, a row of steel spikes, and
// small warning triangles on posts at each end.
function buildSpikeStrip(scene) {
  const group = new THREE.Group();
  const baseMat = std(0x1a1a1a, 0.8, 0.3);
  const spikeMat = std(0xc8ccd2, 0.25, 0.95);
  const yellowMat = std(0xffe600, 0.7, 0.1);
  group.add(box(6.4, 0.08, 0.6, baseMat, 0, 0.05, 0));
  const spikes = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), spikeMat);
    s.position.set(-3 + i * 0.46, 0.3, i % 2 === 0 ? -0.12 : 0.12);
    s.castShadow = true;
    spikes.add(s);
  }
  group.add(spikes);
  for (const side of [-1, 1]) {
    group.add(box(0.08, 0.9, 0.08, yellowMat, side * 3.4, 0.45, 0));
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 3), yellowMat);
    tri.position.set(side * 3.4, 1.15, 0);
    group.add(tri);
  }
  scene.add(group);
  return { group, spikes, center: { x: 0, z: 0 }, spent: false, respawnTimer: 0 };
}

// ---------------------------------------------------------------------------
// setupPolice
// ---------------------------------------------------------------------------

export function setupPolice(scene, city, player, car, opts = {}) {
  const st = opts.state || sharedState;
  const boxes = ((city && city.collisionBoxes) || []).map(normalizeBox).filter(Boolean);

  const units = []; // ground units, active and wrecked (wrecks are filtered out of the list)
  let heli = null; // the single helicopter unit, or null
  const roadblocks = []; // up to 2
  const strips = []; // up to 2 spike strips
  const smokePuffs = []; // { mesh, life } rising from wrecks

  let time = 0;
  let mode = 'idle'; // 'idle' | 'chase' | 'search'
  let hiddenTimer = 0;
  let bustedHoldTimer = 0;
  const lastSeen = { x: 0, z: 0 };
  const maraPos = new THREE.Vector3();
  if (player && player.position) {
    lastSeen.x = player.position.x;
    lastSeen.z = player.position.z;
    maraPos.copy(player.position);
  }

  // Scratch vectors for the searchlight cone.
  const _coneDir = new THREE.Vector3();
  const _coneNeg = new THREE.Vector3();
  const _coneUp = new THREE.Vector3(0, 1, 0);

  // --- placement helpers ---------------------------------------------------

  function nearestLine(v) {
    let best = ROAD_LINES[0];
    let bd = Math.abs(v - best);
    for (const l of ROAD_LINES) {
      const d = Math.abs(v - l);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }

  // A road point minD..maxD metres from Mara, with the road direction at
  // that point (alongX = the road runs along the X axis).
  function placeOnRoadNear(mx, mz, minD, maxD) {
    for (let i = 0; i < 12; i++) {
      const p = city && typeof city.randomRoadPoint === 'function' ? city.randomRoadPoint() : null;
      if (!p) break;
      const d = Math.hypot(p.x - mx, p.z - mz);
      if (d < minD || d > maxD) continue;
      const dv = Math.abs(p.x - nearestLine(p.x));
      const dh = Math.abs(p.z - nearestLine(p.z));
      return { x: p.x, z: p.z, alongX: dh < dv };
    }
    return { x: clamp(mx + minD, -210, 210), z: mz, alongX: true };
  }

  // A spawn point for a fresh unit: on a road, at least SPAWN_MIN_DIST
  // from Mara so it never pops in on top of her.
  function spawnPoint() {
    const mx = maraPos.x;
    const mz = maraPos.z;
    for (let i = 0; i < 10; i++) {
      const p = city && typeof city.randomRoadPoint === 'function' ? city.randomRoadPoint() : null;
      if (!p) break;
      if (Math.hypot(p.x - mx, p.z - mz) >= SPAWN_MIN_DIST) {
        return { x: p.x, z: p.z, heading: Math.random() * Math.PI * 2 };
      }
    }
    const a = Math.random() * Math.PI * 2;
    return {
      x: clamp(mx + Math.cos(a) * (SPAWN_MIN_DIST + 10), -CITY_BOUND, CITY_BOUND),
      z: clamp(mz + Math.sin(a) * (SPAWN_MIN_DIST + 10), -CITY_BOUND, CITY_BOUND),
      heading: Math.random() * Math.PI * 2,
    };
  }

  // --- unit factories ------------------------------------------------------

  function makeUnit(kind, x, z, heading) {
    const mesh = kind === 'van' ? buildRiotVan() : buildPoliceSUV();
    mesh.group.position.set(x, 0, z);
    mesh.group.rotation.y = heading;
    scene.add(mesh.group);
    const maxHealth = kind === 'van' ? 250 : 100;
    const unit = {
      kind,
      group: mesh.group,
      mesh,
      wheels: mesh.wheels,
      redMat: mesh.redMat,
      blueMat: mesh.blueMat,
      x,
      z,
      heading,
      speed: 0,
      steer: 0,
      state: 'chase',
      health: maxHealth,
      maxHealth,
      radius: kind === 'van' ? 2.2 : 1.7,
      lastRamAt: -10,
      searchTarget: null,
      searchWait: 0,
      disabled: false,
      wreckTimer: 0,
      smokeTimer: 0,
      flashOffset: Math.random() * 2,
      position: mesh.group.position,
    };
    return unit;
  }

  function makeHeli() {
    const built = buildHelicopter();
    scene.add(built.group);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2cc,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true), coneMat);
    scene.add(cone);
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0xfff2cc,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 24), poolMat);
    pool.rotation.x = -Math.PI / 2;
    scene.add(pool);
    const spot = new THREE.SpotLight(0xfff2cc, 300, 160, 0.42, 0.5, 1.1);
    const spotTarget = new THREE.Object3D();
    scene.add(spot, spotTarget);
    spot.target = spotTarget;
    return {
      kind: 'heli',
      group: built.group,
      rotor: built.rotor,
      tailRotor: built.tailRotor,
      beaconMat: built.beaconMat,
      cone,
      pool,
      spot,
      spotTarget,
      x: 0,
      z: 0,
      y: HELI_HEIGHT,
      heading: 0,
      state: 'chase',
      health: Infinity,
      radius: 3,
      orbitAngle: Math.random() * Math.PI * 2,
      disabled: false,
      position: built.group.position,
    };
  }

  function removeUnit(unit) {
    scene.remove(unit.group);
    const i = units.indexOf(unit);
    if (i >= 0) units.splice(i, 1);
  }

  function removeHeli() {
    if (!heli) return;
    scene.remove(heli.group, heli.cone, heli.pool, heli.spot, heli.spotTarget);
    heli = null;
  }

  // --- roadblocks and spike strips ------------------------------------------

  function repositionRoadblock(rb) {
    const p = placeOnRoadNear(maraPos.x, maraPos.z, 30, 55);
    const rot = p.alongX ? Math.PI / 2 : 0;
    rb.group.position.set(p.x, 0, p.z);
    rb.group.rotation.y = rot;
    rb.center.x = p.x;
    rb.center.z = p.z;
    rb.rotation = rot;
    // World positions of the two parked SUVs (local offsets +/-2.4 on X).
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    rb.carPositions = [
      { x: p.x + 2.4 * c, z: p.z - 2.4 * s },
      { x: p.x - 2.4 * c, z: p.z + 2.4 * s },
    ];
    rb.repositionAt = time + ROADBLOCK_REPOSITION_TIME;
  }

  function placeRoadblock() {
    const rb = buildRoadblock(scene);
    repositionRoadblock(rb);
    return rb;
  }

  function repositionStrip(s) {
    const p = placeOnRoadNear(maraPos.x, maraPos.z, 25, 45);
    s.group.position.set(p.x, 0, p.z);
    s.group.rotation.y = p.alongX ? Math.PI / 2 : 0;
    s.center.x = p.x;
    s.center.z = p.z;
    s.spent = false;
    s.spikes.scale.y = 1;
  }

  function placeStrip() {
    const s = buildSpikeStrip(scene);
    repositionStrip(s);
    return s;
  }

  // --- keep the force at the right strength for the wanted level ------------

  function syncUnits() {
    const wanted = st.wanted;
    // Ground units: one per wanted star; one of them is the riot-van at 4+.
    const wantVans = wanted >= 4 ? 1 : 0;
    const wantSuvs = Math.max(0, wanted - wantVans);
    let suvs = 0;
    let vans = 0;
    for (const u of units) {
      if (u.disabled) continue;
      if (u.kind === 'van') vans++;
      else suvs++;
    }
    // Remove extras, farthest from Mara first.
    while (suvs > wantSuvs || vans > wantVans) {
      let worst = null;
      let worstD = -1;
      for (const u of units) {
        if (u.disabled) continue;
        if (u.kind === 'van' && vans <= wantVans) continue;
        if (u.kind !== 'van' && suvs <= wantSuvs) continue;
        const d = (u.x - maraPos.x) * (u.x - maraPos.x) + (u.z - maraPos.z) * (u.z - maraPos.z);
        if (d > worstD) {
          worstD = d;
          worst = u;
        }
      }
      if (!worst) break;
      if (worst.kind === 'van') vans--;
      else suvs--;
      removeUnit(worst);
    }
    // Spawn the missing units.
    while (suvs < wantSuvs) {
      const sp = spawnPoint();
      units.push(makeUnit('suv', sp.x, sp.z, sp.heading));
      suvs++;
    }
    while (vans < wantVans) {
      const sp = spawnPoint();
      units.push(makeUnit('van', sp.x, sp.z, sp.heading));
      vans++;
    }
    // Helicopter at wanted 3+.
    if (wanted >= 3 && !heli) heli = makeHeli();
    if (wanted < 3 && heli) removeHeli();
    // Roadblocks + spike strips at wanted 4+.
    if (wanted >= 4) {
      while (roadblocks.length < 2) roadblocks.push(placeRoadblock());
      while (strips.length < 2) strips.push(placeStrip());
    } else {
      while (roadblocks.length) scene.remove(roadblocks.pop().group);
      while (strips.length) scene.remove(strips.pop().group);
    }
  }

  // --- line of sight ---------------------------------------------------------

  // Can a ground unit see Mara? Open road within range, with no tall
  // building crossing the line between them.
  function groundSees(unit, mx, mz) {
    const dx = mx - unit.x;
    const dz = mz - unit.z;
    if (dx * dx + dz * dz > LOS_GROUND_RANGE * LOS_GROUND_RANGE) return false;
    for (const b of boxes) {
      if (b.top < 2) continue; // low planters and curbs never block a view
      if (segmentBlocked2D(unit.x, unit.z, mx, mz, b)) return false;
    }
    return true;
  }

  // Can the helicopter see Mara? Only a building crossing the 3D line
  // from the helicopter down to her blocks the view — so hiding between
  // tall towers is how she shakes it.
  function heliSees(mx, mz) {
    if (!heli) return false;
    const dx = mx - heli.x;
    const dz = mz - heli.z;
    if (dx * dx + dz * dz > LOS_HELI_RANGE * LOS_HELI_RANGE) return false;
    for (const b of boxes) {
      if (segmentHitsBox3D(heli.x, heli.y, heli.z, mx, 1.2, mz, b)) return false;
    }
    return true;
  }

  // --- BUSTED ----------------------------------------------------------------

  function doBusted() {
    if (st.isBusted) return;
    st.isBusted = true;
    if (typeof opts.onBusted === 'function') opts.onBusted();
  }

  // --- wanted level ----------------------------------------------------------

  function notifyWanted() {
    if (typeof opts.onWantedChange === 'function') opts.onWantedChange(st.wanted);
  }

  function raiseWanted(n = 1) {
    if (st.isBusted) return st.wanted;
    st.wanted = Math.max(0, Math.min(MAX_WANTED, st.wanted + (n || 1)));
    notifyWanted();
    return st.wanted;
  }

  function lowerWanted(n = 1) {
    st.wanted = Math.max(0, Math.min(MAX_WANTED, st.wanted - (n || 1)));
    notifyWanted();
    return st.wanted;
  }

  function setWanted(level) {
    st.wanted = Math.max(0, Math.min(MAX_WANTED, Math.floor(level) || 0));
    notifyWanted();
    return st.wanted;
  }

  // --- unit behaviour ---------------------------------------------------------

  function pickSearchTarget(u) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 22;
    u.searchTarget = {
      x: clamp(lastSeen.x + Math.cos(a) * r, -210, 210),
      z: clamp(lastSeen.z + Math.sin(a) * r, -210, 210),
    };
    u.searchWait = 0.8 + Math.random() * 1.2;
  }

  // Push a unit out of any building box it drove into; scrapes cost speed.
  function resolveUnitCollision(u) {
    const r = u.radius;
    for (const b of boxes) {
      if (b.top < 1.5) continue;
      if (u.x < b.minX - r || u.x > b.maxX + r || u.z < b.minZ - r || u.z > b.maxZ + r) continue;
      const pushL = u.x - (b.minX - r);
      const pushR = b.maxX + r - u.x;
      const pushT = u.z - (b.minZ - r);
      const pushB = b.maxZ + r - u.z;
      const m = Math.min(pushL, pushR, pushT, pushB);
      if (m === pushL) u.x = b.minX - r;
      else if (m === pushR) u.x = b.maxX + r;
      else if (m === pushT) u.z = b.minZ - r;
      else u.z = b.maxZ + r;
      u.speed *= 0.5;
    }
    u.x = clamp(u.x, -CITY_BOUND, CITY_BOUND);
    u.z = clamp(u.z, -CITY_BOUND, CITY_BOUND);
  }

  // One frame of one ground unit. Returns true while the unit is pinning
  // Mara's stopped car (the caller counts the hold time for BUSTED).
  function updateUnit(u, dt, mx, mz) {
    if (u.disabled) return false;
    const playerCar = car && car.currentCar;
    const inCar = !!(playerCar && st.inCar);

    // Destination: Mara herself while chasing, the last known spot while
    // searching (wander it until a new spot is picked).
    let tx = mx;
    let tz = mz;
    if (mode === 'search') {
      if (!u.searchTarget) pickSearchTarget(u);
      tx = u.searchTarget.x;
      tz = u.searchTarget.z;
      if (Math.hypot(tx - u.x, tz - u.z) < 4) {
        u.searchWait -= dt;
        if (u.searchWait <= 0) pickSearchTarget(u);
      }
    }
    const dx = tx - u.x;
    const dz = tz - u.z;
    const dist = Math.hypot(dx, dz);

    if (mode === 'search') u.state = 'search';
    else if (inCar && dist < RAM_RANGE) u.state = 'ram';
    else u.state = 'chase';

    const cruise = u.kind === 'van' ? 20 : 26 + st.wanted * 1.5;
    let targetSpeed = cruise;
    if (u.state === 'ram') targetSpeed = u.kind === 'van' ? 26 : 38;
    if (u.state === 'search') targetSpeed = cruise * 0.55;
    if (u.state === 'search' && u.searchWait > 0 && dist < 4) targetSpeed = 0;

    // Steer toward the target; probe ahead and turn away from buildings.
    let desired = Math.atan2(dx, dz);
    const probeX = u.x + Math.sin(u.heading) * 5;
    const probeZ = u.z + Math.cos(u.heading) * 5;
    if (pointBlocked(boxes, probeX, probeZ, u.radius)) {
      const leftX = u.x + Math.sin(u.heading + 0.8) * 5;
      const leftZ = u.z + Math.cos(u.heading + 0.8) * 5;
      const rightX = u.x + Math.sin(u.heading - 0.8) * 5;
      const rightZ = u.z + Math.cos(u.heading - 0.8) * 5;
      const leftBlocked = pointBlocked(boxes, leftX, leftZ, u.radius);
      const rightBlocked = pointBlocked(boxes, rightX, rightZ, u.radius);
      if (!leftBlocked && rightBlocked) desired = u.heading + 0.8;
      else if (!rightBlocked && leftBlocked) desired = u.heading - 0.8;
      else if (leftBlocked && rightBlocked) desired = u.heading + Math.PI * 0.6;
      else desired = u.heading + 0.8;
    }
    const turnRate = u.kind === 'van' ? 1.8 : 2.4;
    u.heading = angleLerp(u.heading, desired, Math.min(1, turnRate * dt));
    const accel = u.speed < targetSpeed ? 12 : 20;
    if (u.speed < targetSpeed) u.speed = Math.min(targetSpeed, u.speed + accel * dt);
    else u.speed = Math.max(targetSpeed, u.speed - accel * dt);

    u.x += Math.sin(u.heading) * u.speed * dt;
    u.z += Math.cos(u.heading) * u.speed * dt;
    resolveUnitCollision(u);
    u.group.position.set(u.x, 0, u.z);
    u.group.rotation.y = u.heading;

    // Wheels: fronts steer, all spin with road speed.
    const steerAngle = clamp(angleDiff(desired, u.heading), -0.5, 0.5) * 0.6;
    for (const w of u.wheels) {
      if (w.isFront) w.pivot.rotation.y = steerAngle;
      w.spin.rotation.x += (u.speed * dt) / 0.36;
    }

    // Ram contact with Mara's car, and the BUSTED checks.
    let pinning = false;
    if (playerCar) {
      const pd = Math.hypot(playerCar.x - u.x, playerCar.z - u.z);
      const touch = pd < u.radius + (playerCar.radius || 1.7) + 0.3;
      if (touch && time - u.lastRamAt > RAM_COOLDOWN) {
        u.lastRamAt = time;
        if (car && typeof car.damage === 'function') car.damage(RAM_DAMAGE + st.wanted);
        playerCar.speed *= 0.55;
        u.speed *= -0.25; // bounce back off the ram
      }
      if (inCar && touch && Math.abs(playerCar.speed) < 0.5) pinning = true;
    }
    if (!inCar && Math.hypot(mx - u.x, mz - u.z) < BUSTED_FOOT_RANGE) {
      doBusted();
    }
    return pinning;
  }

  // --- helicopter --------------------------------------------------------------

  function aimCone(cone, ax, ay, az, bx, by, bz) {
    // ConeGeometry points its apex along +Y; aim +Y from the ground point
    // up at the helicopter, then stretch the cone over the whole drop.
    _coneDir.set(bx - ax, by - ay, bz - az);
    const len = _coneDir.length() || 1;
    _coneDir.divideScalar(len);
    _coneNeg.copy(_coneDir).negate();
    cone.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    cone.quaternion.setFromUnitVectors(_coneUp, _coneNeg);
    cone.scale.set(len * 0.3, len, len * 0.3);
  }

  function updateHeli(dt, mx, mz) {
    if (!heli) return;
    // Orbit above Mara while chasing, above the last known spot while
    // searching — the helicopter only knows where she is while it sees her.
    const cx = mode === 'search' ? lastSeen.x : mx;
    const cz = mode === 'search' ? lastSeen.z : mz;
    heli.orbitAngle += HELI_ORBIT_SPEED * dt;
    heli.x = cx + Math.cos(heli.orbitAngle) * HELI_ORBIT_RADIUS;
    heli.z = cz + Math.sin(heli.orbitAngle) * HELI_ORBIT_RADIUS;
    heli.y = HELI_HEIGHT;
    heli.state = mode === 'search' ? 'search' : 'chase';
    heli.group.position.set(heli.x, heli.y, heli.z);
    heli.group.rotation.y = Math.atan2(mx - heli.x, mz - heli.z);
    heli.rotor.rotation.y += dt * 18;
    heli.tailRotor.rotation.x += dt * 24;
    heli.beaconMat.emissiveIntensity = time % 1 < 0.5 ? 3 : 0.2;
    // Searchlight aim: Mara while chasing, the last known spot while searching.
    const ax = mode === 'search' ? lastSeen.x : mx;
    const az = mode === 'search' ? lastSeen.z : mz;
    aimCone(heli.cone, heli.x, heli.y - 1, heli.z, ax, 0, az);
    heli.pool.position.set(ax, 0.06, az);
    heli.spot.position.set(heli.x, heli.y - 1, heli.z);
    heli.spotTarget.position.set(ax, 0, az);
  }

  // --- roadblocks and spike strips ----------------------------------------------

  function updateRoadblocks(dt) {
    const playerCar = car && car.currentCar;
    for (const rb of roadblocks) {
      if (
        time >= rb.repositionAt ||
        Math.hypot(rb.center.x - maraPos.x, rb.center.z - maraPos.z) > 80
      ) {
        repositionRoadblock(rb);
      }
      if (!playerCar) continue;
      for (const cp of rb.carPositions) {
        const d = Math.hypot(playerCar.x - cp.x, playerCar.z - cp.z);
        if (d < 3.0 && time - rb.lastHit > 1) {
          rb.lastHit = time;
          if (typeof car.damage === 'function') car.damage(20);
          playerCar.speed *= 0.25;
          playerCar.x -= Math.sin(playerCar.heading) * 1.2;
          playerCar.z -= Math.cos(playerCar.heading) * 1.2;
        }
      }
    }
  }

  function updateStrips(dt) {
    const playerCar = car && car.currentCar;
    for (const s of strips) {
      if (s.spent) {
        s.respawnTimer -= dt;
        if (s.respawnTimer <= 0) repositionStrip(s);
        continue;
      }
      if (!playerCar) continue;
      const d = Math.hypot(playerCar.x - s.center.x, playerCar.z - s.center.z);
      if (d < 2.6) {
        // Drove over the strip: sharp slow-down, tyre damage, spikes flatten.
        s.spent = true;
        s.respawnTimer = 10;
        s.spikes.scale.y = 0.12;
        playerCar.speed *= 0.25;
        if (typeof car.damage === 'function') car.damage(15);
      }
    }
  }

  // --- wrecks and smoke -----------------------------------------------------------

  function disableUnit(u) {
    u.disabled = true;
    u.state = 'disabled';
    u.wreckTimer = 4;
    u.speed = 0;
    u.smokeTimer = 0;
    u.redMat.emissiveIntensity = 0.1;
    u.blueMat.emissiveIntensity = 0.1;
  }

  function updateSmoke(dt) {
    for (let i = smokePuffs.length - 1; i >= 0; i--) {
      const p = smokePuffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        smokePuffs.splice(i, 1);
        continue;
      }
      p.mesh.position.y += dt * 1.4;
      p.mesh.scale.setScalar(1 + (1.6 - p.life) * 0.8);
      p.mesh.material.opacity = Math.max(0, p.life / 1.6) * 0.5;
    }
  }

  function updateWrecks(dt) {
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      if (!u.disabled) continue;
      u.wreckTimer -= dt;
      u.smokeTimer -= dt;
      if (u.smokeTimer <= 0) {
        u.smokeTimer = 0.25;
        const mat = new THREE.MeshBasicMaterial({
          color: 0x777777,
          transparent: true,
          opacity: 0.5,
        });
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), mat);
        puff.position.set(
          u.x + (Math.random() - 0.5),
          1.4,
          u.z + (Math.random() - 0.5),
        );
        scene.add(puff);
        smokePuffs.push({ mesh: puff, life: 1.6 });
      }
      if (u.wreckTimer <= 0) {
        scene.remove(u.group);
        units.splice(i, 1);
      }
    }
    updateSmoke(dt);
  }

  // --- light bars -------------------------------------------------------------------

  function flashLights() {
    for (const u of units) {
      if (u.disabled) continue;
      const redOn = (time * 5 + u.flashOffset) % 2 < 1;
      u.redMat.emissiveIntensity = redOn ? 3.5 : 0.15;
      u.blueMat.emissiveIntensity = redOn ? 0.15 : 3.5;
    }
    for (const rb of roadblocks) {
      const redOn = (time * 5 + 0.7) % 2 < 1;
      for (const suv of rb.suvs) {
        suv.redMat.emissiveIntensity = redOn ? 3.5 : 0.15;
        suv.blueMat.emissiveIntensity = redOn ? 0.15 : 3.5;
      }
    }
  }

  // --- public API ---------------------------------------------------------------------

  function getPoliceList() {
    const list = [];
    for (const u of units) {
      if (u.disabled) continue;
      list.push(u);
    }
    if (heli) list.push(heli);
    return list;
  }

  function isPursued() {
    if (st.wanted <= 0) return false;
    for (const u of units) {
      if (!u.disabled && (u.state === 'chase' || u.state === 'ram')) return true;
    }
    return !!(heli && heli.state === 'chase');
  }

  // Combat calls this when a shot hits a unit. The helicopter cannot be
  // shot down; a ground unit at 0 health becomes a smoking wreck and is
  // replaced by a fresh unit from the dispatch pool.
  function damageUnit(unit, amount) {
    if (!unit || unit.disabled || unit.kind === 'heli') return false;
    unit.health -= amount;
    if (unit.health <= 0) disableUnit(unit);
    return true;
  }

  function reset() {
    for (let i = units.length - 1; i >= 0; i--) scene.remove(units[i].group);
    units.length = 0;
    removeHeli();
    while (roadblocks.length) scene.remove(roadblocks.pop().group);
    while (strips.length) scene.remove(strips.pop().group);
    for (const p of smokePuffs) scene.remove(p.mesh);
    smokePuffs.length = 0;
    st.wanted = 0;
    st.isBusted = false;
    hiddenTimer = 0;
    bustedHoldTimer = 0;
    mode = 'idle';
  }

  function update(dt) {
    const step = Math.min(Math.max(typeof dt === 'number' ? dt : 0.016, 0), 0.05);
    time += step;
    flashLights();
    if (player && player.position) {
      maraPos.set(player.position.x, player.position.y || 0, player.position.z);
    }
    // BUSTED: the pursuit freezes; the helicopter keeps hovering overhead.
    if (st.isBusted) {
      updateHeli(step, maraPos.x, maraPos.z);
      updateWrecks(step);
      return;
    }
    syncUnits();

    // Line of sight: does any unit (ground or helicopter) see Mara?
    const mx = maraPos.x;
    const mz = maraPos.z;
    let visible = false;
    for (const u of units) {
      if (u.disabled) continue;
      if (groundSees(u, mx, mz)) {
        visible = true;
        break;
      }
    }
    if (!visible && heliSees(mx, mz)) visible = true;

    if (st.wanted > 0) {
      if (visible) {
        lastSeen.x = mx;
        lastSeen.z = mz;
        hiddenTimer = 0;
        mode = 'chase';
      } else {
        hiddenTimer += step;
        if (hiddenTimer > SEARCH_ENGAGE_TIME && mode === 'chase') {
          mode = 'search';
          for (const u of units) {
            if (!u.disabled) {
              u.searchTarget = null;
              u.searchWait = 0;
            }
          }
        }
        if (hiddenTimer > HIDDEN_DROP_TIME) {
          lowerWanted(1);
          hiddenTimer = 0;
        }
      }
    } else {
      mode = 'idle';
      hiddenTimer = 0;
    }

    // Ground units; a unit pinning Mara's stopped car counts the hold time.
    let pinning = false;
    for (const u of units) {
      if (updateUnit(u, step, mx, mz)) pinning = true;
    }
    if (pinning) {
      bustedHoldTimer += step;
      if (bustedHoldTimer > BUSTED_CAR_HOLD) doBusted();
    } else {
      bustedHoldTimer = 0;
    }

    updateHeli(step, mx, mz);
    updateRoadblocks(step);
    updateStrips(step);
    updateWrecks(step);
  }

  return {
    getPoliceList,
    isPursued,
    raiseWanted,
    lowerWanted,
    addWanted: raiseWanted,
    setWanted,
    clearWanted: () => setWanted(0),
    update,
    getHeli: () => heli,
    getMode: () => mode,
    getWanted: () => st.wanted,
    damageUnit,
    reset,
    roadblocks,
    spikeStrips: strips,
    units,
  };
}

export { setupPolice as createPolice };
