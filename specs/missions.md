# Spec — game/src/missions.js

The 8-mission story chain plus side jobs, told in 5 chapters.

Exports:
- MISSIONS: an array of 8 entries. Each entry has an id, a title, a short
  briefing (one or two sentences shown in dialogue), an objective line
  (shown in the HUD), a target location (a district and a point), a
  dialogue character, a chapter number (1–5), and a reward in dollars.
- CHAPTERS: an array of 5 entries, each with a number, a title, and its
  mission range: 1 "First Light" (missions 1–2), 2 "Static" (missions
  3–4), 3 "Velvet" (mission 5), 4 "Fire" (missions 6–7), 5 "Neon Tide"
  (mission 8).
- CUTSCENES: three short in-engine cutscenes — "intro" (before mission 1),
  "reveal" (Silas's reveal, before mission 5), "finale" (after mission 8).
  Each is a dialogue sequence with camera moves, played through the
  dialogue module.
- SIDEJOBS: an array of 5 kinds — taxi (drive a passenger to a marker),
  courier (deliver a package fast), getaway (lose a wanted level), race
  (beat a rival to a checkpoint), theft (steal a named car and deliver
  it). Each pays $100–$300.
- setupMissions(state, city, player, car, police, opts), also available
  under the name createMissions, returning an object with:
  - startMission(i): begins mission number i (0-based).
  - startCurrent(): begins the mission at state.missionIndex.
  - update(dt): advances the current mission (checks arrivals, timers,
    holdouts) each frame.
  - completeMission(): pays the reward, advances missionIndex, saves.
  - failMission(): restarts the current mission from its start.
  - reset(): back to mission 0.
  - getStatus(): returns the current mission's state ("idle", "active",
    "complete", "failed").
  - getProgress(): returns a 0-to-1 progress value for the current mission
    (for holdouts and timers).
  - getTarget(): returns the current mission's target point (for the HUD
    minimap and the full map).
  - startSideJob(kind): begins a side job of the given kind.
  - playCutscene(id): plays one of the three cutscenes ("intro",
    "reveal", "finale") through the dialogue module, then calls the
    given onDone when it ends.

The 8 missions, in order:
1. First Light — pick up a package at the Saltworks Docks, drive it to the
   Boardwalk. Teo briefs Mara. Reward $500.
2. Switch's Favor — Dex needs a part from a rival garage in Old Cinder
   Town. Steal a car, bring the part back. Reward $500.
3. Nia's Eyes — meet Nia on the Boardwalk at night. She warns Mara the
   police are watching Teo. Reach Nia without being busted at wanted 2.
   Reward $500.
4. Harbor Run — a job goes bad at Glass Harbor. Outrun two police units
   across the harbor bridge, then lose them. Reward $750.
5. Velvet Job — photograph Silas meeting a buyer at a mansion in Velvet
   Hills. Stay near the mansion 20 seconds without being spotted, then
   leave. Reward $750.
6. Hold the Boardwalk — Valdez surrounds the Boardwalk. Hold out 60
   seconds at wanted 3 (helicopter appears) until Teo's van arrives.
   Reward $1,000.
7. Docks on Fire — Silas torches a warehouse in the Saltworks Docks with
   Nia inside. Drive there, protect Nia for 30 seconds at wanted 4
   (roadblocks appear). Reward $1,000.
8. Neon Tide — deliver the evidence to the radio station, then escape the
   city by speedboat from the harbor. Wanted 5, helicopter plus roadblocks
   plus spike strips. Completing it shows the end screen. Reward $1,500.

Every mission must be completable in the real game loop. Mission 1 must be
verifiable end-to-end (money increases, mission index advances).
