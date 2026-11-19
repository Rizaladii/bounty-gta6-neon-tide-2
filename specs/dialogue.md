# Spec — game/src/dialogue.js

The dialogue interface (portrait + name + subtitles).

Exports:
- showDialogue(character, lines, onDone): shows the dialogue box. character
  is one of the entries from the characters module (it carries the portrait
  and the display name). lines is an array of subtitle strings (English).
  onDone is called when the last line has been advanced past.
- hideDialogue(): hides the dialogue box immediately.

Behaviour:
- The dialogue box sits at the bottom of the screen. The character's
  portrait is on the left of the box, their name above the subtitle text.
- Subtitles are in English, readable at 800px wide, and never cover the
  player (the box is at the bottom, the player is kept in the upper part
  of the frame while dialogue is open).
- Enter (or a click) advances to the next line. After the last line, the
  box hides and onDone is called.
- While dialogue is open, the game world pauses (the caller stops the frame
  updates) but the dialogue stays interactive.

Depends on the characters module for portraits. Do not import missions.
