# Spec — game/src/hud.js

The heads-up display.

Exports createHUD(city, police, opts), returning an object with:
- update(dt): refreshes every HUD element each frame.

Layout (matches screenshot 1):
- Top-left: the current district name and the wanted stars (5 stars, filled
  for the current wanted level, pulsing when wanted is above 0).
- Below the district/stars: the mission objective box (the current
  mission's objective text).
- Bottom-left: a square minimap (canvas) plus the weapon slots (fists,
  pistol, SMG, shotgun — the current one highlighted, locked ones dimmed).
- Bottom-right: a detailed speedometer (with the car's speed and a small
  bar) and the radio widget (current station name).
- Money and health are also shown (money top-right, health as a bar near
  it). The money value appears exactly once on screen. A small MHP unit
  list (the active police units, by kind) sits near the top-right.
- The minimap shows roads, districts, the player dot, police dots, and the
  mission target marker. District labels are clamped inside the canvas and
  never overlap the subtitles.

The HUD must stay readable at 800 pixels wide. All text uses the page's
default font (no external fonts). The HUD reads state through the objects
it is given; it never writes game state.
