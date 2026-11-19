# Spec — game/src/camera.js

The chase camera.

Exports createChaseCamera(camera), returning an object with:
- update(target, heli, dt, speed): moves the camera each frame. target is
  the thing to follow (the car while Mara is driving, Mara on foot
  otherwise). heli is the helicopter object when one is active, or nothing
  when there is none. dt is the frame delta time. speed is the target's
  current speed (for the dynamic field of view).
- toggleMode(): switches between the near chase view and the far chase view.

Behaviour:
- The camera sits behind and above the target and smoothly follows it,
  with look-ahead in the direction of motion.
- Dynamic field of view: the FOV widens as speed increases (a sense of
  speed), and narrows again when slow.
- CRITICAL HELICOPTER RULE: when a helicopter is active, the camera must
  raise its look target toward the helicopter, pull back, lift up, and
  widen its field of view, so that the helicopter body, its rotor, its
  searchlight cone, its light pool, AND the player are all visible in the
  same frame at once. This is the most important visual requirement in
  the game.
- The camera never goes inside a building: when the line from the camera to
  the target would cross a building box, lift the camera above it (use the
  city's collisionBoxes with their top heights, passed in via a setter).

Depends only on the camera object it is given. Keep it self-contained.
