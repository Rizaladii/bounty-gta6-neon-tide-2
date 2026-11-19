# Spec — game/src/traffic.js

Traffic cars and 3D pedestrians, to make the city feel alive.

Exports createTraffic(scene, city, state), returning an object with:
- cars: the array of traffic cars.
- pedestrians: the array of pedestrians.
- update(dt): moves everything each frame.

Behaviour:
- 10 traffic cars drive on the roads at modest speed, following the road
  directions, in varied colors with headlights on. They loosely avoid the
  player (slow down or steer around) but do not chase. They react to the
  environment: they stop at the player's car if it blocks the road.
- 14 pedestrians walk on sidewalks in varied clothes. They react to the
  environment: they step aside when a car comes close, and they run away
  briefly when a gunshot is heard nearby.
- When a traffic car or pedestrian gets far from the player, respawn it at
  a fresh road/walk point so the city stays populated around the player.
- Traffic pauses its movement while the game is paused (the caller stops
  calling update).

Depends only on scene, city, and state.
