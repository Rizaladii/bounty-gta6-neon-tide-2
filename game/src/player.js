// game/src/player.js — Mara Quill on foot (NEON TIDE).
//
// Mara is a 3D figure (jacket, jeans, boots) with idle, walk, run, aim and
// shoot poses built from simple joint rotations. WASD moves her relative to
// the camera direction; Shift runs. She slides along building collision
// boxes instead of entering them, starts at the city's spawn point, and
// cannot walk into the ocean (the island edge blocks walking; the harbor
// dock stays walkable).
//
// Depends only on state, input, and city. Never imports car, police, or
// missions.
//
// Input contract (supplied by main.js):
//   input.keys        — Set (or plain object) of currently pressed key
//                       codes, e.g. 'KeyW', 'ShiftLeft'.
//   input.cameraYaw   — current camera yaw in radians (WASD is relative
//                       to this). Falls back to input.yaw, then the spawn
//                       facing.
//   input.forward / backward / left / right / run — optional booleans,
//                       honoured as well as the matching keys.
//
// City contract (supplied by city.js):
//   city.spawn            — { x, z, facing } start point.
//   city.collisionBoxes   — array of boxes, each with a top height; boxes
//                           may be { minX, maxX, minZ, maxZ, top } or
//                           centre/size { x, z, w, d, top }.
//   city.boatSpawn        — { x, z } harbour dock (walkable).
//   city.bounds           — optional { minX, maxX, minZ, maxZ } island edge.

import * as THREE from 'three';

const WALK_SPEED = 4.2; // m/s on foot
const RUN_SPEED = 7.6; // m/s holding Shift
const AIM_SPEED = 2.2; // m/s while aiming
const PLAYER_RADIUS = 0.45; // collision circle around Mara
const ISLAND_HALF = 240; // fallback island half-extent if city gives no bounds
const PUNCH_RANGE = 1.8; // metres in front of Mara
const PUNCH_ARC = Math.PI / 3; // half-angle of the punch cone
const STEP_OVER_TOP = 0.35; // boxes lower than this are stepped over, not walls

// ---------------------------------------------------------------------------
// Small input helpers
// ---------------------------------------------------------------------------

function keyDown(input, codes) {
  if (!input) return false;
  const keys = input.keys;
  if (keys) {
    if (typeof keys.has === 'function') {
      return codes.some((c) => keys.has(c));
    }
    return codes.some((c) => !!keys[c]);
  }
  return false;
}

function cameraYawOf(input, city) {
  if (!input) return (city && city.spawn && city.spawn.facing) || 0;
  if (typeof input.cameraYaw === 'number') return input.cameraYaw;
  if (typeof input.yaw === 'number') return input.yaw;
  if (city && city.spawn && typeof city.spawn.facing === 'number') {
    return city.spawn.facing;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Collision-box normalisation
// ---------------------------------------------------------------------------

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
    const w = b.w ?? b.width ?? b.size ?? 0;
    const d = b.d ?? b.depth ?? b.size ?? 0;
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

// Push a circle (position, radius) out of an axis-aligned box. Pushing out
// along the shortest axis is what makes Mara slide along walls instead of
// stopping dead when she walks into them at an angle.
function resolveBox(pos, box, radius) {
  if (box.top < STEP_OVER_TOP) return; // low curb / planter: step over it
  const cx = Math.max(box.minX, Math.min(pos.x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * radius;
    pos.z = cz + (dz / d) * radius;
    return;
  }
  // Centre is inside the box: push out along the smallest penetration.
  const pl = pos.x - box.minX;
  const pr = box.maxX - pos.x;
  const pt = pos.z - box.minZ;
  const pb = box.maxZ - pos.z;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) pos.x = box.minX - radius;
  else if (m === pr) pos.x = box.maxX + radius;
  else if (m === pt) pos.z = box.minZ - radius;
  else pos.z = box.maxZ + radius;
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------------------------------------------------------------------------
// Mara's 3D figure
// ---------------------------------------------------------------------------

function mat(color, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  return mesh;
}

// Build a limb segment whose pivot sits at its top, so rotating the parent
// group swings it like a real joint.
function limbSegment(w, h, d, material) {
  const mesh = box(w, h, d, material);
  mesh.position.y = -h / 2;
  return mesh;
}

function buildFigure() {
  const group = new THREE.Group(); // root: stands on the ground, faces +Z
  const body = new THREE.Group(); // everything above the feet (leans, bobs)
  group.add(body);

  const jacket = mat(0x1e4d5c); // deep teal jacket
  const jacketDark = mat(0x14333d);
  const coral = mat(0xd94f30); // coral-orange accent, matches the Zephyr RS
  const jeans = mat(0x2c3e63); // dark denim
  const boots = mat(0x1a1210);
  const skin = mat(0xe8b98d, 0.65);
  const hair = mat(0x241a16, 0.6);

  // --- torso: jacket with coral chest stripe and collar ---
  const torso = box(0.52, 0.58, 0.3, jacket);
  torso.position.y = 1.24;
  body.add(torso);
  const stripe = box(0.54, 0.07, 0.31, coral);
  stripe.position.y = 1.38;
  body.add(stripe);
  const collar = box(0.3, 0.1, 0.32, jacketDark);
  collar.position.y = 1.56;
  body.add(collar);
  const belt = box(0.53, 0.06, 0.31, boots);
  belt.position.y = 0.97;
  body.add(belt);

  // --- head: skin, dark hair with a coral streak, simple face shading ---
  const head = new THREE.Group();
  head.position.y = 1.66;
  body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), skin);
  skull.castShadow = true;
  head.add(skull);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
  );
  hairCap.position.y = 0.02;
  hairCap.castShadow = true;
  head.add(hairCap);
  const hairBack = box(0.2, 0.22, 0.08, hair);
  hairBack.position.set(0, -0.02, -0.11);
  head.add(hairBack);
  const streak = box(0.05, 0.16, 0.02, coral);
  streak.position.set(0.1, 0.06, 0.1);
  streak.rotation.z = -0.3;
  head.add(streak);

  // --- arms: shoulder pivots, elbow pivots, hands ---
  function buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.32 * side, 1.46, 0);
    body.add(shoulder);
    shoulder.add(limbSegment(0.13, 0.32, 0.15, jacket));
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    elbow.add(limbSegment(0.11, 0.3, 0.13, jacket));
    const hand = box(0.1, 0.1, 0.11, skin);
    hand.position.y = -0.34;
    elbow.add(hand);
    return { shoulder, elbow };
  }
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // --- legs: hip pivots, knee pivots, boots ---
  function buildLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.14 * side, 0.95, 0);
    body.add(hip);
    hip.add(limbSegment(0.19, 0.45, 0.21, jeans));
    const knee = new THREE.Group();
    knee.position.y = -0.45;
    hip.add(knee);
    knee.add(limbSegment(0.16, 0.38, 0.18, jeans));
    const boot = box(0.17, 0.11, 0.3, boots);
    boot.position.set(0, -0.42, 0.04);
    knee.add(boot);
    return { hip, knee };
  }
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  return { group, body, head, armL, armR, legL, legR };
}

// ---------------------------------------------------------------------------
// createPlayer
// ---------------------------------------------------------------------------

export function createPlayer(scene, state, input, city) {
  const figure = buildFigure();
  const group = figure.group;
  const spawn = (city && city.spawn) || { x: 0, z: 0, facing: 0 };
  group.position.set(spawn.x || 0, 0, spawn.z || 0);
  group.rotation.y = typeof spawn.facing === 'number' ? spawn.facing : 0;
  if (scene) scene.add(group);

  const boxes = ((city && city.collisionBoxes) || [])
    .map(normalizeBox)
    .filter(Boolean);
  const bounds = (city && city.bounds) || {
    minX: -ISLAND_HALF,
    maxX: ISLAND_HALF,
    minZ: -ISLAND_HALF,
    maxZ: ISLAND_HALF,
  };
  const dock = city && city.boatSpawn ? { x: city.boatSpawn.x, z: city.boatSpawn.z } : null;

  const vel = new THREE.Vector3();
  let aiming = false;
  let punchTimer = 0; // seconds left of the melee swing
  let recoilTimer = 0; // seconds left of the shoot recoil
  let walkPhase = 0;
  let currentCar = null;

  // Is (x, z) walkable ground? Inside the island edge, or on the harbour
  // dock around the boat spawn. Everything else is ocean.
  function isWalkable(x, z) {
    if (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ) {
      return true;
    }
    if (dock) {
      const dx = x - dock.x;
      const dz = z - dock.z;
      if (dx * dx + dz * dz <= 16 * 16) return true; // dock planks by the boat
    }
    return false;
  }

  function clampToIsland(pos) {
    if (isWalkable(pos.x, pos.z)) return;
    // Step back toward the island: clamp to the edge, unless the dock
    // circle can take her.
    if (dock) {
      const dx = pos.x - dock.x;
      const dz = pos.z - dock.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= 16) return;
    }
    pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.x));
    pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.z));
  }

  // --- pose targets, eased toward every frame ---------------------------
  function applyPose(dt, moving, speedRatio, running) {
    const t = performance.now() / 1000;
    const k = 1 - Math.exp(-14 * dt); // pose easing rate
    const lerp = (obj, prop, target) => {
      obj[prop] += (target - obj[prop]) * k;
    };

    // Defaults: relaxed idle.
    let legLSwing = 0;
    let legRSwing = 0;
    let kneeL = 0.06;
    let kneeR = 0.06;
    let armLSwing = 0.05 + Math.sin(t * 1.8) * 0.02;
    let armRSwing = 0.05 - Math.sin(t * 1.8) * 0.02;
    let elbowL = -0.15;
    let elbowR = -0.15;
    let bodyLean = 0;
    let bodyBob = Math.sin(t * 1.8) * 0.008;

    if (moving) {
      const amp = running ? 0.85 : 0.55;
      legLSwing = Math.sin(walkPhase) * amp;
      legRSwing = -Math.sin(walkPhase) * amp;
      kneeL = Math.max(0.05, -Math.sin(walkPhase)) * (running ? 1.1 : 0.8);
      kneeR = Math.max(0.05, Math.sin(walkPhase)) * (running ? 1.1 : 0.8);
      armLSwing = -Math.sin(walkPhase) * amp * 0.7;
      armRSwing = Math.sin(walkPhase) * amp * 0.7;
      elbowL = running ? -1.0 : -0.35;
      elbowR = running ? -1.0 : -0.35;
      bodyLean = running ? 0.14 : 0.05;
      bodyBob = Math.abs(Math.sin(walkPhase)) * 0.03;
    }

    if (aiming) {
      // Fighting stance: left foot forward, right arm raised to aim.
      legLSwing = 0.35;
      legRSwing = -0.3;
      kneeL = 0.25;
      kneeR = 0.2;
      armRSwing = -1.45; // right arm forward, level
      elbowR = -0.08; // nearly straight
      armLSwing = -1.15; // left arm across, supporting
      elbowL = -0.7;
      bodyLean = 0.06;
      bodyBob = 0;
    }

    if (punchTimer > 0) {
      // Melee swing: right arm punches forward, then recovers.
      const p = 1 - punchTimer / 0.35; // 0 at swing start, 1 at end
      const thrust = Math.sin(Math.min(p * Math.PI, Math.PI));
      armRSwing = -0.2 - thrust * 1.3;
      elbowR = -0.15 - thrust * 0.1;
      armLSwing = -Math.sin(walkPhase) * 0.3;
      bodyLean = 0.08 + thrust * 0.08;
    }

    if (recoilTimer > 0) {
      // Shoot recoil: right arm kicks up briefly, torso jolts.
      const r = recoilTimer / 0.14;
      armRSwing = -1.45 + r * 0.25;
      bodyLean = 0.06 + r * 0.05;
    }

    lerp(figure.legL.hip.rotation, 'x', legLSwing);
    lerp(figure.legR.hip.rotation, 'x', legRSwing);
    lerp(figure.legL.knee.rotation, 'x', kneeL);
    lerp(figure.legR.knee.rotation, 'x', kneeR);
    lerp(figure.armL.shoulder.rotation, 'x', armLSwing);
    lerp(figure.armR.shoulder.rotation, 'x', armRSwing);
    lerp(figure.armL.elbow.rotation, 'x', elbowL);
    lerp(figure.armR.elbow.rotation, 'x', elbowR);
    lerp(figure.body.rotation, 'x', bodyLean);
    figure.body.position.y = bodyBob;
    // Head stays level and looks where Mara faces.
    lerp(figure.head.rotation, 'x', aiming ? -0.05 : 0);
  }

  function update(dt) {
    const step = Math.min(dt || 0, 0.05);
    if (punchTimer > 0) punchTimer = Math.max(0, punchTimer - step);
    if (recoilTimer > 0) recoilTimer = Math.max(0, recoilTimer - step);

    // While in a car the on-foot figure is hidden and rides with the car.
    if (state && state.inCar) {
      if (currentCar) {
        const cp =
          currentCar.position ||
          (currentCar.group && currentCar.group.position) ||
          (currentCar.mesh && currentCar.mesh.position);
        if (cp) group.position.set(cp.x, 0, cp.z);
      }
      vel.set(0, 0, 0);
      return;
    }

    // --- read movement input, relative to the camera direction ---
    const fwd = keyDown(input, ['KeyW', 'ArrowUp']) || input?.forward === true;
    const back = keyDown(input, ['KeyS', 'ArrowDown']) || input?.backward === true;
    const left = keyDown(input, ['KeyA', 'ArrowLeft']) || input?.left === true;
    const right = keyDown(input, ['KeyD', 'ArrowRight']) || input?.right === true;
    const run = keyDown(input, ['ShiftLeft', 'ShiftRight']) || input?.run === true;

    const yaw = cameraYawOf(input, city);
    // Camera forward on the ground plane (-Z of the camera).
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw); // camera right
    const rz = -Math.sin(yaw);

    let mx = fx * (fwd ? 1 : 0) + fx * (back ? -1 : 0) + rx * (right ? 1 : 0) + rx * (left ? -1 : 0);
    let mz = fz * (fwd ? 1 : 0) + fz * (back ? -1 : 0) + rz * (right ? 1 : 0) + rz * (left ? -1 : 0);
    const moving = mx !== 0 || mz !== 0;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
    }

    const speed = aiming ? AIM_SPEED : run ? RUN_SPEED : WALK_SPEED;
    const tx = mx * speed;
    const tz = mz * speed;
    const smooth = 1 - Math.exp(-10 * step);
    vel.x += (tx - vel.x) * smooth;
    vel.z += (tz - vel.z) * smooth;

    group.position.x += vel.x * step;
    group.position.z += vel.z * step;

    // Slide along buildings, then stay off the ocean.
    for (const b of boxes) resolveBox(group.position, b, PLAYER_RADIUS);
    clampToIsland(group.position);

    // Face where she is going (or where the camera looks while aiming).
    const planarSpeed = Math.hypot(vel.x, vel.z);
    if (planarSpeed > 0.4) {
      const targetYaw = aiming
        ? Math.atan2(fx, fz)
        : Math.atan2(vel.x, vel.z);
      group.rotation.y = angleLerp(group.rotation.y, targetYaw, 1 - Math.exp(-12 * step));
    } else if (aiming) {
      group.rotation.y = angleLerp(group.rotation.y, Math.atan2(fx, fz), 1 - Math.exp(-12 * step));
    }

    walkPhase += step * planarSpeed * 1.7;
    applyPose(step, moving, planarSpeed / RUN_SPEED, run && planarSpeed > 5);
  }

  function enterCar(car) {
    currentCar = car || null;
    group.visible = false;
    if (state) state.inCar = true;
    if (car) {
      const cp =
        car.position ||
        (car.group && car.group.position) ||
        (car.mesh && car.mesh.position);
      if (cp) group.position.set(cp.x, 0, cp.z);
    }
    vel.set(0, 0, 0);
  }

  function exitCar() {
    if (currentCar) {
      const cp =
        currentCar.position ||
        (currentCar.group && currentCar.group.position) ||
        (currentCar.mesh && currentCar.mesh.position);
      const heading =
        typeof currentCar.heading === 'number'
          ? currentCar.heading
          : currentCar.rotation
            ? currentCar.rotation.y
            : group.rotation.y;
      if (cp) {
        // Step out on the driver's side, clear of the car body.
        group.position.set(
          cp.x + Math.cos(heading) * 1.6,
          0,
          cp.z - Math.sin(heading) * 1.6,
        );
      }
      for (const b of boxes) resolveBox(group.position, b, PLAYER_RADIUS);
      clampToIsland(group.position);
    }
    currentCar = null;
    group.visible = true;
    if (state) state.inCar = false;
    vel.set(0, 0, 0);
  }

  // Melee swing. Plays the punch animation and reports whether anything
  // was hit; the combat module decides the damage. Targets are supplied
  // by the combat module through player.punchTargets (array of objects
  // with x/z or a THREE-style position); with no targets registered the
  // swing hits nothing.
  function punch() {
    if ((state && state.inCar) || punchTimer > 0) return false;
    punchTimer = 0.35;
    const targets = player.punchTargets || [];
    const facingX = Math.sin(group.rotation.y);
    const facingZ = Math.cos(group.rotation.y);
    for (const t of targets) {
      const tx = t.position ? t.position.x : t.x;
      const tz = t.position ? t.position.z : t.z;
      if (typeof tx !== 'number' || typeof tz !== 'number') continue;
      const dx = tx - group.position.x;
      const dz = tz - group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > PUNCH_RANGE || dist < 1e-6) continue;
      const dot = (dx * facingX + dz * facingZ) / dist;
      if (dot > Math.cos(PUNCH_ARC)) return true;
    }
    return false;
  }

  function aim(on) {
    aiming = !!on;
  }

  // Brief shoot pose (recoil) for the combat module to trigger on a shot.
  function shoot() {
    recoilTimer = 0.14;
    return true;
  }

  const player = {
    // Live position (THREE.Vector3): other modules read position.x / .z.
    position: group.position,
    update,
    enterCar,
    exitCar,
    punch,
    aim,
    shoot,
    // Optional: melee targets registered by the combat module.
    punchTargets: [],
    get inCar() {
      return !!(state && state.inCar);
    },
    get aiming() {
      return aiming;
    },
  };

  // health mirrors state.health.
  Object.defineProperty(player, 'health', {
    get() {
      return state ? state.health : 100;
    },
    enumerable: true,
  });

  return player;
}
