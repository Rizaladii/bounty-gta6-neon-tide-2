# NEON TIDE — Design Document

## Concept

NEON TIDE is a full 3D open-world crime game set in Port Marigold, a
tropical island city at permanent sunset. Golden hour melts into neon dusk:
a deep indigo-to-magenta-to-orange sky gradient, soft volumetric clouds, a
sparkling ocean with reflections, palm-lined boulevards, glass skyscrapers,
and a harbor. Stylish, sun-soaked neo-noir crime story. This is a 3D game
(Three.js / WebGL2) — never 2D, never top-down, never a flat grid.

Player: Mara Quill, getaway driver. Her car is the "Zephyr RS" sports coupe:
low wide wedge silhouette, teal body with coral-orange side stripes, red
underglow, multi-spoke alloy wheels, suspension bounce, and visible damage
states.

Characters (each with a distinct look and a dialogue portrait):
- Teo Brandt — Mara's mechanic, who keeps her car alive and finds parts.
- Nia Okafor — Mara's fixer, the one who finds her jobs; yellow jacket
  with a high blue collar, teal afro/fade hair, glowing blue cyberpunk
  eyewear.
- Silas Orrin — boss of the Tidewater Syndicate, who wants Mara's
  territory.
- Captain Ines Valdez — pursuit chief of the Marigold Harbor Police,
  hunting Mara.
- Dex "Switch" Marlowe — radio DJ and informant; his late-night show
  carries coded messages for Mara.

## City — Port Marigold (sunset, tropical island)

Five districts, each a 3D environment with a distinct color palette:

- Sunset Boardwalk — orange-red, beach, palm trees, string lights, beach
  kiosks, the boardwalk along the ocean.
- Glass Harbor — teal-blue, glass skyscrapers, the harbor with boats, the
  marina.
- Velvet Hills — purple, wealthy hillside houses, winding roads, neon signs.
- Saltworks Docks — gold, warehouses, cranes, containers, the industrial
  docks.
- Old Cinder Town — brick-orange, old brick buildings, narrow streets, the
  old town square. Mara's safehouse garage is here.

The city is a grid of roads with two diagonal avenues, ringed by the ocean.
The sky is a gradient (indigo top, magenta middle, orange at the horizon)
with a low sun, soft clouds, and atmospheric fog/haze for distant buildings.
The ocean sparkles with reflections. Palm trees line the boulevards.
Streetlamps and neon signs bloom. Wet asphalt reflects the red and blue
police lights.

## Story — 8 missions across 5 chapters + side jobs

Mara is Port Marigold's best getaway driver. Nia feeds her jobs; Teo keeps
her car alive; Silas wants her out; Captain Valdez wants her in a cell;
Dex's radio show carries coded messages for her. The story follows one
long job that goes wrong, told in 5 chapters. Three short in-engine
cutscenes play the story beats: an intro before mission 1, Silas's reveal
before mission 5, and the finale after mission 8 (dialogue sequences with
camera moves).

Chapters: 1 "First Light" (missions 1–2), 2 "Static" (missions 3–4),
3 "Velvet" (mission 5), 4 "Fire" (missions 6–7), 5 "Neon Tide"
(mission 8).

1. First Light — Teo gives Mara a simple getaway: pick up a package at the
   Saltworks Docks and drive it to the Boardwalk. Teaches driving and the
   map. Reward $500.
2. Switch's Favor — Dex needs a part from a rival garage in Old Cinder
   Town. Steal a car, bring the part back. Teaches stealing (F). Reward
   $500.
3. Nia's Eyes — Meet Nia on the Boardwalk at night. She shows Mara the
   police are watching Teo. Reach Nia without being busted at wanted 2.
   Reward $500.
4. Harbor Run — A job goes bad at Glass Harbor. Outrun two police units
   across the harbor bridge, then lose them. Reward $750.
5. Velvet Job — Photograph Silas meeting a buyer at a mansion in Velvet
   Hills. Stay near the mansion 20 seconds without being spotted, then
   leave. Reward $750.
6. Hold the Boardwalk — Valdez surrounds the Boardwalk. Hold out 60
   seconds at wanted 3 (helicopter appears) until Teo's van arrives.
   Reward $1,000.
7. Docks on Fire — Silas torches a warehouse in the Saltworks Docks with
   Nia inside. Drive there, protect Nia for 30 seconds at wanted 4
   (roadblocks appear). Reward $1,000.
8. Neon Tide — Final run: deliver the evidence to the radio station, then
   escape the city by speedboat from the harbor. Wanted 5, helicopter plus
   roadblocks plus spike strips. Completing it ends the story. Reward
   $1,500.

Side jobs (optional, repeatable, paid): taxi fares (drive a passenger to a
marker), courier drops (deliver a package fast), getaway practice (lose a
wanted level), street races (beat a rival to a checkpoint), and car theft
list (steal a named car and deliver it). Each pays $100–$300.

Starting money: $500.

## Controls

- WASD: move on foot / drive (W accelerate, S brake/reverse, A/D steer).
- Shift: run on foot.
- F: enter / steal nearest car (on foot), exit car (while driving).
- V: toggle chase camera (near / far).
- M: open / close the map.
- E or left mouse click: punch (on foot, no weapon) / shoot (with a weapon,
  aim with mouse).
- 1 / 2 / 3: select pistol / SMG / shotgun (when owned). Q: fists.
- R: next radio station (while driving). T: radio on/off.
- Enter: start game / advance dialogue.
- Escape: pause (closes the map first if it is open).

## Architecture and file plan

Three.js + WebGL2, static files only, no network requests at runtime.
The game lives in game/, the entry in game/index.html, the build entry in
main.ts at the repo root, vendor/makefun-game.ts copied unchanged from the
kit, and Three.js vendored locally at game/vendor/three.min.js.

Game files (each written fresh from its own spec in specs/ — read ONLY your
own spec file plus the Shared Contracts section of this document, nothing
else):

- game/src/state.js — game state (money, health, wanted, mission, weapons).
- game/src/city.js — Port Marigold: districts, roads, buildings, collision
  boxes, spawn points, spawn, district lookup, road points, ocean, sky,
  sunset.
- game/src/player.js — Mara on foot: 3D figure, movement, collision
  sliding, enter/exit car, punch, aim.
- game/src/car.js — cars: the Zephyr RS plus stealable cars (sports coupe,
  muscle, hatchback, pickup, minibus, scooter) and the speedboat.
- game/src/camera.js — chase camera: dynamic FOV with speed, look-ahead,
  helicopter framing rule.
- game/src/traffic.js — traffic cars and 3D pedestrians.
- game/src/police.js — wanted system, police SUVs, roadblocks, spike
  strips, helicopter with spotlight, SEARCH, BUSTED.
- game/src/combat.js — fists + pistol + SMG + shotgun (aim, recoil).
- game/src/characters.js — 3D models and dialogue portraits for Mara, Teo,
  Nia, Silas, Valdez, Dex.
- game/src/dialogue.js — dialogue interface (portrait, name, subtitles).
- game/src/missions.js — the 8-mission chain + side jobs.
- game/src/hud.js — HUD (layout per the screenshot spec below).
- game/src/map.js — full-city map (M key) with district color blocks.
- game/src/audio.js — radio (3 stations) + engine, siren, gunshot, punch
  sounds via Web Audio.
- game/src/weather.js — day/dusk/night cycle and occasional rain.
- game/src/save.js — save / load / continue + settings via localStorage.
- game/src/main.js — entry: renderer, wiring, start screen, pause,
  BUSTED, settings menu, frame loop, debug handles.
- game/index.html — page with import map for three, module script for
  src/main.js, all DOM ids the HUD needs, no external resources.
- main.ts — kit starter adapted: copies game/ + screenshots/ to the output
  and writes dossier.json.
- vendor/makefun-game.ts — copy unchanged from the kit.
- game/vendor/three.min.js — Three.js module build, vendored locally.

## Shared contracts

These are the exact names every module uses to talk to each other. Do not
rename them. A module exposes exactly what is listed; nothing else is
guaranteed.

- state.js exports: START_MONEY (500), START_HEALTH (100), MAX_WANTED (5),
  WEAPONS (an object with pistol, smg, shotgun — each with name, damage,
  rate, ammo), and an object called state with fields money, health,
  wanted, missionIndex, isWanted, inCar, isBusted, weapon (current weapon
  name or "fists"), ammo (per weapon), plus functions resetState(),
  saveSnapshot(), loadSnapshot(snap).
- city.js exports: createCity(scene) returning an object with districts,
  collisionBoxes (each with a top height), spawn (x, z, facing — on the
  road in front of the safehouse garage, clear of buildings), carSpawns
  (10 points), boatSpawn (the harbor dock), walkPoints, and functions
  getDistrictAt(x, z), randomRoadPoint(), setSunset(enabled). The city
  object is the single source of truth for where things are.
- player.js exports: createPlayer(scene, state, input, city) returning an
  object with position, health, and functions enterCar(car), exitCar(),
  punch(), aim(on). Mara is a 3D figure (jacket, jeans, boots) with idle,
  walk, run, aim, and shoot poses.
- car.js exports: createCars(scene, city, input) returning an object with
  cars (array), playerCar (the Zephyr RS), boat, and functions stealCar(car),
  exitCar(), nearestStealable(position, maxDistance), boardBoat(). The
  Zephyr RS is teal with coral-orange stripes, red underglow, and alloy
  wheels. Other cars: a muscle car, a street hatchback, a pickup, each with
  distinct handling (the sports coupe is fastest, the pickup is slowest
  but toughest, the minibus is heavy and slow, the scooter is nimble and
  fragile with quick acceleration). The speedboat sits at the harbor dock
  and is boarded with F near it.
- camera.js exports: createChaseCamera(camera) with update(target, heli,
  dt, speed) and toggleMode(). The field of view widens with speed. The
  camera looks ahead of the target's motion. CRITICAL RULE: when a
  helicopter is active, the camera raises its look target toward the
  helicopter, pulls back, lifts, and widens its field of view so the
  helicopter body, rotor, searchlight cone, light pool, and the player are
  ALL in frame at once.
- traffic.js exports: createTraffic(scene, city, state) returning an object
  with cars, pedestrians, and update(dt). 10 traffic cars, 14 pedestrians.
- police.js exports: setupPolice(scene, city, player, car, opts) (also as
  createPolice) returning an object with getPoliceList() (each entry has
  kind ("suv", "van", or "heli"), x, z, and state — the helicopter appears
  exactly once, as kind "heli"), isPursued(), and functions to raise/lower
  wanted. Wanted runs 0–5. Ground units: 1 at wanted 1, up to 5 at wanted
  5. A riot-van joins at wanted 4+ (tough, slow, blocks roads). Roadblocks
  at wanted 4+. Spike strips at wanted 4+ (they slow and damage the car).
  Helicopter at wanted 3+ (with a searchlight cone and light pool).
  SEARCH mode when the player breaks line of sight; BUSTED when a unit
  touches the player while wanted is active.
- combat.js exports: createCombat(scene, player, police, opts) with
  constants for each weapon (damage, rate, range, ammo) and functions
  shoot(), punch(), selectWeapon(name). Shooting has recoil (the camera
  kicks slightly) and a muzzle flash. The pistol is accurate, the SMG is
  fast, the shotgun is wide and strong at close range.
- characters.js exports: createCharacters(scene) returning an object with
  a model and a portrait for each of Mara, Teo, Nia, Silas, Valdez, Dex.
  A portrait is a small canvas drawing (stylized, matching the character's
  description). Nia's portrait: yellow jacket with a high blue collar,
  teal afro/fade hair, glowing blue cyberpunk VR glasses.
- dialogue.js exports: showDialogue(character, lines, onDone) and
  hideDialogue(). Shows the character's portrait on the left, their name,
  and subtitles (English) at the bottom. Enter advances a line; the last
  line calls onDone.
- missions.js exports: MISSIONS (array of 8, each with a chapter number
  1–5), CHAPTERS (array of 5, each with a title and its mission range),
  SIDEJOBS (array of 5 kinds), CUTSCENES (intro, reveal, finale),
  setupMissions(state, city, player, car, police, opts) (also as
  createMissions) with startMission(), startCurrent(), update(dt),
  completeMission(), failMission(), reset(), getStatus(), getProgress(),
  getTarget(), startSideJob(kind), playCutscene(id).
- hud.js exports: createHUD(city, police, opts) with update(dt). Layout:
  district name and wanted stars top-left; mission objective box below
  them; square minimap and weapon slots bottom-left; speedometer and radio
  widget bottom-right. Money and health are also shown. Readable at 800px.
- map.js exports: setupMap(city, police, missions) with openMap(),
  closeMap(), toggleMap(), isMapOpen(), drawMap(), updateMap(). The map
  is split-layout: a dark menu on the left ("New Game", "Continue",
  "Settings") with glowing red/orange text, and the full city map on the
  right divided into district color blocks (Boardwalk orange-red, Harbor
  teal-blue, Hills purple, Docks gold, Old Town brick-orange) with white
  road grids and a Legend box at the bottom-right.
- audio.js exports: an object with 3 radio stations ("Sunset FM 91.3",
  "Static Tide 104.7", "Night Pulse 88.8"), unlockAudio(), functions to
  switch station (R) and toggle (T), and engine hum, siren, gunshot,
  punch, and jingle sounds via Web Audio.
- save.js exports: save(), load(), hasSave(), clearSave(),
  onMissionComplete(), getSettings(), setSettings(patch). Settings include
  volume, music, cameraMode, showHUD, minimap, quality (low/medium/high),
  autoDownscale, invertY. Save key: neon-tide-save-v1. Settings key:
  neon-tide-settings-v1.
- weather.js exports: createWeather(scene, city) with setTimeOfDay(t),
  setRain(on), update(dt). Cycles day/dusk/night (sun position, sky
  colors, lamp and neon intensity) and occasional rain (falling streaks,
  wetter road reflections).
- main.js: wires everything in this order — state, city, weather, player,
  car, camera, traffic, police, combat, characters, dialogue, missions,
  HUD, map, audio, save. Start screen, pause, BUSTED screen, settings
  menu (volume, music, camera, minimap, quality low/medium/high with
  auto-downscale, invert Y).
  Frame loop. Exposes window.__NEON_TIDE_READY__ (true when booted) and
  window.__NEON_TIDE_DEBUG__ (subsystem references for testing).

## Key rules

- The game must be 3D (Three.js / WebGL2) and must look 3D in every
  screenshot: chase camera, depth, sky, lighting. Never 2D.
- The game must boot with zero JavaScript errors and reach a ready flag.
- The spawn point is on a road in front of the safehouse, clear of every
  building, so the camera never starts inside a roof.
- The helicopter must be clearly visible in the camera whenever it is
  active (see the camera contract above).
- The HUD money value appears exactly once; minimap labels are clamped
  inside the canvas; map labels never overlap.
- Dialogue sits at the bottom and never covers the player.
- Escape closes the map first, then pauses; it must not leave the game
  stuck.
- After a BUSTED retry, the player health resets to full (both the state
  and the player object).
- Every file must pass node --check. No external resources. The game runs
  fully offline.

## Screenshots (4, JPEG 1280x720, each at most 256 KiB)

1. Hero chase: a low-angle 3D chase camera behind and slightly above the
   teal-and-coral Zephyr RS with red underglow. Two police cars chasing
   closely with flashing red/blue lights reflecting on wet asphalt. A
   helicopter searchlight cone cutting through the dusk. Full HUD: district
   name and 4 wanted stars top-left, objective box below, square minimap
   and weapon slots bottom-left, speedometer/radio bottom-right.
2. Mission dialogue: the dialogue interface showing Nia Okafor's portrait
   (yellow jacket, high blue collar, teal afro/fade hair, glowing blue VR
   glasses), Mara standing on the right, a night boardwalk with string
   lights, beach kiosks, and palm silhouettes behind, English subtitles.
3. Combat: third-person over-the-shoulder view at street level amid neon
   storefronts. Mara shooting an SMG from behind a concrete planter box.
   Vertical purple/pink neon signs, a street food cart on the left, a
   white-and-black police patrol car with flashing sirens on the right.
   Muzzle flashes and bullet impacts visible.
4. Map and UI: the split-layout map screen (M key). Dark menu on the left
   ("New Game", "Continue", "Settings") with glowing red/orange text. Full
   city map on the right with district color blocks and white road grids,
   Legend box bottom-right.

## Build rules (for the agents who build this)

- Each agent writes exactly ONE file, from that file's spec in specs/ plus
  the Shared Contracts section above. Read nothing else. Never read files
  from any previous project (including FROSTLINE and VESPERA KEYS).
- Describe behaviour in prose. Never paste code into a brief, and never
  copy code from another file.
- Run node --check on the file, report, exit. Keep the session short.
- Do not commit. Do not message the user.
