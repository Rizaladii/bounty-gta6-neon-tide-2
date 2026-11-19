# Spec — game/src/weather.js

Day/dusk/night cycle and occasional rain over Port Marigold.

Exports createWeather(scene, city), returning an object with:
- setTimeOfDay(t): sets the time of day, t from 0 (midnight) to 1. Moves
  the sun, shifts the sky colors (day blue, dusk orange-magenta, night
  indigo), and changes lamp and neon intensity (lamps and neon brighten
  at dusk and night).
- setRain(on): turns the rain on or off. Rain is a set of falling streaks
  in front of the camera; while it rains the road looks wetter (stronger
  reflections).
- update(dt): advances the cycle slowly and animates the rain; rain starts
  and stops on its own from time to time (occasional rain).

The default time is permanent sunset (dusk). The cycle drifts slowly
between dusk and night unless the caller sets a time. The module touches
only the sky, the sun light, the lamps, and the rain — it never moves the
player, cars, or buildings.

Depends only on scene and city.
