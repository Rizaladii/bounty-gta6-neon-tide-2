# Spec — game/src/map.js

The full-city map (M key), split-layout.

Exports setupMap(city, police, missions), returning an object with:
- openMap(): shows the map overlay.
- closeMap(): hides it.
- toggleMap(): opens when closed, closes when open.
- isMapOpen(): true while the map is shown.
- drawMap(): draws the city on the map canvas.
- updateMap(): refreshes the player, police, and target positions.

Layout (matches screenshot 4):
- Left side: a dark menu with "New Game", "Continue", and "Settings" in
  glowing red/orange text. These are the same actions as the start screen.
- Right side: the full city map, divided into district color blocks
  (Sunset Boardwalk orange-red, Glass Harbor teal-blue, Velvet Hills
  purple, Saltworks Docks gold, Old Cinder Town brick-orange) with white
  road grids, the player marker, police dots, and the mission target.
- A Legend box at the bottom-right explaining the district colors and the
  markers.

Behaviour:
- Map labels never overlap: try candidate offsets around each label and
  pick one that does not collide with another label; treat the mission
  target rectangle as an obstacle.
- The M key and Escape both close the map. The map's key handler stops the
  key event from reaching other handlers, so pressing Escape to close the
  map does not also pause the game.

Depends only on city, police, and missions.
