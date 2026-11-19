// ---------------------------------------------------------------------------
// NEON TIDE — full-city map (M key), split-layout.
//
// setupMap(city, police, missions, opts) returns:
//   openMap(), closeMap(), toggleMap(), isMapOpen(), drawMap(), updateMap()
// Left side: dark menu with "New Game", "Continue", "Settings" (the same
// actions as the start screen). Right side: the full city map with district
// color blocks, white road grids, player marker, police dots, mission
// target, and a Legend box at the bottom-right.
//
// Depends only on city, police, and missions. Missions may be absent (not
// built yet) — the map degrades gracefully and shows no target.
// ---------------------------------------------------------------------------

const WORLD_MIN = -220;
const WORLD_MAX = 220;
const ROAD_LINES = [-180, -120, -60, 0, 60, 120, 180];
const SQUARE = { x: -60, z: 60, r: 28 }; // Old Cinder Town square

// Fallback districts (same bounds as city.js) if city.districts is absent.
const FALLBACK_DISTRICTS = [
  { name: 'Sunset Boardwalk', color: 0xff5a3c, bounds: { minX: -220, maxX: -120, minZ: -220, maxZ: 220 } },
  { name: 'Velvet Hills', color: 0x9b59d0, bounds: { minX: -120, maxX: 60, minZ: -220, maxZ: -80 } },
  { name: 'Glass Harbor', color: 0x2ec4b6, bounds: { minX: 60, maxX: 220, minZ: -220, maxZ: -40 } },
  { name: 'Old Cinder Town', color: 0xc96f2e, bounds: { minX: -120, maxX: 60, minZ: -80, maxZ: 140 } },
  { name: 'Saltworks Docks', color: 0xe8a93c, bounds: { minX: -120, maxX: 220, minZ: 140, maxZ: 220 } },
];

const MAP_W = 920;
const MAP_H = 640;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function colorToCss(color) {
  if (typeof color === 'string') return color;
  if (typeof color === 'number') {
    return '#' + (color >>> 0).toString(16).padStart(6, '0');
  }
  return '#888888';
}

function rectsOverlap(a, b, pad) {
  const p = typeof pad === 'number' ? pad : 0;
  return a.x - p < b.x + b.w + p && a.x + a.w + p > b.x - p &&
    a.y - p < b.y + b.h + p && a.y + a.h + p > b.y - p;
}

export function setupMap(city, police, missions, opts = {}) {
  const districts = (city && Array.isArray(city.districts) && city.districts.length > 0)
    ? city.districts
    : FALLBACK_DISTRICTS;

  // --- DOM: overlay, left menu, right map panel ---------------------------
  const overlay = document.createElement('div');
  overlay.id = 'neon-tide-map-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:60', 'display:none',
    'flex-direction:row', 'align-items:stretch',
    'background:rgba(4,7,16,0.94)',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    'color:#f2ede6', 'user-select:none',
  ].join(';');

  const menu = document.createElement('div');
  menu.style.cssText = [
    'width:264px', 'flex:0 0 264px', 'display:flex', 'flex-direction:column',
    'background:linear-gradient(180deg,#120a18 0%,#0b0710 100%)',
    'border-right:2px solid rgba(255,90,60,0.45)',
    'padding:28px 22px', 'box-sizing:border-box',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'NEON TIDE';
  title.style.cssText = [
    'font-size:32px', 'font-weight:900', 'letter-spacing:5px',
    'color:#ff5340', 'line-height:1.1',
    'text-shadow:0 0 14px rgba(255,70,40,0.9),0 0 42px rgba(255,90,40,0.55)',
  ].join(';');
  menu.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.textContent = 'PORT MARIGOLD';
  subtitle.style.cssText = [
    'margin-top:6px', 'font-size:13px', 'font-weight:700', 'letter-spacing:6px',
    'color:#ffb36b', 'text-shadow:0 0 10px rgba(255,150,60,0.7)',
  ].join(';');
  menu.appendChild(subtitle);

  const menuRule = document.createElement('div');
  menuRule.style.cssText = 'height:1px;background:rgba(255,120,60,0.35);margin:22px 0;';
  menu.appendChild(menuRule);

  function makeMenuButton(label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = [
      'display:block', 'width:100%', 'text-align:left',
      'background:transparent', 'border:1px solid rgba(255,90,60,0.5)',
      'border-radius:4px', 'padding:13px 16px', 'margin-bottom:12px',
      'font-size:19px', 'font-weight:800', 'letter-spacing:2px',
      'font-family:inherit', 'cursor:pointer',
      'color:#ff7a3c', 'text-shadow:0 0 12px rgba(255,80,40,0.85)',
    ].join(';');
    b.addEventListener('mouseenter', () => {
      b.style.background = 'rgba(255,90,60,0.16)';
      b.style.color = '#ffb36b';
    });
    b.addEventListener('mouseleave', () => {
      b.style.background = 'transparent';
      b.style.color = '#ff7a3c';
    });
    return b;
  }

  const btnNew = makeMenuButton('New Game');
  const btnContinue = makeMenuButton('Continue');
  const btnSettings = makeMenuButton('Settings');
  menu.appendChild(btnNew);
  menu.appendChild(btnContinue);
  menu.appendChild(btnSettings);

  const hint = document.createElement('div');
  hint.textContent = 'M / Esc — Close map';
  hint.style.cssText = [
    'margin-top:auto', 'font-size:12px', 'letter-spacing:1px', 'color:#9a8fa8',
  ].join(';');
  menu.appendChild(hint);
  overlay.appendChild(menu);

  const right = document.createElement('div');
  right.style.cssText = [
    'flex:1', 'display:flex', 'flex-direction:column',
    'padding:20px 24px 24px', 'box-sizing:border-box', 'min-width:0',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex', 'justify-content:space-between', 'align-items:baseline',
    'margin-bottom:12px',
  ].join(';');
  const headerTitle = document.createElement('div');
  headerTitle.textContent = 'PORT MARIGOLD';
  headerTitle.style.cssText = [
    'font-size:20px', 'font-weight:900', 'letter-spacing:5px', 'color:#ffe9c9',
    'text-shadow:0 0 12px rgba(255,170,80,0.6)',
  ].join(';');
  const headerSub = document.createElement('div');
  headerSub.textContent = 'FULL CITY MAP';
  headerSub.style.cssText = 'font-size:12px;letter-spacing:3px;color:#8fa8c0;';
  header.appendChild(headerTitle);
  header.appendChild(headerSub);
  right.appendChild(header);

  const canvasWrap = document.createElement('div');
  canvasWrap.style.cssText = 'flex:1;min-height:0;display:flex;';
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  canvas.style.cssText = [
    'width:100%', 'height:100%', 'object-fit:contain',
    'border:1px solid rgba(255,255,255,0.18)', 'border-radius:6px',
    'background:#0a1a2e', 'box-sizing:border-box',
  ].join(';');
  canvasWrap.appendChild(canvas);
  right.appendChild(canvasWrap);
  overlay.appendChild(right);

  (opts.container || document.body).appendChild(overlay);
  const ctx = canvas.getContext('2d');

  // --- live data readers (defensive: missions may not exist yet) ----------
  function readPlayerPosition() {
    if (typeof opts.playerPosition === 'function') {
      try {
        const p = opts.playerPosition();
        if (p && typeof p.x === 'number' && typeof p.z === 'number') return p;
        if (p && p.position && typeof p.position.x === 'number') return p.position;
      } catch (e) { /* fall through */ }
    }
    if (opts.playerPosition && typeof opts.playerPosition.x === 'number') return opts.playerPosition;
    const pl = opts.player;
    if (pl) {
      if (pl.position && typeof pl.position.x === 'number' && typeof pl.position.z === 'number') return pl.position;
      if (typeof pl.x === 'number' && typeof pl.z === 'number') return pl;
    }
    if (typeof opts.getPlayerPosition === 'function') {
      try {
        const p = opts.getPlayerPosition();
        if (p && typeof p.x === 'number' && typeof p.z === 'number') return p;
      } catch (e) { /* fall through */ }
    }
    if (city && city.spawn && typeof city.spawn.x === 'number') return city.spawn;
    return null;
  }

  function readTarget() {
    const m = missions;
    if (m && typeof m.getTarget === 'function') {
      try {
        const t = m.getTarget();
        if (t) {
          if (typeof t.x === 'number' && typeof t.z === 'number') return t;
          if (t.position && typeof t.position.x === 'number' && typeof t.position.z === 'number') return t.position;
        }
      } catch (e) { /* fall through */ }
    }
    if (m && m.target && typeof m.target.x === 'number' && typeof m.target.z === 'number') return m.target;
    if (opts.target && typeof opts.target.x === 'number' && typeof opts.target.z === 'number') return opts.target;
    return null;
  }

  function readPoliceList() {
    if (police && typeof police.getPoliceList === 'function') {
      try {
        return police.getPoliceList() || [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  // --- world -> map projection ---------------------------------------------
  function toMapX(wx) {
    return ((wx - WORLD_MIN) / (WORLD_MAX - WORLD_MIN)) * MAP_W;
  }
  function toMapY(wz) {
    return ((wz - WORLD_MIN) / (WORLD_MAX - WORLD_MIN)) * MAP_H;
  }

  // --- label placement: candidate offsets, first non-colliding wins --------
  function placeLabel(text, anchorX, anchorY, obstacles, placed) {
    ctx.font = 'bold 13px system-ui, sans-serif';
    const w = Math.ceil(ctx.measureText(text).width);
    const h = 18;
    const pad = 4;
    const candidates = [
      [0, 0], [0, -22], [0, 22], [-26, 0], [26, 0],
      [0, -44], [0, 44], [-52, -22], [52, -22], [-52, 22], [52, 22],
      [-78, 0], [78, 0], [0, -66], [0, 66],
    ];
    for (const [dx, dy] of candidates) {
      let x = anchorX + dx - w / 2;
      let y = anchorY + dy - h / 2;
      x = clamp(x, pad, MAP_W - w - pad);
      y = clamp(y, pad, MAP_H - h - pad);
      const rect = { x: x, y: y, w: w, h: h };
      let blocked = false;
      for (const o of obstacles) {
        if (rectsOverlap(rect, o, pad)) { blocked = true; break; }
      }
      if (blocked) continue;
      for (const r of placed) {
        if (rectsOverlap(rect, r, pad)) { blocked = true; break; }
      }
      if (blocked) continue;
      placed.push(rect);
      return rect;
    }
    // No free slot: fall back to the clamped centre so the label is drawn.
    const x = clamp(anchorX - w / 2, pad, MAP_W - w - pad);
    const y = clamp(anchorY - h / 2, pad, MAP_H - h - pad);
    const rect = { x: x, y: y, w: w, h: h };
    placed.push(rect);
    return rect;
  }

  function drawLegend() {
    const rows = [];
    for (const d of districts) rows.push({ color: colorToCss(d.color), label: d.name });
    const markerRows = [
      { kind: 'player', label: 'You' },
      { kind: 'suv', label: 'MHP patrol' },
      { kind: 'heli', label: 'Helicopter' },
      { kind: 'target', label: 'Mission target' },
    ];
    const boxW = 208;
    const rowH = 17;
    const boxH = 26 + rows.length * rowH + markerRows.length * rowH + 8;
    const bx = MAP_W - boxW - 10;
    const by = MAP_H - boxH - 10;
    ctx.fillStyle = 'rgba(6,10,20,0.88)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#ffe9c9';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEGEND', bx + 10, by + 13);
    let y = by + 26 + rowH / 2;
    ctx.font = '11px system-ui, sans-serif';
    for (const r of rows) {
      ctx.fillStyle = r.color;
      ctx.fillRect(bx + 10, y - 5, 12, 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.strokeRect(bx + 10.5, y - 4.5, 12, 10);
      ctx.fillStyle = '#f2ede6';
      ctx.fillText(r.label, bx + 28, y);
      y += rowH;
    }
    for (const m of markerRows) {
      const cx = bx + 16;
      if (m.kind === 'player') {
        ctx.fillStyle = '#19e3d6';
        ctx.beginPath(); ctx.arc(cx, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, y, 5, 0, Math.PI * 2); ctx.stroke();
      } else if (m.kind === 'suv') {
        ctx.fillStyle = '#ff3b30';
        ctx.beginPath(); ctx.arc(cx, y, 4, 0, Math.PI * 2); ctx.fill();
      } else if (m.kind === 'heli') {
        ctx.fillStyle = '#ffe600';
        ctx.beginPath(); ctx.arc(cx, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,0,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, y, 6.5, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#ffc21a';
        ctx.beginPath();
        ctx.moveTo(cx, y - 6); ctx.lineTo(cx + 5, y); ctx.lineTo(cx, y + 6); ctx.lineTo(cx - 5, y);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#f2ede6';
      ctx.fillText(m.label, bx + 28, y);
      y += rowH;
    }
    return { x: bx, y: by, w: boxW, h: boxH };
  }

  // --- drawing --------------------------------------------------------------
  function drawMap() {
    if (!ctx) return;
    // Ocean around the island.
    const ocean = ctx.createLinearGradient(0, 0, 0, MAP_H);
    ocean.addColorStop(0, '#0d2038');
    ocean.addColorStop(1, '#0a1a2e');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // District color blocks.
    for (const d of districts) {
      const b = d.bounds;
      if (!b) continue;
      ctx.fillStyle = colorToCss(d.color);
      ctx.globalAlpha = 0.92;
      ctx.fillRect(toMapX(b.minX), toMapY(b.minZ), toMapX(b.maxX) - toMapX(b.minX), toMapY(b.maxZ) - toMapY(b.minZ));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(toMapX(b.minX) + 0.5, toMapY(b.minZ) + 0.5, toMapX(b.maxX) - toMapX(b.minX) - 1, toMapY(b.maxZ) - toMapY(b.minZ) - 1);
    }

    // White road grids.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const line of ROAD_LINES) {
      ctx.moveTo(toMapX(line), 0);
      ctx.lineTo(toMapX(line), MAP_H);
      ctx.moveTo(0, toMapY(line));
      ctx.lineTo(MAP_W, toMapY(line));
    }
    ctx.stroke();

    // Old Cinder Town square ring.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(toMapX(SQUARE.x), toMapY(SQUARE.z), (SQUARE.r / (WORLD_MAX - WORLD_MIN)) * MAP_W, 0, Math.PI * 2);
    ctx.stroke();

    // Mission target (gold diamond + ring); its rect is a label obstacle.
    const target = readTarget();
    let targetRect = null;
    if (target) {
      const tx = toMapX(target.x);
      const ty = toMapY(target.z);
      ctx.strokeStyle = 'rgba(255,194,26,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(tx, ty, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffc21a';
      ctx.beginPath();
      ctx.moveTo(tx, ty - 9); ctx.lineTo(tx + 8, ty); ctx.lineTo(tx, ty + 9); ctx.lineTo(tx - 8, ty);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7a5200';
      ctx.lineWidth = 1;
      ctx.stroke();
      targetRect = { x: tx - 18, y: ty - 18, w: 36, h: 36 };
    }

    // Police dots (red SUV, orange riot-van, yellow heli with ring).
    for (const u of readPoliceList()) {
      if (typeof u.x !== 'number' || typeof u.z !== 'number') continue;
      const px = toMapX(u.x);
      const py = toMapY(u.z);
      if (u.kind === 'heli') {
        ctx.fillStyle = '#ffe600';
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,0,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = u.kind === 'van' ? '#ff8c1a' : '#ff3b30';
        ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Player marker (teal dot, white ring).
    const pp = readPlayerPosition();
    if (pp) {
      const px = toMapX(pp.x);
      const py = toMapY(pp.z);
      ctx.fillStyle = '#19e3d6';
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(25,227,214,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.stroke();
    }

    // Legend first (fixed bottom-right); its box is a label obstacle.
    const legendRect = drawLegend();

    // District labels, never overlapping: candidate offsets, mission target
    // rectangle and the legend box both count as obstacles.
    const obstacles = [];
    if (targetRect) obstacles.push(targetRect);
    obstacles.push(legendRect);
    const placed = [];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const d of districts) {
      const b = d.bounds;
      if (!b) continue;
      const cx = toMapX((b.minX + b.maxX) / 2);
      const cy = toMapY((b.minZ + b.maxZ) / 2);
      const rect = placeLabel(d.name, cx, cy, obstacles, placed);
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(d.name, rect.x, rect.y + rect.h / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(d.name, rect.x, rect.y + rect.h / 2);
    }

    // Thin frame around the whole map.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, MAP_W - 1, MAP_H - 1);
  }

  // --- open / close / toggle --------------------------------------------------
  let open = false;

  function openMap() {
    if (open) return;
    open = true;
    overlay.style.display = 'flex';
    drawMap();
    if (typeof opts.onOpen === 'function') {
      try { opts.onOpen(); } catch (e) { /* ignore */ }
    }
  }

  function closeMap() {
    if (!open) return;
    open = false;
    overlay.style.display = 'none';
    if (typeof opts.onClose === 'function') {
      try { opts.onClose(); } catch (e) { /* ignore */ }
    }
  }

  function toggleMap() {
    if (open) closeMap();
    else openMap();
  }

  function isMapOpen() {
    return open;
  }

  function updateMap() {
    if (open) drawMap();
  }

  // --- menu actions (same actions as the start screen) -----------------------
  btnNew.addEventListener('click', () => {
    if (typeof opts.onNewGame === 'function') {
      try { opts.onNewGame(); } catch (e) { /* ignore */ }
    }
    closeMap();
  });
  btnContinue.addEventListener('click', () => {
    if (typeof opts.onContinue === 'function') {
      try { opts.onContinue(); } catch (e) { /* ignore */ }
    }
    closeMap();
  });
  btnSettings.addEventListener('click', () => {
    if (typeof opts.onSettings === 'function') {
      try { opts.onSettings(); } catch (e) { /* ignore */ }
    }
    // Settings opens its own panel; leave the map open unless the caller
    // closes it.
  });

  // --- key handling: M and Escape close the map; the event is stopped so
  // it never reaches other handlers (Escape must not also pause the game).
  function onKeyDown(e) {
    const isM = e.key === 'm' || e.key === 'M' || e.code === 'KeyM';
    const isEsc = e.key === 'Escape' || e.key === 'Esc';
    if (open) {
      if (isM || isEsc) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        closeMap();
      }
      return;
    }
    if (isM) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      openMap();
    }
  }
  window.addEventListener('keydown', onKeyDown, true);

  function destroy() {
    window.removeEventListener('keydown', onKeyDown, true);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  return {
    openMap: openMap,
    closeMap: closeMap,
    toggleMap: toggleMap,
    isMapOpen: isMapOpen,
    drawMap: drawMap,
    updateMap: updateMap,
    setMissions: function (m) { missions = m; },
    element: overlay,
    canvas: canvas,
    destroy: destroy,
  };
}
