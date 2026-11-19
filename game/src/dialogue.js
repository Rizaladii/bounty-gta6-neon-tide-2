// game/src/dialogue.js — NEON TIDE dialogue interface.
//
// Shows the character's portrait on the left, their name above the
// English subtitles, in the dialogue box at the bottom of the screen.
// Enter (or a click on the box) advances to the next line; advancing
// past the last line hides the box and calls onDone.
//
// While dialogue is open the game world pauses — the caller (main.js)
// stops frame updates; this module only owns the dialogue UI and its
// input, and stays interactive while open.
//
// Reuses the dialogue box DOM already present in game/index.html
// (#dialogue-box, #dialogue-portrait, #dialogue-name, #dialogue-text,
// #dialogue-hint). No second box is created. No external resources.

// ---------------------------------------------------------------------------
// DOM handles (resolved lazily so the module can be imported before the
// page markup is ready; null until the elements exist).
// ---------------------------------------------------------------------------

function getElements() {
  const box = document.getElementById('dialogue-box');
  if (!box) return null;
  return {
    box,
    portrait: document.getElementById('dialogue-portrait'),
    name: document.getElementById('dialogue-name'),
    text: document.getElementById('dialogue-text'),
    hint: document.getElementById('dialogue-hint'),
  };
}

// ---------------------------------------------------------------------------
// State for the dialogue currently on screen (at most one at a time).
// ---------------------------------------------------------------------------

let current = null; // { lines, index, onDone, openedAt } or null
let keyListener = null;
let clickListener = null;

function isOpen() {
  return current !== null;
}

function drawPortraitInto(canvasEl, portrait) {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  if (portrait && typeof portrait.getContext === 'function') {
    // Portrait canvases from the characters module are 256x256; scale
    // them into this box's 192x192 canvas.
    ctx.drawImage(portrait, 0, 0, canvasEl.width, canvasEl.height);
  }
}

function renderCurrent() {
  const el = getElements();
  if (!el || !current) return;
  const line = current.lines[current.index];
  el.text.textContent = typeof line === 'string' ? line : String(line);
  // Last line: hint the box will close; otherwise it advances.
  if (el.hint) {
    el.hint.textContent = current.index >= current.lines.length - 1
      ? 'ENTER — CLOSE'
      : 'ENTER — CONTINUE';
  }
}

function advance() {
  if (!current) return;
  current.index += 1;
  if (current.index >= current.lines.length) {
    const done = current.onDone;
    hideDialogue();
    if (typeof done === 'function') done();
  } else {
    renderCurrent();
  }
}

function onKeyDown(event) {
  if (!current) return;
  if (event.key === 'Enter') {
    // Keep the game's own Enter handler (start screen, etc.) from also
    // firing while a dialogue is open.
    event.preventDefault();
    event.stopPropagation();
    advance();
  }
}

function onBoxClick(event) {
  if (!current) return;
  // Ignore the click that opened the dialogue (e.g. a mission trigger
  // click bubbling up right after showDialogue ran).
  if (Date.now() - current.openedAt < 150) return;
  event.preventDefault();
  advance();
}

function detachListeners() {
  if (keyListener) {
    window.removeEventListener('keydown', keyListener, true);
    keyListener = null;
  }
  const el = getElements();
  if (clickListener && el) {
    el.box.removeEventListener('click', clickListener);
    clickListener = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// showDialogue(character, lines, onDone)
//   character: an entry from the characters module — { name, portrait }
//     (portrait is the character's 256x256 canvas). A plain object with
//     the same shape also works; a missing portrait just leaves the
//     portrait canvas blank.
//   lines: array of subtitle strings (English). A single string is
//     treated as one line; an empty list calls onDone at once.
//   onDone: called after the last line has been advanced past.
export function showDialogue(character, lines, onDone) {
  // Replace any dialogue already on screen (its onDone is dropped, not
  // called — the new dialogue supersedes it).
  hideDialogue();

  const list = Array.isArray(lines) ? lines.slice() : [lines];
  const clean = list.filter((line) => line !== null && line !== undefined);
  if (clean.length === 0) {
    if (typeof onDone === 'function') onDone();
    return;
  }

  const el = getElements();
  if (!el) {
    // No dialogue box in the page: nothing to show, so finish at once.
    if (typeof onDone === 'function') onDone();
    return;
  }

  const entry = character || {};
  if (el.name) el.name.textContent = entry.name || entry.displayName || '???';
  drawPortraitInto(el.portrait, entry.portrait);

  current = {
    lines: clean,
    index: 0,
    onDone: typeof onDone === 'function' ? onDone : null,
    openedAt: Date.now(),
  };
  renderCurrent();
  el.box.classList.add('open');

  // Capture-phase key listener so Enter advances the dialogue before any
  // other game key handler sees it.
  keyListener = onKeyDown;
  window.addEventListener('keydown', keyListener, true);
  clickListener = onBoxClick;
  el.box.addEventListener('click', clickListener);
}

// hideDialogue()
//   Hides the dialogue box immediately and drops the pending onDone
//   without calling it (use for aborts, e.g. a mission reset).
export function hideDialogue() {
  if (!current && !keyListener && !clickListener) {
    const el = getElements();
    if (el) el.box.classList.remove('open');
    return;
  }
  detachListeners();
  current = null;
  const el = getElements();
  if (el) {
    el.box.classList.remove('open');
    if (el.text) el.text.textContent = '';
    if (el.name) el.name.textContent = '';
    if (el.hint) el.hint.textContent = 'ENTER — CONTINUE';
  }
}

// isDialogueOpen()
//   True while a dialogue is on screen. The caller uses this to pause
//   frame updates while the dialogue stays interactive.
export function isDialogueOpen() {
  return isOpen();
}
