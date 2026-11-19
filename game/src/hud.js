// hud.js — the single heads-up display for NEON TIDE.
//
// One HUD only: createHUD(city, police, opts) builds the whole overlay
// (district + wanted stars top-left, objective box below them, square
// minimap + weapon slots bottom-left, speedometer + radio bottom-right,
// money and health top-right, MHP unit list near the top-right) and
// returns { update(dt) }. It reads state through the objects it is
// given and never writes game state.
//
// Expected opts (wired by main.js; every field is optional and resolved
// defensively, so the HUD still renders with sensible defaults):
//   state           — the shared state object (money, health, wanted,
//                     weapon, ammo, inCar, missionIndex)
//   player          — player object with position {x, z} and heading
//   car             — car object with currentCar {x, z, speed, heading}
//   missions        — missions object with getStatus() / getTarget()
//   audio           — audio object with getStation() / currentStation
//   ownedWeapons    — array of owned weapon names (fists is always owned)
//   target          — mission target {x, z} (fallback if missions lacks it)
//   container       — DOM node to attach the HUD to (default document.body)
//   minimapSize     — minimap size in CSS pixels (default 150)

import { state as sharedState, MAX_WANTED } from './state.js';

const WORLD_MIN = -220;
const WORLD_MAX = 220;
const WORLD_SIZE = WORLD_MAX - WORLD_MIN;

const STATIONS = ['Sunset FM 91.3', 'Static Tide 104.7', 'Night Pulse 88.8'];

// Fallback district bounds (matches city.js) if city.districts is absent.
const FALLBACK_DISTRICTS = [
  { name: 'Sunset Boardwalk', color: 0xff5a3c, bounds: { minX: -220, maxX: -120, minZ: -220, maxZ: 220 } },
  { name: 'Velvet Hills', color: 0x9b59d0, bounds: { minX: -120, maxX: 60, minZ: -220, maxZ: -80 } },
  { name: 'Glass Harbor', color: 0x2ec4b6, bounds: { minX: 60, maxX: 220, minZ: -220, maxZ: -40 } },
  { name: 'Old Cinder Town', color: 0xc96f2e, bounds: { minX: -120, maxX: 60, minZ: -80, maxZ: 140 } },
  { name: 'Saltworks Docks', color: 0xe8a93c, bounds: { minX: -120, maxX: 220, minZ: 140, maxZ: 220 } },
];

// Short labels for the minimap (clamped inside the canvas).
const SHORT_NAMES = {
  'Sunset Boardwalk': 'Boardwalk',
  'Velvet Hills': 'Velvet Hills',
  'Glass Harbor': 'Glass Harbor',
  'Old Cinder Town': 'Old Cinder',
  'Saltworks Docks': 'Saltworks',
};

const ROAD_LINES = [-180, -120, -60, 0, 60, 120, 180];

const WEAPON_SLOTS = [
  { key: 'Q', name: 'fists', label: 'Fists' },
  { key: '1', name: 'pistol', label: 'Pistol' },
  { key: '2', name: 'smg', label: 'SMG' },
  { key: '3', name: 'shotgun', label: 'Shotgun' },
];

const UNIT_LABELS = {
  suv: 'Patrol SUV',
  van: 'Riot Van',
  heli: 'Helicopter',
};

const HUD_CSS = [
  '#hud{position:fixed;inset:0;pointer-events:none;z-index:20;color:#fff;',
  'font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,.8);}',
  '#hud .hud-panel{background:rgba(10,8,20,.55);border:1px solid rgba(255,255,255,.14);',
  'border-radius:8px;backdrop-filter:blur(2px);}',
  '#hud .hud-top-left{position:absolute;top:14px;left:14px;}',
  '#hud .hud-district{font-size:19px;font-weight:700;letter-spacing:.5px;color:#ffd27a;}',
  '#hud .hud-stars{font-size:19px;letter-spacing:3px;line-height:1.2;margin-top:2px;}',
  '#hud .hud-stars .hud-star{color:rgba(255,255,255,.28);}',
  '#hud .hud-stars .hud-star.on{color:#ffd24a;}',
  '#hud .hud-stars.pulsing{animation:hudPulse 1s ease-in-out infinite;}',
  '@keyframes hudPulse{0%,100%{opacity:1}50%{opacity:.45}}',
  '#hud .hud-search{margin-top:3px;display:inline-block;font-size:11px;font-weight:700;',
  'letter-spacing:2px;color:#ff5a5a;border:1px solid rgba(255,90,90,.6);border-radius:4px;',
  'padding:2px 6px;background:rgba(60,0,0,.45);}',
  '#hud .hud-objective{position:absolute;top:96px;left:14px;max-width:330px;padding:8px 11px;}',
  '#hud .hud-objective-label{display:block;font-size:10px;font-weight:700;letter-spacing:2px;',
  'color:#ff8a5c;margin-bottom:2px;}',
  '#hud .hud-objective-text{font-size:13px;line-height:1.35;}',
  '#hud .hud-top-right{position:absolute;top:14px;right:14px;text-align:right;}',
  '#hud .hud-money{font-size:22px;font-weight:700;color:#7dff9a;}',
  '#hud .hud-health{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:5px;}',
  '#hud .hud-health-label{font-size:10px;font-weight:700;letter-spacing:1px;color:#ffb3a0;}',
  '#hud .hud-health-track{width:120px;height:10px;border-radius:5px;background:rgba(0,0,0,.55);',
  'border:1px solid rgba(255,255,255,.25);overflow:hidden;}',
  '#hud .hud-health-bar{height:100%;width:100%;background:#58d68d;border-radius:5px;}',
  '#hud .hud-health-num{font-size:12px;font-weight:700;min-width:26px;}',
  '#hud .hud-units{margin-top:8px;padding:6px 9px;text-align:left;display:inline-block;}',
  '#hud .hud-units-title{font-size:10px;font-weight:700;letter-spacing:2px;color:#9fd8ff;}',
  '#hud .hud-units-row{font-size:12px;line-height:1.5;}',
  '#hud .hud-bottom-left{position:absolute;left:14px;bottom:14px;display:flex;gap:10px;align-items:flex-end;}',
  '#hud .hud-minimap{display:block;border-radius:8px;border:1px solid rgba(255,255,255,.25);',
  'background:#0d0a18;}',
  '#hud .hud-weapons{display:flex;gap:6px;}',
  '#hud .hud-weapon{width:62px;padding:6px 4px 5px;text-align:center;border-radius:7px;',
  'background:rgba(10,8,20,.55);border:1px solid rgba(255,255,255,.16);}',
  '#hud .hud-weapon.current{border-color:#ffd24a;background:rgba(80,55,0,.6);',
  'box-shadow:0 0 8px rgba(255,210,74,.45);}',
  '#hud .hud-weapon.locked{opacity:.35;}',
  '#hud .hud-weapon-key{display:inline-block;font-size:10px;font-weight:700;color:#ffd27a;',
  'border:1px solid rgba(255,210,122,.6);border-radius:3px;padding:0 4px;margin-bottom:2px;}',
  '#hud .hud-weapon-name{display:block;font-size:11px;font-weight:700;}',
  '#hud .hud-weapon-ammo{display:block;font-size:11px;color:#cfe8ff;margin-top:1px;}',
  '#hud .hud-bottom-right{position:absolute;right:14px;bottom:14px;text-align:right;}',
  '#hud .hud-radio{margin-bottom:7px;padding:6px 10px;display:inline-block;font-size:13px;font-weight:700;}',
  '#hud .hud-radio .hud-radio-note{color:#ffd27a;margin-right:5px;}',
  '#hud .hud-speed{padding:8px 12px 9px;display:inline-block;}',
  '#hud .hud-speed-num{font-size:30px;font-weight:700;line-height:1;color:#fff;}',
  '#hud .hud-speed-unit{font-size:12px;font-weight:700;color:#ffd27a;margin-left:4px;}',
  '#hud .hud-speed-track{width:150px;height:6px;border-radius:3px;background:rgba(0,0,0,.55);',
  'border:1px solid rgba(255,255,255,.2);margin:6px 0 4px auto;overflow:hidden;}',
  '#hud .hud-speed-bar{height:100%;width:0%;background:linear-gradient(90deg,#2ec4b6,#ffd24a,#ff5a3c);}',
  '#hud .hud-speed-car{font-size:11px;letter-spacing:1px;color:#cfe8ff;}',
  '@media (max-width:820px){',
  '#hud .hud-district{font-size:15px;}',
  '#hud .hud-stars{font-size:15px;}',
  '#hud .hud-objective{max-width:230px;top:84px;}',
  '#hud .hud-objective-text{font-size:12px;}',
  '#hud .hud-money{font-size:17px;}',
  '#hud .hud-health-track{width:88px;}',
  '#hud .hud-minimap{width:110px !important;height:110px !important;}',
  '#hud .hud-weapon{width:50px;}',
  '#hud .hud-speed-num{font-size:23px;}',
  '#hud .hud-speed-track{width:110px;}',
  '#hud .hud-radio{font-size:12px;}',
  '}',
].join('\n');

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function cssColor(hex) {
  return '#' + (hex >>> 0).toString(16).padStart(6, '0');
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

export function createHUD(city, police, opts) {
  opts = opts || {};
  const st = opts.state || sharedState;
  const districts = (city && Array.isArray(city.districts) && city.districts.length)
    ? city.districts
    : FALLBACK_DISTRICTS;
  const minimapSize = typeof opts.minimapSize === 'number' ? opts.minimapSize : 150;

  // --- one HUD only: drop any previous HUD root / style before building ---
  const oldRoot = document.getElementById('hud');
  if (oldRoot) oldRoot.remove();
  const oldStyle = document.getElementById('hud-styles');
  if (oldStyle) oldStyle.remove();

  const style = document.createElement('style');
  style.id = 'hud-styles';
  style.textContent = HUD_CSS;
  document.head.appendChild(style);

  const root = makeEl('div');
  root.id = 'hud';
  root.setAttribute('data-hud', 'neon-tide');

  // --- top-left: district + wanted stars + SEARCH tag -----------------------
  const topLeft = makeEl('div', 'hud-top-left');
  const districtEl = makeEl('div', 'hud-district', 'Port Marigold');
  const starsEl = makeEl('div', 'hud-stars');
  const starSpans = [];
  for (let i = 0; i < MAX_WANTED; i++) {
    const s = makeEl('span', 'hud-star', '★');
    starsEl.appendChild(s);
    starSpans.push(s);
  }
  const searchEl = makeEl('div', 'hud-search', 'SEARCH');
  searchEl.style.display = 'none';
  topLeft.appendChild(districtEl);
  topLeft.appendChild(starsEl);
  topLeft.appendChild(searchEl);
  root.appendChild(topLeft);

  // --- objective box ---------------------------------------------------------
  const objectiveBox = makeEl('div', 'hud-panel hud-objective');
  objectiveBox.appendChild(makeEl('span', 'hud-objective-label', 'OBJECTIVE'));
  const objectiveText = makeEl('span', 'hud-objective-text', '');
  objectiveBox.appendChild(objectiveText);
  root.appendChild(objectiveBox);

  // --- top-right: money (exactly once), health bar, MHP unit list ------------
  const topRight = makeEl('div', 'hud-top-right');
  const moneyEl = makeEl('div', 'hud-money', '$0');
  const healthRow = makeEl('div', 'hud-health');
  healthRow.appendChild(makeEl('span', 'hud-health-label', 'HEALTH'));
  const healthTrack = makeEl('div', 'hud-health-track');
  const healthBar = makeEl('div', 'hud-health-bar');
  healthTrack.appendChild(healthBar);
  healthRow.appendChild(healthTrack);
  const healthNum = makeEl('span', 'hud-health-num', '100');
  healthRow.appendChild(healthNum);
  const unitsBox = makeEl('div', 'hud-panel hud-units');
  unitsBox.appendChild(makeEl('div', 'hud-units-title', 'MHP UNITS'));
  const unitsRows = makeEl('div');
  unitsBox.appendChild(unitsRows);
  unitsBox.style.display = 'none';
  topRight.appendChild(moneyEl);
  topRight.appendChild(healthRow);
  topRight.appendChild(unitsBox);
  root.appendChild(topRight);

  // --- bottom-left: minimap + weapon slots ------------------------------------
  const bottomLeft = makeEl('div', 'hud-bottom-left');
  const minimap = document.createElement('canvas');
  minimap.className = 'hud-minimap';
  const dpr = Math.min(typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1, 2);
  minimap.width = Math.round(minimapSize * dpr);
  minimap.height = Math.round(minimapSize * dpr);
  minimap.style.width = minimapSize + 'px';
  minimap.style.height = minimapSize + 'px';
  const mctx = minimap.getContext('2d');
  bottomLeft.appendChild(minimap);

  const weaponsEl = makeEl('div', 'hud-weapons');
  const slotEls = {};
  for (const slot of WEAPON_SLOTS) {
    const slotEl = makeEl('div', 'hud-weapon');
    slotEl.appendChild(makeEl('span', 'hud-weapon-key', slot.key));
    slotEl.appendChild(makeEl('span', 'hud-weapon-name', slot.label));
    const ammoEl = makeEl('span', 'hud-weapon-ammo', slot.name === 'fists' ? '∞' : '0');
    slotEl.appendChild(ammoEl);
    weaponsEl.appendChild(slotEl);
    slotEls[slot.name] = { el: slotEl, ammoEl };
  }
  bottomLeft.appendChild(weaponsEl);
  root.appendChild(bottomLeft);

  // --- bottom-right: radio widget + speedometer --------------------------------
  const bottomRight = makeEl('div', 'hud-bottom-right');
  const radioEl = makeEl('div', 'hud-panel hud-radio');
  const radioNote = makeEl('span', 'hud-radio-note', '♪');
  const radioName = makeEl('span', '', STATIONS[0]);
  radioEl.appendChild(radioNote);
  radioEl.appendChild(radioName);
  const speedEl = makeEl('div', 'hud-panel hud-speed');
  const speedNum = makeEl('span', 'hud-speed-num', '0');
  speedEl.appendChild(speedNum);
  speedEl.appendChild(makeEl('span', 'hud-speed-unit', 'km/h'));
  const speedTrack = makeEl('div', 'hud-speed-track');
  const speedBar = makeEl('div', 'hud-speed-bar');
  speedTrack.appendChild(speedBar);
  speedEl.appendChild(speedTrack);
  const speedCar = makeEl('div', 'hud-speed-car', 'ON FOOT');
  speedEl.appendChild(speedCar);
  bottomRight.appendChild(radioEl);
  bottomRight.appendChild(makeEl('br'));
  bottomRight.appendChild(speedEl);
  root.appendChild(bottomRight);

  (opts.container || document.body).appendChild(root);

  // --- state readers (defensive; main.js wires the real objects) --------------

  function readPlayerPos() {
    if (typeof opts.playerPosition === 'function') {
      const p = opts.playerPosition();
      if (p && typeof p.x === 'number' && typeof p.z === 'number') return p;
    }
    if (opts.playerPosition && typeof opts.playerPosition.x === 'number') return opts.playerPosition;
    const pl = opts.player;
    if (pl) {
      if (pl.position && typeof pl.position.x === 'number' && typeof pl.position.z === 'number') return pl.position;
      if (typeof pl.x === 'number' && typeof pl.z === 'number') return pl;
    }
    const car = currentCar();
    if (car && typeof car.x === 'number' && typeof car.z === 'number') return car;
    return city && city.spawn ? city.spawn : { x: -60, z: 100 };
  }

  function readHeading() {
    const pl = opts.player;
    if (pl && typeof pl.heading === 'number') return pl.heading;
    const car = currentCar();
    if (car && typeof car.heading === 'number') return car.heading;
    return 0;
  }

  function currentCar() {
    const c = opts.car;
    if (!c) return null;
    return c.currentCar || c.playerCar || null;
  }

  function readSpeedKmh() {
    if (!st.inCar) return 0;
    const car = currentCar();
    const ms = car && typeof car.speed === 'number' ? Math.abs(car.speed) : 0;
    return Math.round(ms * 3.6);
  }

  function readCarLabel() {
    if (!st.inCar) return 'ON FOOT';
    const car = currentCar();
    if (!car) return 'ON FOOT';
    if (typeof car.name === 'string' && car.name) return car.name.toUpperCase();
    if (typeof car.label === 'string' && car.label) return car.label.toUpperCase();
    if (typeof car.type === 'string' && car.type) return car.type.toUpperCase();
    return 'ZEPHYR RS';
  }

  function readObjective() {
    const m = opts.missions;
    if (m) {
      if (typeof m.getCurrentMission === 'function') {
        try {
          const cur = m.getCurrentMission();
          if (cur && typeof cur.objective === 'string' && cur.objective) return cur.objective;
        } catch (e) { /* fall through to the next source */ }
      }
      if (typeof m.getStatus === 'function') {
        try {
          const s = m.getStatus();
          if (typeof s === 'string' && s) return s;
          if (s && typeof s === 'object') {
            if (typeof s.objective === 'string' && s.objective) return s.objective;
            if (typeof s.text === 'string' && s.text) return s.text;
            if (typeof s.title === 'string' && s.title) return s.title;
            if (typeof s.name === 'string' && s.name) return s.name;
          }
        } catch (e) { /* fall through to the next source */ }
      }
      if (typeof m.getObjective === 'function') {
        try {
          const s = m.getObjective();
          if (typeof s === 'string' && s) return s;
        } catch (e) { /* fall through */ }
      }
      if (typeof m.objective === 'string' && m.objective) return m.objective;
      if (typeof m.currentObjective === 'string' && m.currentObjective) return m.currentObjective;
    }
    if (typeof opts.getObjective === 'function') {
      try {
        const s = opts.getObjective();
        if (typeof s === 'string' && s) return s;
      } catch (e) { /* fall through */ }
    }
    if (typeof opts.objective === 'string' && opts.objective) return opts.objective;
    const idx = typeof st.missionIndex === 'number' ? st.missionIndex : 0;
    if (idx >= 8) return 'Story complete — explore Port Marigold.';
    return 'Mission ' + (idx + 1) + ' of 8 — follow the gold marker.';
  }

  function readTarget() {
    const m = opts.missions;
    if (m && typeof m.getTarget === 'function') {
      try {
        const t = m.getTarget();
        if (t) {
          if (typeof t.x === 'number' && typeof t.z === 'number') return t;
          if (t.position && typeof t.position.x === 'number') return t.position;
        }
      } catch (e) { /* fall through */ }
    }
    if (m && m.target && typeof m.target.x === 'number') return m.target;
    if (opts.target && typeof opts.target.x === 'number' && typeof opts.target.z === 'number') return opts.target;
    return null;
  }

  function readStation() {
    const a = opts.audio;
    if (a) {
      if (a.radioOn === false || a.enabled === false) return 'RADIO OFF';
      if (typeof a.getStation === 'function') {
        try {
          const s = a.getStation();
          if (typeof s === 'string' && s) return s;
          if (s && typeof s.name === 'string' && s.name) return s.name;
        } catch (e) { /* fall through */ }
      }
      if (typeof a.currentStation === 'string' && a.currentStation) return a.currentStation;
      if (a.currentStation && typeof a.currentStation.name === 'string') return a.currentStation.name;
      if (typeof a.station === 'string' && a.station) return a.station;
      if (Array.isArray(a.stations) && typeof a.stationIndex === 'number') {
        const s = a.stations[a.stationIndex];
        if (typeof s === 'string') return s;
        if (s && typeof s.name === 'string') return s.name;
      }
    }
    return STATIONS[0];
  }

  function readOwnedWeapons() {
    if (Array.isArray(opts.ownedWeapons)) return opts.ownedWeapons;
    if (typeof opts.getOwnedWeapons === 'function') {
      try {
        const list = opts.getOwnedWeapons();
        if (Array.isArray(list)) return list;
      } catch (e) { /* fall through */ }
    }
    if (st && Array.isArray(st.ownedWeapons)) return st.ownedWeapons;
    return null;
  }

  // --- minimap ------------------------------------------------------------------

  function toMapX(wx) {
    return ((wx - WORLD_MIN) / WORLD_SIZE) * minimapSize;
  }

  function toMapY(wz) {
    return ((wz - WORLD_MIN) / WORLD_SIZE) * minimapSize;
  }

  function drawMinimap(time) {
    if (!mctx) return;
    const s = minimapSize;
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, s, s);
    mctx.fillStyle = '#0d0a18';
    mctx.fillRect(0, 0, s, s);

    // District blocks.
    for (const d of districts) {
      const b = d.bounds || d;
      if (typeof b.minX !== 'number') continue;
      mctx.fillStyle = cssColor(d.color || 0x333344);
      mctx.globalAlpha = 0.55;
      mctx.fillRect(toMapX(b.minX), toMapY(b.minZ), toMapX(b.maxX) - toMapX(b.minX), toMapY(b.maxZ) - toMapY(b.minZ));
    }
    mctx.globalAlpha = 1;

    // Ocean ring outside the island edge.
    mctx.strokeStyle = 'rgba(46,196,182,0.7)';
    mctx.lineWidth = 2;
    mctx.strokeRect(1, 1, s - 2, s - 2);

    // Roads: grid lines + two diagonal avenues.
    mctx.strokeStyle = 'rgba(255,255,255,0.55)';
    mctx.lineWidth = 1.5;
    for (const line of ROAD_LINES) {
      mctx.beginPath();
      mctx.moveTo(toMapX(line), 0);
      mctx.lineTo(toMapX(line), s);
      mctx.stroke();
      mctx.beginPath();
      mctx.moveTo(0, toMapY(line));
      mctx.lineTo(s, toMapY(line));
      mctx.stroke();
    }
    mctx.strokeStyle = 'rgba(255,255,255,0.35)';
    mctx.beginPath();
    mctx.moveTo(0, 0);
    mctx.lineTo(s, s);
    mctx.stroke();
    mctx.beginPath();
    mctx.moveTo(s, 0);
    mctx.lineTo(0, s);
    mctx.stroke();

    // Mission target marker (pulsing gold diamond).
    const target = readTarget();
    if (target) {
      const tx = toMapX(target.x);
      const ty = toMapY(target.z);
      const r = 5 + Math.sin(time * 4) * 1.5;
      mctx.save();
      mctx.translate(tx, ty);
      mctx.rotate(Math.PI / 4);
      mctx.fillStyle = '#ffd24a';
      mctx.strokeStyle = '#7a5200';
      mctx.lineWidth = 1;
      mctx.fillRect(-r, -r, r * 2, r * 2);
      mctx.strokeRect(-r, -r, r * 2, r * 2);
      mctx.restore();
    }

    // Police dots (red SUV, orange van, yellow heli with ring).
    let policeList = [];
    if (police && typeof police.getPoliceList === 'function') {
      try {
        policeList = police.getPoliceList() || [];
      } catch (e) {
        policeList = [];
      }
    }
    for (const u of policeList) {
      if (typeof u.x !== 'number' || typeof u.z !== 'number') continue;
      const px = toMapX(u.x);
      const py = toMapY(u.z);
      if (u.kind === 'heli') {
        mctx.fillStyle = '#ffe600';
        mctx.beginPath();
        mctx.arc(px, py, 3.5, 0, Math.PI * 2);
        mctx.fill();
        mctx.strokeStyle = 'rgba(255,230,0,0.7)';
        mctx.lineWidth = 1;
        mctx.beginPath();
        mctx.arc(px, py, 6, 0, Math.PI * 2);
        mctx.stroke();
      } else {
        mctx.fillStyle = u.kind === 'van' ? '#ff8c1a' : '#ff3b30';
        mctx.beginPath();
        mctx.arc(px, py, 3, 0, Math.PI * 2);
        mctx.fill();
        mctx.strokeStyle = 'rgba(0,0,0,0.6)';
        mctx.lineWidth = 1;
        mctx.stroke();
      }
    }

    // Player dot (white/teal, arrow in heading direction).
    const pos = readPlayerPos();
    const px = toMapX(pos.x);
    const py = toMapY(pos.z);
    const heading = readHeading();
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(-heading);
    mctx.fillStyle = '#ffffff';
    mctx.strokeStyle = '#0aa89a';
    mctx.lineWidth = 1.5;
    mctx.beginPath();
    mctx.moveTo(0, -6);
    mctx.lineTo(4.5, 5);
    mctx.lineTo(0, 2.5);
    mctx.lineTo(-4.5, 5);
    mctx.closePath();
    mctx.fill();
    mctx.stroke();
    mctx.restore();

    // District labels, clamped inside the canvas (never overlapping the
    // subtitles — the minimap sits bottom-left, subtitles bottom-centre).
    mctx.font = 'bold 10px sans-serif';
    mctx.textBaseline = 'middle';
    for (const d of districts) {
      const b = d.bounds || d;
      if (typeof b.minX !== 'number') continue;
      const label = SHORT_NAMES[d.name] || d.name;
      const cx = (toMapX(b.minX) + toMapX(b.maxX)) / 2;
      const cy = (toMapY(b.minZ) + toMapY(b.maxZ)) / 2;
      const w = mctx.measureText(label).width;
      const pad = 3;
      const lx = clamp(cx - w / 2, pad, s - w - pad);
      const ly = clamp(cy, 9, s - 7);
      mctx.fillStyle = 'rgba(0,0,0,0.65)';
      mctx.fillRect(lx - 2, ly - 7, w + 4, 14);
      mctx.fillStyle = '#ffffff';
      mctx.fillText(label, lx, ly);
    }
  }

  // --- per-frame refresh ---------------------------------------------------------

  let time = 0;
  let last = {
    district: null,
    wanted: -1,
    searching: null,
    objective: null,
    money: null,
    health: -1,
    speed: -1,
    carLabel: null,
    station: null,
    weapon: null,
    ammoKey: null,
    unitsKey: null,
  };

  function update(dt) {
    const step = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0.016;
    time += step;

    // District name (top-left).
    const pos = readPlayerPos();
    let districtName = 'Port Marigold';
    if (city && typeof city.getDistrictAt === 'function') {
      try {
        districtName = city.getDistrictAt(pos.x, pos.z) || districtName;
      } catch (e) { /* keep default */ }
    }
    if (districtName !== last.district) {
      districtEl.textContent = districtName;
      last.district = districtName;
    }

    // Wanted stars.
    const wanted = clamp(typeof st.wanted === 'number' ? Math.floor(st.wanted) : 0, 0, MAX_WANTED);
    if (wanted !== last.wanted) {
      for (let i = 0; i < starSpans.length; i++) {
        starSpans[i].classList.toggle('on', i < wanted);
      }
      starsEl.classList.toggle('pulsing', wanted > 0);
      last.wanted = wanted;
    }

    // SEARCH tag while police are searching.
    let searching = false;
    if (police && typeof police.getMode === 'function') {
      try {
        searching = police.getMode() === 'search';
      } catch (e) {
        searching = false;
      }
    }
    if (searching !== last.searching) {
      searchEl.style.display = searching ? 'inline-block' : 'none';
      last.searching = searching;
    }

    // Objective box.
    const objective = readObjective();
    if (objective !== last.objective) {
      objectiveText.textContent = objective;
      last.objective = objective;
    }

    // Money — rendered exactly once, in this element only.
    const money = typeof st.money === 'number' ? Math.floor(st.money) : 0;
    if (money !== last.money) {
      moneyEl.textContent = '$' + money.toLocaleString('en-US');
      last.money = money;
    }

    // Health bar.
    const health = clamp(typeof st.health === 'number' ? Math.round(st.health) : 100, 0, 100);
    if (health !== last.health) {
      healthBar.style.width = health + '%';
      healthBar.style.background = health > 50 ? '#58d68d' : health > 25 ? '#ffb347' : '#ff4d4d';
      healthNum.textContent = String(health);
      last.health = health;
    }

    // MHP unit list (grouped by kind), hidden when no units are active.
    let unitsKey = '';
    let unitsHtml = '';
    if (police && typeof police.getPoliceList === 'function') {
      try {
        const list = police.getPoliceList() || [];
        const counts = {};
        for (const u of list) {
          if (!u || u.disabled) continue;
          counts[u.kind] = (counts[u.kind] || 0) + 1;
        }
        const rows = [];
        for (const kind of ['suv', 'van', 'heli']) {
          if (counts[kind]) rows.push((UNIT_LABELS[kind] || kind) + ' ×' + counts[kind]);
        }
        unitsKey = rows.join('|');
        unitsHtml = rows.join('<br>');
      } catch (e) {
        unitsKey = '';
      }
    }
    if (unitsKey !== last.unitsKey) {
      if (unitsKey) {
        unitsRows.innerHTML = unitsHtml;
        unitsBox.style.display = 'inline-block';
      } else {
        unitsBox.style.display = 'none';
      }
      last.unitsKey = unitsKey;
    }

    // Weapon slots.
    const owned = readOwnedWeapons();
    const currentWeapon = st.weapon || 'fists';
    const ammoKey = WEAPON_SLOTS.map((s) => (st.ammo && st.ammo[s.name]) || 0).join(',') + '|' + currentWeapon + '|' + (owned ? owned.join(',') : '');
    if (ammoKey !== last.ammoKey) {
      for (const slot of WEAPON_SLOTS) {
        const se = slotEls[slot.name];
        const isCurrent = currentWeapon === slot.name;
        const locked = slot.name === 'fists'
          ? false
          : owned
            ? owned.indexOf(slot.name) < 0
            : (st.ammo ? (st.ammo[slot.name] || 0) <= 0 : false) && !isCurrent;
        se.el.classList.toggle('current', isCurrent);
        se.el.classList.toggle('locked', locked);
        se.ammoEl.textContent = slot.name === 'fists' ? '∞' : String(st.ammo ? (st.ammo[slot.name] || 0) : 0);
      }
      last.ammoKey = ammoKey;
      last.weapon = currentWeapon;
    }

    // Speedometer + car label.
    const kmh = readSpeedKmh();
    if (kmh !== last.speed) {
      speedNum.textContent = String(kmh);
      speedBar.style.width = clamp(Math.round((kmh / 220) * 100), 0, 100) + '%';
      last.speed = kmh;
    }
    const carLabel = readCarLabel();
    if (carLabel !== last.carLabel) {
      speedCar.textContent = carLabel;
      last.carLabel = carLabel;
    }

    // Radio widget.
    const station = readStation();
    if (station !== last.station) {
      radioName.textContent = station;
      last.station = station;
    }

    // Minimap (redrawn every frame).
    drawMinimap(time);
  }

  function destroy() {
    if (root.parentNode) root.parentNode.removeChild(root);
    if (style.parentNode) style.parentNode.removeChild(style);
  }

  return { update, destroy, element: root, minimap };
}
