# Spec — game/src/main.js

The entry point. Wires everything together.

Wiring order: state, city, weather, player, car, camera, traffic, police, combat,
characters, dialogue, missions, HUD, map, audio, save.

Behaviour:
- Creates the WebGL2 renderer (1280x720 canvas) and the scene.
- Start screen: title NEON TIDE, a "New Game" button, a "Continue" button
  (Continue only when a save exists), and a "Settings" button. Starting a
  new game resets state and begins mission 1 at the city spawn point.
- Settings menu: volume slider, music on/off, camera default (near/far),
  minimap on/off, quality (low/medium/high), auto-downscale on/off,
  invert Y on/off. Changes are stored via the save module. Quality
  changes the renderer pixel ratio and shadow detail; auto-downscale
  lowers the pixel ratio automatically when the frame rate drops.
- Pause: Escape pauses (and resumes). The map's Escape handling runs
  first, so closing the map does not also pause.
- BUSTED screen: shown when the police bust Mara. Its Retry button
  respawns her at the safehouse and resets her health to full — in BOTH
  the state object and the player object.
- Frame loop with delta time. Each frame: update weather, missions,
  police, traffic, combat, camera, HUD, map (when open), and audio.
  Dialogue pauses the world updates while it is open.
- Key handling: F enters/steals a car (and raises wanted by 1 when stealing
  a parked car) or exits the car, or boards the speedboat near the harbor;
  E punches via combat.punch(); a mouse click shoots via combat.shoot();
  1/2/3 select pistol/SMG/shotgun, Q selects fists; R switches the radio
  station, T toggles it; V toggles the camera mode; M toggles the map.
- Camera target: the car while Mara is driving, Mara on foot otherwise.
  The helicopter reference (when active) is passed to the camera every
  frame so the framing rule applies.
- Exposes window.__NEON_TIDE_READY__ (true once the game has booted) and
  window.__NEON_TIDE_DEBUG__ (an object with the subsystem references, for
  testing).

Must boot with zero JavaScript errors. Must not import anything outside
the src/ directory except three.
