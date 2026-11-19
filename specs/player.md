# Spec — game/src/player.js

Mara Quill on foot.

Exports createPlayer(scene, state, input, city), returning an object with:
- position (the player's current x/z, readable by other modules).
- health (mirrors state.health).
- enterCar(car): puts Mara in the given car and hides the on-foot figure.
- exitCar(): puts Mara back on foot beside the car.
- punch(): plays a short melee swing and reports whether anything was hit
  (the combat module decides the damage).
- aim(on): switches Mara into or out of the aiming pose.

Behaviour:
- Mara is a 3D figure (jacket, jeans, boots) with idle, walk, run, aim,
  and shoot poses. The poses are simple joint rotations, not motion
  capture.
- WASD moves her relative to the camera direction; Shift runs.
- She slides along building collision boxes instead of entering them (use
  the city's collisionBoxes).
- She starts at the city's spawn point.
- She cannot walk into the ocean (the island edge blocks walking); the
  harbor dock is walkable.

Depends only on state, input, and city. Do not import car, police, or
missions.
