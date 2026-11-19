// traffic.js — Traffic cars and 3D pedestrians for Port Marigold.
//
// Ten traffic cars cruise the roads at modest speed with their headlights
// on, loosely avoiding the player and stopping when the player's car
// blocks the road. Fourteen pedestrians stroll the sidewalks, step aside
// for nearby cars, and run away briefly when a gunshot goes off close by.
// Anything that drifts far from the player is respawned at a fresh point
// near the player so the city always feels populated around them.
//
// Depends only on scene, city, and state. The caller stops calling
// update(dt) while the game is paused, which pauses all traffic.

import * as THREE from 'three';

const TRAFFIC_CAR_COUNT = 10;
const PEDESTRIAN_COUNT = 14;

// Beyond this distance from the player an actor is respawned near them.
const RESPAWN_DISTANCE = 130;
// Respawned actors appear roughly this far from the player.
const RESPAWN_NEAR_MIN = 35;
const RESPAWN_NEAR_MAX = 95;

// Car behaviour tuning.
const CAR_CRUISE_MIN = 6; // m/s, slowest traffic car
const CAR_CRUISE_MAX = 11; // m/s, fastest traffic car
const CAR_STOP_DISTANCE = 7; // stop when something blocks the road here
const CAR_SLOW_DISTANCE = 15; // start slowing inside this range
const CAR_TURN_MIN = 4; // seconds between intersection turns
const CAR_TURN_MAX = 9;

// Pedestrian behaviour tuning.
const PED_WALK_MIN = 0.9; // m/s
const PED_WALK_MAX = 1.7;
const PED_RUN_SPEED = 4.2; // fleeing speed
const PED_FLEE_TIME = 2.5; // seconds of running after a nearby gunshot
const PED_FLEE_RADIUS = 30; // gunshots closer than this scare pedestrians
const PED_SIDESTEP_DISTANCE = 5; // step aside when a car is this close
const PED_SIDESTEP_TIME = 1.1;

const CAR_COLORS = [
  0xd94f3d, // coral red
  0x3d7bd9, // harbour blue
  0xe8b13c, // taxi gold
  0x7fb069, // palm green
  0xb565d8, // velvet purple
  0xe8e4da, // warm white
  0x2e2a33, // dusk black
  0x4ecdc4, // teal
  0xf0789a, // neon pink
  0xc97b2d, // sunset orange
];

const CLOTHES_TOPS = [
  0xff6b6b, 0x4ecdc4, 0xffe66d, 0x9b5de5, 0xf15bb5,
  0x00bbf9, 0xfee440, 0x80ed99, 0xff8fa3, 0x8ecae6,
  0xef8354, 0x90be6d, 0xf9c74f, 0x577590,
];

const CLOTHES_BOTTOMS = [
  0x2b2d42, 0x3a3f5c, 0x5c4a3a, 0x1f2a44, 0x4a4e69, 0x6b705c,
];

const SKIN_TONES = [0xf2c89b, 0xd9a066, 0xa06b3f, 0x8a5a32, 0xe8b98a, 0xc98d5f];

const HAIR_COLORS = [0x1a1210, 0x3d2817, 0x6b4423, 0xd9d9d9, 0x2d1b2e, 0x0f2a2a];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Shortest signed angle from `from` to `to`, in (-PI, PI].
function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------------
// Traffic car mesh: a multi-part sedan with cabin, wheels, headlights with
// visible beams, and red taillights. Headlights stay on, day and dusk.
// ---------------------------------------------------------------------------
function buildTrafficCar(color) {
  const group = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.55,
    roughness: 0.35,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x101c26,
    metalness: 0.9,
    roughness: 0.12,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x1a1a1e,
    metalness: 0.4,
    roughness: 0.6,
  });
  const tyre = new THREE.MeshStandardMaterial({
    color: 0x0c0c0e,
    roughness: 0.95,
  });
  const hub = new THREE.MeshStandardMaterial({
    color: 0xb8bcc2,
    metalness: 0.85,
    roughness: 0.3,
  });

  // Lower body: long wedge with a slightly raised hood line.
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.52, 4.3), paint);
  body.position.y = 0.55;
  group.add(body);

  // Hood scoop hint and a rear decklid lip for silhouette.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.1), paint);
  hood.position.set(0, 0.84, 1.35);
  group.add(hood);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.28), trim);
  spoiler.position.set(0, 0.86, -2.05);
  group.add(spoiler);

  // Cabin with glasshouse and roof.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.5, 2.1), glass);
  cabin.position.set(0, 1.02, -0.25);
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.7), paint);
  roof.position.set(0, 1.3, -0.25);
  group.add(roof);

  // Bumpers.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.22, 0.3), trim);
  bumperF.position.set(0, 0.34, 2.12);
  group.add(bumperF);
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.22, 0.3), trim);
  bumperR.position.set(0, 0.34, -2.12);
  group.add(bumperR);

  // Wheels: dark tyres with bright hubs.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 18);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 12);
  const wheelPositions = [
    [-0.82, 0.36, 1.35],
    [0.82, 0.36, 1.35],
    [-0.82, 0.36, -1.35],
    [0.82, 0.36, -1.35],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
    const hubcap = new THREE.Mesh(hubGeo, hub);
    hubcap.rotation.z = Math.PI / 2;
    hubcap.position.set(x, y, z);
    group.add(hubcap);
  }

  // Headlights: warm emissive lamps plus a faint translucent beam cone.
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c0,
    emissive: 0xffe9a0,
    emissiveIntensity: 2.2,
  });
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a0,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.ConeGeometry(0.85, 5.5, 12, 1, true);
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lampMat);
    lamp.position.set(x, 0.62, 2.16);
    group.add(lamp);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.x = Math.PI / 2 + 0.06;
    beam.position.set(x, 0.55, 4.9);
    group.add(beam);
  }

  // Taillights: red emissive strip.
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x7a0d0d,
    emissive: 0xff1a1a,
    emissiveIntensity: 1.6,
  });
  for (const x of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), tailMat);
    tail.position.set(x, 0.62, -2.16);
    group.add(tail);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Pedestrian mesh: a small stylised 3D figure — torso, head with hair,
// arms and legs that swing while walking, varied clothes and skin.
// ---------------------------------------------------------------------------
function buildPedestrian() {
  const group = new THREE.Group();

  const topColor = pick(CLOTHES_TOPS);
  const bottomColor = pick(CLOTHES_BOTTOMS);
  const skin = pick(SKIN_TONES);
  const hair = pick(HAIR_COLORS);

  const topMat = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.85 });
  const bottomMat = new THREE.MeshStandardMaterial({ color: bottomColor, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 });

  // Legs (pivot at the hip so they can swing).
  const legGeo = new THREE.BoxGeometry(0.16, 0.78, 0.18);
  legGeo.translate(0, -0.39, 0);
  const legL = new THREE.Mesh(legGeo, bottomMat);
  legL.position.set(-0.11, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, bottomMat);
  legR.position.set(0.11, 0.78, 0);
  group.add(legL, legR);

  // Shoes.
  const shoeGeo = new THREE.BoxGeometry(0.17, 0.09, 0.3);
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 0.9 });
  const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
  shoeL.position.set(-0.11, 0.05, 0.05);
  const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
  shoeR.position.set(0.11, 0.05, 0.05);
  group.add(shoeL, shoeR);

  // Torso with a slightly wider shoulder line.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), topMat);
  torso.position.y = 1.09;
  group.add(torso);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.3), topMat);
  shoulders.position.y = 1.36;
  group.add(shoulders);

  // Arms (pivot at the shoulder so they can swing).
  const armGeo = new THREE.BoxGeometry(0.13, 0.6, 0.15);
  armGeo.translate(0, -0.3, 0);
  const armL = new THREE.Mesh(armGeo, topMat);
  armL.position.set(-0.33, 1.36, 0);
  const armR = new THREE.Mesh(armGeo, topMat);
  armR.position.set(0.33, 1.36, 0);
  group.add(armL, armR);

  // Hands.
  const handGeo = new THREE.BoxGeometry(0.12, 0.12, 0.13);
  const handL = new THREE.Mesh(handGeo, skinMat);
  handL.position.set(-0.33, 0.72, 0);
  const handR = new THREE.Mesh(handGeo, skinMat);
  handR.position.set(0.33, 0.72, 0);
  group.add(handL, handR);

  // Head and hair cap; some figures get a sun hat or a cap.
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.32, 0.3),
    skinMat,
  );
  head.position.y = 1.62;
  group.add(head);
  const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.14, 0.33), hairMat);
  hairCap.position.y = 1.8;
  group.add(hairCap);
  if (Math.random() < 0.3) {
    // Wide sun hat.
    const hatMat = new THREE.MeshStandardMaterial({
      color: pick([0xe8d9a0, 0xffffff, 0xd94f3d, 0x4ecdc4]),
      roughness: 0.9,
    });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), hatMat);
    brim.position.y = 1.84;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.14, 12), hatMat);
    crown.position.y = 1.92;
    group.add(brim, crown);
  } else if (Math.random() < 0.35) {
    // Cap.
    const capMat = new THREE.MeshStandardMaterial({
      color: pick([0x2b2d42, 0xd94f3d, 0xe8b13c]),
      roughness: 0.85,
    });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.09, 12, 1, false, 0, Math.PI), capMat);
    cap.position.y = 1.83;
    group.add(cap);
  }

  return { group, legL, legR, armL, armR };
}

// ---------------------------------------------------------------------------
// Traffic system
// ---------------------------------------------------------------------------
export function createTraffic(scene, city, state) {
  // City bounds, derived from the city's own spawn data so cars never
  // drive off the island. Falls back to a generous square if the city
  // offers no points to measure.
  let bound = 240;
  const knownPoints = [];
  if (city) {
    if (Array.isArray(city.carSpawns)) knownPoints.push(...city.carSpawns);
    if (Array.isArray(city.walkPoints)) knownPoints.push(...city.walkPoints);
    if (city.spawn) knownPoints.push(city.spawn);
  }
  if (knownPoints.length > 0) {
    let maxAbs = 0;
    for (const p of knownPoints) {
      maxAbs = Math.max(maxAbs, Math.abs(p.x || 0), Math.abs(p.z || 0));
    }
    if (maxAbs > 20) bound = maxAbs + 20;
  }

  // The player reference. main.js hands the live player object to
  // setPlayer(); as a fallback we also watch state.player / state.playerPos
  // in case the wiring passes the player through state instead.
  let playerRef = null;
  let lastSeenGunshot = null;

  function playerPosition() {
    if (playerRef && playerRef.position) {
      return playerRef.position;
    }
    if (state) {
      if (state.player && state.player.position) return state.player.position;
      if (state.playerPos) return state.playerPos;
      if (state.playerCar && state.playerCar.position) return state.playerCar.position;
    }
    return null;
  }

  function randomRoadPoint() {
    if (city && typeof city.randomRoadPoint === 'function') {
      return city.randomRoadPoint();
    }
    return { x: rand(-bound, bound), z: rand(-bound, bound) };
  }

  function randomWalkPoint() {
    if (city && Array.isArray(city.walkPoints) && city.walkPoints.length > 0) {
      return pick(city.walkPoints);
    }
    const p = randomRoadPoint();
    return { x: p.x + rand(-3, 3), z: p.z + rand(-3, 3) };
  }

  // Pick a fresh road point reasonably near `anchor` (used for respawns).
  function roadPointNear(anchor) {
    let best = randomRoadPoint();
    if (!anchor) return best;
    let bestDist = Infinity;
    for (let i = 0; i < 6; i++) {
      const p = randomRoadPoint();
      const d = Math.hypot(p.x - anchor.x, p.z - anchor.z);
      if (d >= RESPAWN_NEAR_MIN && d <= RESPAWN_NEAR_MAX) return p;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  function walkPointNear(anchor) {
    let best = randomWalkPoint();
    if (!anchor) return best;
    let bestDist = Infinity;
    for (let i = 0; i < 6; i++) {
      const p = randomWalkPoint();
      const d = Math.hypot(p.x - anchor.x, p.z - anchor.z);
      if (d >= RESPAWN_NEAR_MIN && d <= RESPAWN_NEAR_MAX) return p;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  // -- Traffic cars ---------------------------------------------------------

  const cars = [];
  for (let i = 0; i < TRAFFIC_CAR_COUNT; i++) {
    const color = CAR_COLORS[i % CAR_COLORS.length];
    const group = buildTrafficCar(color);
    const start = randomRoadPoint();
    group.position.set(start.x, 0, start.z);
    // Start aligned to a cardinal road direction.
    const yaw = (Math.floor(rand(0, 4)) * Math.PI) / 2;
    group.rotation.y = yaw;
    scene.add(group);
    cars.push({
      group,
      color,
      cruiseSpeed: rand(CAR_CRUISE_MIN, CAR_CRUISE_MAX),
      speed: 0,
      yaw,
      targetYaw: yaw,
      turnTimer: rand(1, CAR_TURN_MAX),
      lateralOffset: 0,
      targetLateral: 0,
      braking: false,
    });
  }

  // -- Pedestrians ----------------------------------------------------------

  const pedestrians = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
    const built = buildPedestrian();
    const start = randomWalkPoint();
    built.group.position.set(start.x, 0, start.z);
    scene.add(built.group);
    pedestrians.push({
      group: built.group,
      legL: built.legL,
      legR: built.legR,
      armL: built.armL,
      armR: built.armR,
      walkSpeed: rand(PED_WALK_MIN, PED_WALK_MAX),
      target: randomWalkPoint(),
      mode: 'walk', // 'walk' | 'flee' | 'sidestep'
      modeTimer: 0,
      fleeDir: { x: 0, z: 1 },
      sidestepDir: { x: 1, z: 0 },
      phase: rand(0, Math.PI * 2),
      yaw: rand(0, Math.PI * 2),
    });
  }

  // -- Car update -----------------------------------------------------------

  function updateCar(car, dt, playerPos) {
    const pos = car.group.position;

    // Turn timer: at an intersection, sometimes turn left, right, or
    // carry on straight. Near the city edge, turn back toward the centre.
    car.turnTimer -= dt;
    const outOfBounds =
      Math.abs(pos.x) > bound - 8 || Math.abs(pos.z) > bound - 8;
    if (car.turnTimer <= 0 || outOfBounds) {
      if (outOfBounds) {
        const toCentre = Math.atan2(-pos.x, -pos.z);
        car.targetYaw = toCentre;
      } else {
        const choice = Math.random();
        if (choice < 0.3) car.targetYaw = car.yaw + Math.PI / 2; // left
        else if (choice < 0.6) car.targetYaw = car.yaw - Math.PI / 2; // right
        else car.targetYaw = car.yaw; // straight on
      }
      car.turnTimer = rand(CAR_TURN_MIN, CAR_TURN_MAX);
    }

    // Ease the yaw toward the target yaw so turns look like steering.
    const dyaw = angleDelta(car.yaw, car.targetYaw);
    const turnRate = 2.2; // rad/s
    const step = clamp(dyaw, -turnRate * dt, turnRate * dt);
    car.yaw += step;
    car.group.rotation.y = car.yaw;

    // Forward direction from the yaw.
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);

    // --- Avoidance: the player, and other traffic cars ahead. ---
    let desiredSpeed = car.cruiseSpeed;
    car.braking = false;
    car.targetLateral = 0;

    const hazards = [];
    if (playerPos) hazards.push(playerPos);
    for (const other of cars) {
      if (other !== car) hazards.push(other.group.position);
    }

    for (const hazard of hazards) {
      const dx = hazard.x - pos.x;
      const dz = hazard.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > CAR_SLOW_DISTANCE || dist < 0.01) continue;
      // Only hazards roughly in front of us matter.
      const ahead = (dx * fx + dz * fz) / dist;
      if (ahead < 0.45) continue;
      // Lateral distance from our lane.
      const lateral = dx * fz - dz * fx;
      if (Math.abs(lateral) > 3.2) continue;

      if (dist < CAR_STOP_DISTANCE) {
        // Something blocks the road right ahead: stop.
        desiredSpeed = 0;
        car.braking = true;
      } else {
        // Ease off and steer around it to the clearer side.
        desiredSpeed = Math.min(desiredSpeed, car.cruiseSpeed * 0.45);
        car.targetLateral = lateral > 0 ? -2.4 : 2.4;
      }
      break; // nearest relevant hazard decides
    }

    // Ease speed toward the desired speed (brakes bite harder than the
    // accelerator so stops look deliberate).
    const accel = desiredSpeed > car.speed ? 3.5 : 9;
    car.speed += clamp(desiredSpeed - car.speed, -accel * dt, accel * dt);
    if (car.speed < 0.01) car.speed = 0;

    // Ease the lateral offset so steering around an obstacle is smooth.
    car.lateralOffset += clamp(
      car.targetLateral - car.lateralOffset,
      -2.5 * dt,
      2.5 * dt,
    );

    // Drive forward, with the lateral offset applied sideways.
    const rx = fz; // right vector
    const rz = -fx;
    pos.x += (fx * car.speed + rx * car.lateralOffset * 0.4) * dt;
    pos.z += (fz * car.speed + rz * car.lateralOffset * 0.4) * dt;

    // Brake lights flare while stopped behind a hazard.
    car.group.traverse((child) => {
      if (child.isMesh && child.material && child.material.emissive) {
        // Only the red taillight material flares; headlights stay steady.
        if (child.material.emissive.getHex() === 0xff1a1a) {
          child.material.emissiveIntensity = car.braking ? 3.2 : 1.6;
        }
      }
    });

    // Far from the player: respawn at a fresh road point near them.
    if (playerPos) {
      const d = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (d > RESPAWN_DISTANCE) {
        const fresh = roadPointNear(playerPos);
        pos.set(fresh.x, 0, fresh.z);
        car.yaw = (Math.floor(rand(0, 4)) * Math.PI) / 2;
        car.targetYaw = car.yaw;
        car.group.rotation.y = car.yaw;
        car.speed = car.cruiseSpeed * 0.5;
        car.lateralOffset = 0;
        car.turnTimer = rand(1, CAR_TURN_MAX);
      }
    }
  }

  // -- Pedestrian update ----------------------------------------------------

  function updatePedestrian(ped, dt, playerPos) {
    const pos = ped.group.position;
    let speed = ped.walkSpeed;

    // A gunshot heard nearby makes pedestrians run away from it briefly.
    // The shot can arrive via notifyGunshot() or via state.lastGunshot.
    let shot = null;
    if (state && state.lastGunshot && state.lastGunshot !== lastSeenGunshot) {
      lastSeenGunshot = state.lastGunshot;
      shot = state.lastGunshot;
    }
    if (shot && typeof shot.x === 'number' && typeof shot.z === 'number') {
      const d = Math.hypot(pos.x - shot.x, pos.z - shot.z);
      if (d < PED_FLEE_RADIUS) {
        ped.mode = 'flee';
        ped.modeTimer = PED_FLEE_TIME;
        const away = Math.max(d, 0.01);
        ped.fleeDir = { x: (pos.x - shot.x) / away, z: (pos.z - shot.z) / away };
      }
    }

    if (ped.mode === 'flee') {
      ped.modeTimer -= dt;
      speed = PED_RUN_SPEED;
      // Run straight away from where the shot came from.
      pos.x += ped.fleeDir.x * speed * dt;
      pos.z += ped.fleeDir.z * speed * dt;
      ped.yaw = Math.atan2(ped.fleeDir.x, ped.fleeDir.z);
      if (ped.modeTimer <= 0) {
        ped.mode = 'walk';
        ped.target = randomWalkPoint();
      }
    } else if (ped.mode === 'sidestep') {
      ped.modeTimer -= dt;
      // Step sideways, away from the road, then carry on walking.
      pos.x += ped.sidestepDir.x * 1.6 * dt;
      pos.z += ped.sidestepDir.z * 1.6 * dt;
      if (ped.modeTimer <= 0) ped.mode = 'walk';
    } else {
      // Walk toward the current sidewalk target.
      const dx = ped.target.x - pos.x;
      const dz = ped.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        ped.target = randomWalkPoint();
      } else {
        const mx = dx / dist;
        const mz = dz / dist;
        pos.x += mx * speed * dt;
        pos.z += mz * speed * dt;
        const targetYaw = Math.atan2(mx, mz);
        ped.yaw += clamp(angleDelta(ped.yaw, targetYaw), -3.5 * dt, 3.5 * dt);
      }

      // Step aside when a car (traffic or the player's) comes close.
      const nearCars = [];
      for (const car of cars) nearCars.push(car.group.position);
      if (playerPos) nearCars.push(playerPos);
      for (const carPos of nearCars) {
        const d = Math.hypot(pos.x - carPos.x, pos.z - carPos.z);
        if (d < PED_SIDESTEP_DISTANCE) {
          ped.mode = 'sidestep';
          ped.modeTimer = PED_SIDESTEP_TIME;
          // Sidestep perpendicular to the direction the car is moving
          // (or, for the player, away from them).
          const awayX = pos.x - carPos.x;
          const awayZ = pos.z - carPos.z;
          const len = Math.max(Math.hypot(awayX, awayZ), 0.01);
          ped.sidestepDir = { x: awayX / len, z: awayZ / len };
          break;
        }
      }
    }

    // Face the direction of travel.
    ped.group.rotation.y = ped.yaw;

    // Walk/run cycle: legs and arms swing in opposition.
    ped.phase += dt * speed * 3.4;
    const swing = Math.sin(ped.phase) * (ped.mode === 'flee' ? 0.75 : 0.5);
    ped.legL.rotation.x = swing;
    ped.legR.rotation.x = -swing;
    ped.armL.rotation.x = -swing * 0.8;
    ped.armR.rotation.x = swing * 0.8;
    // Slight bob while moving.
    ped.group.position.y = Math.abs(Math.sin(ped.phase)) * 0.04;

    // Keep pedestrians inside the city; if one wanders out, send them to
    // a fresh sidewalk point.
    if (Math.abs(pos.x) > bound || Math.abs(pos.z) > bound) {
      const fresh = randomWalkPoint();
      pos.set(fresh.x, 0, fresh.z);
      ped.target = randomWalkPoint();
      ped.mode = 'walk';
    }

    // Far from the player: respawn at a fresh sidewalk point near them.
    if (playerPos) {
      const d = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (d > RESPAWN_DISTANCE) {
        const fresh = walkPointNear(playerPos);
        pos.set(fresh.x, 0, fresh.z);
        ped.target = randomWalkPoint();
        ped.mode = 'walk';
      }
    }
  }

  // -- Public API -----------------------------------------------------------

  function update(dt) {
    const step = clamp(dt || 0, 0, 0.1);
    if (step <= 0) return;
    const playerPos = playerPosition();
    for (const car of cars) updateCar(car, step, playerPos);
    for (const ped of pedestrians) updatePedestrian(ped, step, playerPos);
  }

  // Called by combat (or main.js) when a shot is fired, so nearby
  // pedestrians run away from the sound. Coordinates are world x/z.
  function notifyGunshot(x, z) {
    const shot = { x, z };
    lastSeenGunshot = shot;
    if (state) state.lastGunshot = shot;
    for (const ped of pedestrians) {
      const pos = ped.group.position;
      const d = Math.hypot(pos.x - x, pos.z - z);
      if (d < PED_FLEE_RADIUS) {
        ped.mode = 'flee';
        ped.modeTimer = PED_FLEE_TIME;
        const away = Math.max(d, 0.01);
        ped.fleeDir = { x: (pos.x - x) / away, z: (pos.z - z) / away };
      }
    }
  }

  // main.js hands the live player object here so traffic can avoid the
  // player, stop behind their car, and respawn around them.
  function setPlayer(player) {
    playerRef = player || null;
  }

  return {
    cars,
    pedestrians,
    update,
    notifyGunshot,
    setPlayer,
  };
}
