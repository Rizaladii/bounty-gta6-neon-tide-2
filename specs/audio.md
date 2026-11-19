# Spec — game/src/audio.js

Radio and sound effects, all synthesized with Web Audio (no audio files).

Exports an object with:
- 3 radio stations, named "Sunset FM 91.3", "Static Tide 104.7", and
  "Night Pulse 88.8". Each station is a distinct looping musical mood
  (one upbeat sunset pop, one mellow tide groove, one driving night pulse).
- unlockAudio(): call once after a user gesture (a key press or click);
  before that, audio stays silent.
- Functions to switch to the next station (R key) and to turn the radio on
  or off (T key).
- Sounds: engine hum (pitch follows the car's speed), police siren,
  gunshot (different per weapon), punch, and a short mission-complete
  jingle.

The radio only plays while Mara is driving. All sounds are generated, never
fetched. The module must not throw when audio is unavailable (headless).
