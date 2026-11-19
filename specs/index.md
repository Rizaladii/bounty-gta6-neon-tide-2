# Spec — game/index.html

The page that runs the game.

- An import map that maps the name "three" to ./vendor/three.min.js.
- Loads ./src/main.js as a module script.
- Contains every DOM id the HUD, dialogue, and main module need: the start
  screen (title, New Game button, Continue button, Settings button), the
  settings overlay (volume slider, music toggle, camera default, minimap
  toggle, quality select low/medium/high, auto-downscale toggle, invert Y
  toggle), the HUD (district name, wanted stars, objective box,
  minimap canvas, weapon slots, speedometer, radio widget, money, health
  bar, MHP unit list), the dialogue box (portrait canvas, character name, subtitle text),
  the map overlay (menu, map canvas, legend), the pause overlay, and the
  BUSTED screen (reason line, Retry button).
- No external resources: no CDN links, no web fonts, no images. Everything
  loads from the game/ directory so the game runs fully offline.
- Page title: NEON TIDE.
- The page must parse cleanly (valid HTML).
