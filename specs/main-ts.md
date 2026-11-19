# Spec — main.ts (repo root)

The kit build entry.

- Adapted from the kit starter in the gta6-01 kit.
- Copies the game/ directory and the screenshots/ directory to the output
  directory, and writes dossier.json using the kit's buildDossier helper
  from vendor/makefun-game.ts.
- Must run under Node 22 (the node at ~/workspace/node22/bin/node).
- Must handle the screenshots/ directory being empty on the first run
  (it stops gracefully instead of crashing).
- vendor/makefun-game.ts is copied unchanged from the kit — never edit it.
- game/vendor/three.min.js is the Three.js module build, downloaded once
  and vendored locally (MIT licensed). The kit has no three.min.js, so the
  build agent fetches it from the official Three.js release and verifies it
  loads.
