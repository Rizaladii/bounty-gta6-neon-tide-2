# Spec — game/src/city.js

Builds Port Marigold, the tropical island city at permanent sunset. All
placement uses a seeded random generator so the layout is identical on
every run.

Exports createCity(scene), returning an object with:
- districts: the five districts (Sunset Boardwalk, Glass Harbor, Velvet
  Hills, Saltworks Docks, Old Cinder Town), each with a name, bounds, and a
  color.
- collisionBoxes: one entry per building footprint, each with x, z, width,
  depth, and a top height. Every building the player or a car could hit
  must be in this list.
- spawn: the player start point, an object with x, z, and facing. It sits
  on the road in front of the safehouse garage in Old Cinder Town, clear of
  every building, facing the town square.
- carSpawns: 10 points on roads where parked cars can appear.
- boatSpawn: the harbor dock point where the speedboat sits.
- walkPoints: points on sidewalks for pedestrians.
- getDistrictAt(x, z): returns the name of the district containing the
  point.
- randomRoadPoint(): returns a random point on a road.
- setSunset(enabled): turns the sunset lighting on or off (for testing).

Visuals: a sky gradient (indigo top, magenta middle, orange at the
horizon) with a low sun and soft clouds; the ocean around the island,
sparkling with reflections; palm trees along the boulevards; glass
skyscrapers in Glass Harbor; warehouses and cranes in Saltworks Docks;
brick buildings in Old Cinder Town; neon signs and streetlamps that bloom;
wet asphalt that reflects light. Atmospheric fog/haze for distant
buildings. Each district uses its own palette (Boardwalk orange-red,
Harbor teal-blue, Hills purple, Docks gold, Old Town brick-orange).

The city object is the single source of truth for where things are — no
other module hard-codes positions.
