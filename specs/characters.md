# Spec — game/src/characters.js

3D models and dialogue portraits for the six characters.

Exports createCharacters(scene), returning an object with one entry per
character — Mara, Teo, Nia, Silas, Valdez, Dex — each with:
- model: a simple 3D figure (built from boxes/capsules, distinct colors and
  silhouette per character) that can be placed in the world for mission
  scenes.
- portrait: a small canvas drawing (stylized, matching the character's
  description) used by the dialogue interface.

Character looks:
- Mara Quill: dark jacket, jeans, boots, short dark hair, a driver.
- Teo Brandt: mechanic, overalls, cap, grease, friendly — keeps Mara's car alive.
- Nia Okafor: yellow jacket with a high blue collar, teal afro/fade hair,
  glowing blue cyberpunk eyewear. This portrait is the most important
  one (it appears in screenshot 2).
- Silas Orrin: boss of the Tidewater Syndicate, dark coat, scar, sharp.
- Captain Ines Valdez: Marigold Harbor Police pursuit chief, dark uniform, cap, stern.
- Dex "Switch" Marlowe: radio DJ and informant, headphones, colorful shirt, knowing smile.

Portraits are drawn on a canvas (2D canvas drawing is fine for portraits;
the 3D game itself stays 3D). Keep each portrait recognizable and distinct.
