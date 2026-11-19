# Spec — game/src/combat.js

Fists and three weapons: pistol, SMG, shotgun.

Exports createCombat(scene, player, police, opts), returning an object with:
- shoot(): fires the current weapon toward the aim point (mouse direction).
  Draws a tracer line and a muzzle flash, plays the gunshot sound, damages
  a police unit within range, raises the wanted level, and kicks the camera
  slightly (recoil).
- punch(): a short-range melee swing. Delegates the swing animation to the
  player module, damages a nearby unit, plays the punch sound.
- selectWeapon(name): switches to the named weapon ("pistol", "smg",
  "shotgun") when Mara owns it, or to "fists".

Weapon behaviour (use the WEAPONS constants from state.js):
- Pistol: accurate, moderate damage, moderate fire rate, good range.
- SMG: fast fire rate, lower damage per shot, shorter range, more spread.
- Shotgun: wide spread, high damage at close range, slow fire rate, short
  range.
- Fists: very short range, low damage, no ammo, no noise.

Ammo: each weapon has its own ammo count (from state). Shooting uses 1
ammo. Ammo refills slowly over time and fully on mission completion.
Shooting while driving is not allowed (Mara must be on foot to shoot);
punching works on foot only. A shot that hits nothing still shows the
tracer and plays the sound.

Depends only on scene, player, and police.
