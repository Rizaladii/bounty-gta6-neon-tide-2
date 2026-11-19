// game/src/camera.js
//
// Chase camera for NEON TIDE (Port Marigold).
//
// The camera rides behind and above whatever Mara is using — the Zephyr RS
// while she drives, Mara herself on foot — and glides after it with smooth
// damping instead of snapping. It looks ahead in the direction of motion,
// and its field of view opens up as speed rises, so fast driving feels
// fast and slow driving feels calm again.
//
// The one rule that matters most: when a police helicopter is in the sky,
// the camera pulls back, climbs, and widens its field of view until the
// helicopter body, its rotor, its searchlight cone, the light pool on the
// ground, and Mara herself are all inside the same frame at once. The
// camera works that framing out from the real geometry every frame, so it
// holds whatever angle the helicopter happens to be flying at.
//
// The camera also refuses to sit inside a building. The city hands over
// its collision boxes (each with a top height) through a setter; whenever
// the line from the camera to Mara would cross one of those boxes, the
// camera lifts itself above the roof.
//
// Depends only on the THREE.PerspectiveCamera it is given.

import * as THREE from 'three';

// Two chase distances the player flips between with V.
const NEAR_VIEW = { distance: 7.5, height: 3.1, fov: 60 };
const FAR_VIEW = { distance: 11.5, height: 4.8, fov: 64 };

const MAX_FOV = 95; // never wider than this, however fast or high the action
const SPEED_FOV_GAIN = 16; // extra degrees of FOV at top speed
const SPEED_FOV_REF = 45; // m/s treated as "top speed" for the FOV gain
const HELI_MARGIN_DEG = 10; // breathing room around the helicopter framing
const BUILDING_CLEARANCE = 2.0; // metres the camera stays above a roof
const GROUND_CLEARANCE = 1.2; // metres the camera stays above the street

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

// Smoothing factor for a critically-damped-feeling follow: 0 means "stay",
// 1 means "snap". Larger rates track faster.
function dampFactor(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

// Read a world position out of whatever object the caller hands us: a
// THREE.Object3D (or anything with a Vector3-like .position), or a plain
// { x, y?, z } record. Returns null when there is nothing readable.
function readPosition(obj, out) {
  if (!obj) return null;
  const p = obj.position;
  if (p && typeof p.x === 'number' && typeof p.z === 'number') {
    out.set(p.x, typeof p.y === 'number' ? p.y : 0, p.z);
    return out;
  }
  if (typeof obj.x === 'number' && typeof obj.z === 'number') {
    out.set(obj.x, typeof obj.y === 'number' ? obj.y : 0, obj.z);
    return out;
  }
  return null;
}

// Read a velocity vector if the object carries one, otherwise null.
function readVelocity(obj, out) {
  if (!obj || !obj.velocity) return null;
  const v = obj.velocity;
  if (typeof v.x === 'number' && typeof v.z === 'number') {
    out.set(v.x, typeof v.y === 'number' ? v.y : 0, v.z);
    return out;
  }
  return null;
}

// Normalise a city collision box into { minX, maxX, minZ, maxZ, top }.
// Footprints may arrive as min/max corners, as a centre with width/depth,
// or as a centre with half extents. Anything we cannot understand is
// ignored rather than allowed to break the camera.
function normaliseBox(box) {
  if (!box || typeof box !== 'object') return null;
  const top =
    typeof box.top === 'number'
      ? box.top
      : typeof box.height === 'number'
        ? box.height
        : null;
  if (top === null) return null;

  if (
    typeof box.minX === 'number' &&
    typeof box.maxX === 'number' &&
    typeof box.minZ === 'number' &&
    typeof box.maxZ === 'number'
  ) {
    return { minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ, top };
  }

  const cx =
    typeof box.x === 'number'
      ? box.x
      : box.position && typeof box.position.x === 'number'
        ? box.position.x
        : null;
  const cz =
    typeof box.z === 'number'
      ? box.z
      : box.position && typeof box.position.z === 'number'
        ? box.position.z
        : null;
  if (cx === null || cz === null) return null;

  let hx = null;
  let hz = null;
  if (typeof box.halfWidth === 'number' && typeof box.halfDepth === 'number') {
    hx = box.halfWidth;
    hz = box.halfDepth;
  } else if (typeof box.width === 'number' && typeof box.depth === 'number') {
    hx = box.width / 2;
    hz = box.depth / 2;
  } else if (
    box.size &&
    typeof box.size.x === 'number' &&
    typeof box.size.z === 'number'
  ) {
    hx = box.size.x / 2;
    hz = box.size.z / 2;
  }
  if (hx === null || hz === null) return null;

  return { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, top };
}

export function createChaseCamera(camera) {
  let mode = 'near';
  let collisionBoxes = [];
  let currentFov = NEAR_VIEW.fov;
  let initialised = false;

  const smoothedPos = new THREE.Vector3();
  const smoothedLook = new THREE.Vector3();
  const lastPos = new THREE.Vector3();
  const lastForward = new THREE.Vector3(0, 0, 1);

  // Scratch vectors, reused every frame so update() allocates nothing.
  const targetPos = new THREE.Vector3();
  const targetHead = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const heliPos = new THREE.Vector3();
  const rotorPos = new THREE.Vector3();
  const poolPos = new THREE.Vector3();
  const coneMid = new THREE.Vector3();
  const lookDir = new THREE.Vector3();
  const toPoint = new THREE.Vector3();

  // The city hands its collision boxes in through here. Each box needs a
  // top height; boxes we cannot read are dropped at the door.
  function setCollisionBoxes(boxes) {
    collisionBoxes = [];
    if (!Array.isArray(boxes)) return;
    for (const box of boxes) {
      const normal = normaliseBox(box);
      if (normal) collisionBoxes.push(normal);
    }
  }

  function getMode() {
    return mode;
  }

  // V key: flip between the near chase view and the far chase view.
  function toggleMode() {
    mode = mode === 'near' ? 'far' : 'near';
    return mode;
  }

  // Walk the line from the camera toward the target in small steps. Any
  // step that would pass through a building box lifts the camera above
  // that roof, so the camera never films through a wall or sits inside
  // a building.
  function liftAboveBuildings(from, to) {
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      for (const box of collisionBoxes) {
        if (
          x >= box.minX &&
          x <= box.maxX &&
          z >= box.minZ &&
          z <= box.maxZ &&
          y < box.top + BUILDING_CLEARANCE
        ) {
          from.y = Math.max(from.y, box.top + BUILDING_CLEARANCE);
        }
      }
    }
    // The camera itself must never end up inside a roof either.
    for (const box of collisionBoxes) {
      if (
        from.x >= box.minX &&
        from.x <= box.maxX &&
        from.z >= box.minZ &&
        from.z <= box.maxZ &&
        from.y < box.top + BUILDING_CLEARANCE
      ) {
        from.y = Math.max(from.y, box.top + BUILDING_CLEARANCE);
      }
    }
  }

  function update(target, heli, dt, speed) {
    const safeDt = clamp(typeof dt === 'number' ? dt : 0.016, 0, 0.1);
    const safeSpeed =
      typeof speed === 'number' && Number.isFinite(speed)
        ? Math.max(0, speed)
        : 0;
    if (!readPosition(target, targetPos)) return;

    const view = mode === 'far' ? FAR_VIEW : NEAR_VIEW;

    // Which way is the target heading? A supplied velocity wins; otherwise
    // watch how the target actually moved since last frame. Standing still
    // keeps the last heading, so the camera never spins on the spot.
    forward.copy(lastForward);
    if (readVelocity(target, velocity) && velocity.lengthSq() > 0.25) {
      forward.copy(velocity).setY(0).normalize();
    } else if (initialised) {
      delta.subVectors(targetPos, lastPos);
      if (delta.lengthSq() > 1e-6) {
        forward.copy(delta).setY(0).normalize();
      }
    }
    lastForward.copy(forward);
    lastPos.copy(targetPos);

    // Look ahead in the direction of motion: further ahead the faster
    // Mara is going, so the road she is about to drive onto stays in
    // frame. Aim at head height, not at her feet.
    const lookAhead = clamp(safeSpeed * 0.35, 0, 8);
    targetHead.copy(targetPos);
    targetHead.y += 1.6;
    desiredLook.copy(targetHead).addScaledVector(forward, lookAhead);

    // The camera sits behind and above the target, on the line of travel.
    desiredPos
      .copy(targetPos)
      .addScaledVector(forward, -view.distance);
    desiredPos.y = targetPos.y + view.height;

    // The field of view opens with speed and closes again when slow.
    let fovTarget =
      view.fov + clamp(safeSpeed / SPEED_FOV_REF, 0, 1) * SPEED_FOV_GAIN;

    // ---- Helicopter framing (the critical rule) ----
    // When a helicopter is active, the camera must show the helicopter
    // body, its rotor, its searchlight cone, the light pool on the ground,
    // and Mara all at once. So: pull the camera further back, lift it
    // higher, aim at the middle of the player-to-helicopter span, and
    // widen the field of view until the widest angle from the look
    // direction to any of those five points fits inside the frame. If even
    // the widest allowed FOV cannot hold them, pull back further and try
    // the angles again.
    if (heli && readPosition(heli, heliPos)) {
      const separation = heliPos.distanceTo(targetPos);
      let pullBack = clamp(separation * 0.45, 0, 18);
      const lift = clamp(separation * 0.22, 0, 12) + 3;

      rotorPos.copy(heliPos);
      rotorPos.y += 2.5; // the rotor disc sits above the body
      poolPos.set(heliPos.x, 0, heliPos.z); // the light pool, on the ground
      coneMid.lerpVectors(heliPos, poolPos, 0.5); // middle of the light cone
      const framePoints = [targetHead, heliPos, rotorPos, poolPos, coneMid];

      for (let attempt = 0; attempt < 2; attempt++) {
        desiredPos
          .copy(targetPos)
          .addScaledVector(forward, -(view.distance + pullBack));
        desiredPos.y = targetPos.y + view.height + lift;

        // Aim at the middle of the player-to-helicopter span.
        desiredLook.lerpVectors(targetHead, heliPos, 0.5);

        // How wide must the FOV be so every framed point fits? Measure
        // the largest angle between the look direction and any point,
        // then double it (half-angle on each side) plus a margin.
        lookDir.subVectors(desiredLook, desiredPos).normalize();
        let maxAngle = 0;
        for (const point of framePoints) {
          toPoint.subVectors(point, desiredPos);
          const length = toPoint.length();
          if (length < 0.001) continue;
          toPoint.divideScalar(length);
          const angle = Math.acos(clamp(lookDir.dot(toPoint), -1, 1));
          if (angle > maxAngle) maxAngle = angle;
        }
        const neededFov =
          THREE.MathUtils.radToDeg(maxAngle * 2) + HELI_MARGIN_DEG;
        fovTarget = Math.max(fovTarget, clamp(neededFov, view.fov, MAX_FOV));

        // Still too wide to fit? Step further back and re-measure.
        if (neededFov <= MAX_FOV) break;
        pullBack *= 1.5;
      }
    }

    // Never film through a building, and never dip below the street.
    liftAboveBuildings(desiredPos, targetPos);
    desiredPos.y = Math.max(desiredPos.y, GROUND_CLEARANCE);

    // Glide, don't snap: the camera chases its desired spot with a
    // critically-damped feel, and the look target follows a little
    // faster so the view stays steady while the position catches up.
    if (!initialised) {
      smoothedPos.copy(desiredPos);
      smoothedLook.copy(desiredLook);
      initialised = true;
    } else {
      smoothedPos.lerp(desiredPos, dampFactor(5, safeDt));
      smoothedLook.lerp(desiredLook, dampFactor(8, safeDt));
    }

    // The smoothed position can still drift into a roofline while it
    // catches up, so lift it too before placing the camera.
    liftAboveBuildings(smoothedPos, targetPos);
    smoothedPos.y = Math.max(smoothedPos.y, GROUND_CLEARANCE);

    camera.position.copy(smoothedPos);
    camera.lookAt(smoothedLook);

    // Ease the FOV toward its target instead of jumping, and only touch
    // the projection matrix when it actually moved.
    currentFov += (fovTarget - currentFov) * dampFactor(4, safeDt);
    if (Math.abs(camera.fov - currentFov) > 0.01) {
      camera.fov = currentFov;
      camera.updateProjectionMatrix();
    }
  }

  return { update, toggleMode, setCollisionBoxes, getMode };
}
