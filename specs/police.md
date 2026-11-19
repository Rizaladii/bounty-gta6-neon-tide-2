# Spec — game/src/police.js

The wanted system, police SUVs, roadblocks, spike strips, and the
helicopter.

Exports setupPolice(scene, city, player, car, opts), also available under
the name createPolice, returning an object with:
- getPoliceList(): returns the current units, each an entry with kind
  ("suv", "van", or "heli"), x, z, and state ("chase", "search", or "ram").
  The helicopter appears exactly once in the list, with kind "heli". The
  riot-van appears at wanted 4 and above, with kind "van".
- isPursued(): true while any unit is actively chasing.
- Functions to raise and lower the wanted level (the caller uses these when
  Mara steals a car, shoots, or completes a mission step).

Behaviour:
- Wanted runs 0–5. Ground units: 1 police SUV at wanted 1, up to 5 at
  wanted 5. They chase Mara, ram her car, and at wanted 4 and above they
  set up roadblocks on the roads ahead of her. A riot-van joins at wanted
  4 and above: tough, slow, blocks roads ahead of her.
- Spike strips at wanted 4 and above: placed across a road ahead of Mara;
  driving over one slows the car sharply and damages it.
- Helicopter at wanted 3 and above: a dark helicopter with a searchlight
  cone and a bright light pool, orbiting above Mara. It is the same
  helicopter the camera framing rule refers to.
- SEARCH mode: when Mara breaks line of sight from every unit for a while,
  units switch to searching (they wander the last known area). If she stays
  hidden, wanted drops. The helicopter can see Mara unless a building
  blocks the line from the helicopter to her — check occlusion against the
  city's collision boxes, so SEARCH can still engage at wanted 3 and above.
- BUSTED: when a unit touches Mara while wanted is active, she is busted
  (the caller shows the BUSTED screen).

Depends on scene, city, player, and car. Do not import missions.
