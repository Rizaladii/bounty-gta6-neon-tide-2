# Spec — game/src/save.js

Save, load, and settings via localStorage.

Exports:
- save(): writes the current money, mission index, health, owned weapons,
  and ammo to storage.
- load(): reads the save and returns the stored values, or nothing when
  there is no save.
- hasSave(): true when a save exists.
- clearSave(): removes the save.
- onMissionComplete(): called when a mission is completed; saves the game.
- getSettings(): returns the settings object (volume, music on/off, camera
  near/far default, minimap on/off, quality "low"/"medium"/"high",
  autoDownscale on/off, invertY on/off), with sensible defaults when
  nothing is stored.
- setSettings(patch): merges the given values into the stored settings.

The save key is neon-tide-save-v1. The settings key is
neon-tide-settings-v1. Values are plain numbers, strings, and booleans.
The module must not throw when localStorage is unavailable (it then
behaves as if there is no save and uses default settings).
