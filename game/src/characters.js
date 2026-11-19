// game/src/characters.js — NEON TIDE character models + dialogue portraits.
//
// Six characters, each with a stylized 3D figure (boxes/capsules, distinct
// colors and silhouette, placeable in the world for mission scenes) and a
// hand-drawn 2D canvas portrait for the dialogue interface.
//
//   createCharacters(scene) -> {
//     Mara, Teo, Nia, Silas, Valdez, Dex,   // each { name, role, model, portrait }
//     place(name, x, z, facing),             // show a model at a world spot
//     hide(name), hideAll()                  // tuck models away again
//   }
//
// Models start hidden (visible = false) so the world is clean until a
// mission scene places them. Portraits are 256x256 canvases; Nia's is the
// most detailed (it carries screenshot 2).

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 3D figures
// ---------------------------------------------------------------------------

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
}

function box(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function ball(r, material, x, y, z, parent, scaleY = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), material);
  m.position.set(x, y, z);
  m.scale.y = scaleY;
  m.castShadow = true;
  parent.add(m);
  return m;
}

function capsule(r, len, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Per-character look. Heights are in world units; the figure is ~1.8 tall.
const LOOKS = {
  Mara: {
    skin: 0xe8b98a, hair: 0x1c1410, hairStyle: 'short',
    jacket: 0x23232e, jacketTrim: 0xe86a4a, pants: 0x2e4a6b, boots: 0x1a1a1a,
    accent: 'stripe', height: 1.76,
  },
  Teo: {
    skin: 0xd9a06b, hair: 0x3a2418, hairStyle: 'cap',
    jacket: 0x3a5a8c, jacketTrim: 0xc96a2e, pants: 0x33507a, boots: 0x4a3220,
    accent: 'grease', height: 1.82,
  },
  Nia: {
    skin: 0x6b4423, hair: 0x0f8f7a, hairStyle: 'afro',
    jacket: 0xf2c200, jacketTrim: 0x1e5fd6, pants: 0x1a1a22, boots: 0x111111,
    accent: 'visor', height: 1.7,
  },
  Silas: {
    skin: 0xe0c0a0, hair: 0x0a0a0a, hairStyle: 'slick',
    jacket: 0x15151c, jacketTrim: 0x8c1f28, pants: 0x1c1c22, boots: 0x0d0d0d,
    accent: 'scar', height: 1.86,
  },
  Valdez: {
    skin: 0xc98f5f, hair: 0x14100c, hairStyle: 'cap',
    jacket: 0x1c2b4a, jacketTrim: 0xd8a928, pants: 0x1c2b4a, boots: 0x0d0d12,
    accent: 'epaulettes', height: 1.78,
  },
  Dex: {
    skin: 0x8a5a30, hair: 0x120e0a, hairStyle: 'streak',
    jacket: 0xe84a8a, jacketTrim: 0xf2a200, pants: 0x24303e, boots: 0x2a1a12,
    accent: 'headphones', height: 1.8,
  },
};

function buildFigure(key) {
  const L = LOOKS[key];
  const g = new THREE.Group();
  const h = L.height; // total height
  const s = h / 1.8; // scale factor vs the 1.8 reference build

  const skin = mat(L.skin);
  const jacket = mat(L.jacket);
  const trim = mat(L.jacketTrim);
  const pants = mat(L.pants);
  const boots = mat(L.boots);
  const hair = mat(L.hair, { roughness: 0.95 });

  // Boots + legs.
  box(0.16, 0.1, 0.3, boots, -0.11, 0.05 * s, 0.02, g);
  box(0.16, 0.1, 0.3, boots, 0.11, 0.05 * s, 0.02, g);
  box(0.17, 0.68 * s, 0.19, pants, -0.11, 0.44 * s, 0, g);
  box(0.17, 0.68 * s, 0.19, pants, 0.11, 0.44 * s, 0, g);

  // Torso. Silas wears a long dark coat down to the knees.
  if (key === 'Silas') {
    capsule(0.26, 0.95 * s, jacket, 0, 0.95 * s, 0, g);
    box(0.1, 0.5 * s, 0.03, trim, 0, 1.12 * s, 0.24, g); // red tie
  } else {
    capsule(0.25, 0.42 * s, jacket, 0, 1.08 * s, 0, g);
  }

  // Jacket trim / accent pieces.
  if (L.accent === 'stripe') {
    // Coral-orange racing stripe down Mara's jacket (driver's mark).
    box(0.09, 0.5 * s, 0.03, trim, 0, 1.1 * s, 0.24, g);
  } else if (L.accent === 'grease') {
    // Grease stain on Teo's overalls + chest pocket.
    box(0.16, 0.12, 0.02, mat(0x1a1a1a, { roughness: 1 }), -0.1, 1.02 * s, 0.25, g);
    box(0.12, 0.14, 0.02, trim, 0.12, 1.18 * s, 0.25, g);
  } else if (L.accent === 'epaulettes') {
    // Gold shoulder boards for Captain Valdez.
    box(0.14, 0.04, 0.12, trim, -0.24, 1.36 * s, 0, g);
    box(0.14, 0.04, 0.12, trim, 0.24, 1.36 * s, 0, g);
    box(0.3, 0.06, 0.02, mat(0x0d0d12), 0, 0.86 * s, 0.25, g); // belt
  } else if (L.accent === 'headphones') {
    // Dex's shirt is two-tone: bright pink with an orange chest panel.
    box(0.3, 0.3 * s, 0.03, trim, 0, 1.14 * s, 0.24, g);
  }

  // Arms (slightly out from the body so the silhouette reads).
  const armL = box(0.12, 0.58 * s, 0.14, jacket, -0.33, 1.08 * s, 0, g);
  const armR = box(0.12, 0.58 * s, 0.14, jacket, 0.33, 1.08 * s, 0, g);
  armL.rotation.z = 0.08;
  armR.rotation.z = -0.08;
  ball(0.06, skin, -0.36, 0.76 * s, 0, g); // hands
  ball(0.06, skin, 0.36, 0.76 * s, 0, g);

  // Nia's high blue collar — a tall ring around the neck.
  if (key === 'Nia') {
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.21, 0.22 * s, 14, 1, true), trim,
    );
    collar.position.set(0, 1.42 * s, 0);
    collar.castShadow = true;
    g.add(collar);
  }

  // Neck + head.
  box(0.1, 0.12 * s, 0.1, skin, 0, 1.44 * s, 0, g);
  ball(0.14, skin, 0, 1.62 * s, 0, g, 1.12);

  // Hair / headwear per character.
  if (L.hairStyle === 'short') {
    // Mara: short dark hair, swept back.
    ball(0.145, hair, 0, 1.68 * s, -0.02, g, 0.85);
    box(0.2, 0.06, 0.12, hair, 0, 1.72 * s, 0.1, g);
  } else if (L.hairStyle === 'cap') {
    // Teo (green work cap) and Valdez (dark police cap with gold badge).
    const capMat = key === 'Valdez' ? mat(0x14203a) : mat(0x2e6b3a);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.155, 0.09, 16), capMat);
    cap.position.set(0, 1.74 * s, 0);
    cap.castShadow = true;
    g.add(cap);
    box(0.2, 0.03, 0.12, capMat, 0, 1.7 * s, 0.14, g); // brim
    if (key === 'Valdez') {
      box(0.06, 0.05, 0.02, mat(0xd8a928, { metalness: 0.6, roughness: 0.35 }), 0, 1.74 * s, 0.15, g);
    }
  } else if (L.hairStyle === 'afro') {
    // Nia: big teal afro with a faded side — a cluster of spheres.
    const afro = mat(0x0f8f7a, { roughness: 1 });
    ball(0.19, afro, 0, 1.72 * s, -0.02, g, 0.9);
    ball(0.1, afro, -0.14, 1.68 * s, 0.05, g);
    ball(0.1, afro, 0.14, 1.68 * s, 0.05, g);
    ball(0.09, afro, 0, 1.82 * s, 0, g);
    ball(0.08, afro, -0.1, 1.78 * s, -0.08, g);
    ball(0.08, afro, 0.1, 1.78 * s, -0.08, g);
  } else if (L.hairStyle === 'slick') {
    // Silas: slicked-back black hair, sharp.
    ball(0.14, hair, 0, 1.7 * s, -0.03, g, 0.8);
    box(0.18, 0.05, 0.16, hair, 0, 1.76 * s, -0.04, g);
  } else if (L.hairStyle === 'streak') {
    // Dex: dark hair with a magenta streak.
    ball(0.14, hair, 0, 1.7 * s, -0.02, g, 0.85);
    box(0.05, 0.12, 0.16, mat(0xe84a8a), -0.08, 1.74 * s, 0.06, g);
  }

  // Face details.
  if (L.accent === 'visor') {
    // Nia's glowing blue cyberpunk eyewear — emissive visor band.
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.06, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x66d9ff, emissive: 0x22aaff, emissiveIntensity: 2.2, roughness: 0.2,
      }),
    );
    visor.position.set(0, 1.63 * s, 0.13);
    g.add(visor);
  } else {
    // Simple dark eyes for everyone else.
    const eye = mat(0x111111, { roughness: 0.4 });
    ball(0.018, eye, -0.05, 1.64 * s, 0.13, g);
    ball(0.018, eye, 0.05, 1.64 * s, 0.13, g);
  }

  if (L.accent === 'scar') {
    // Silas's scar: a pale slash across the left cheek.
    const scar = box(0.015, 0.09, 0.01, mat(0xf2d8c0), -0.07, 1.58 * s, 0.135, g);
    scar.rotation.z = 0.5;
  }

  if (L.accent === 'headphones') {
    // Dex's big DJ headphones: band over the head, cups over the ears.
    const cup = mat(0x111111, { roughness: 0.5 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 20, Math.PI), cup);
    band.position.set(0, 1.66 * s, 0);
    band.castShadow = true;
    g.add(band);
    const cupGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.04, 14);
    const cupL = new THREE.Mesh(cupGeo, cup);
    cupL.rotation.z = Math.PI / 2;
    cupL.position.set(-0.15, 1.62 * s, 0);
    g.add(cupL);
    const cupR = new THREE.Mesh(cupGeo, cup);
    cupR.rotation.z = Math.PI / 2;
    cupR.position.set(0.15, 1.62 * s, 0);
    g.add(cupR);
  }

  g.userData.characterKey = key;
  return g;
}

// ---------------------------------------------------------------------------
// 2D canvas portraits (256 x 256, stylized busts for the dialogue UI)
// ---------------------------------------------------------------------------

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  return c;
}

function bg(ctx, top, mid, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // Neon dots + a horizon glow line, for the sunset-city feel.
  ctx.fillStyle = 'rgba(255, 190, 120, 0.5)';
  for (let i = 0; i < 14; i++) {
    const x = (i * 53 + 17) % 256;
    const y = 30 + ((i * 37) % 90);
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 120, 90, 0.25)';
  ctx.fillRect(0, 148, 256, 3);
}

function shoulders(ctx, color, collarColor = null) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(28, 256);
  ctx.quadraticCurveTo(40, 196, 96, 188);
  ctx.lineTo(160, 188);
  ctx.quadraticCurveTo(216, 196, 228, 256);
  ctx.closePath();
  ctx.fill();
  if (collarColor) {
    // High collar framing the neck.
    ctx.fillStyle = collarColor;
    ctx.beginPath();
    ctx.moveTo(96, 196);
    ctx.lineTo(112, 158);
    ctx.lineTo(128, 188);
    ctx.lineTo(144, 158);
    ctx.lineTo(160, 196);
    ctx.closePath();
    ctx.fill();
  }
}

function face(ctx, skin, { jaw = 0 } = {}) {
  // Neck.
  ctx.fillStyle = skin;
  ctx.fillRect(116, 158, 24, 34);
  // Face: rounded, slightly tapered.
  ctx.beginPath();
  ctx.ellipse(128, 112, 46, 54 + jaw, 0, 0, Math.PI * 2);
  ctx.fill();
  // Soft cheek shading.
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ctx.ellipse(128, 138, 34, 22, 0, 0, Math.PI);
  ctx.fill();
}

function eyes(ctx, { glow = false } = {}) {
  if (glow) return; // Nia's visor replaces the eyes.
  ctx.fillStyle = '#1a1210';
  ctx.beginPath();
  ctx.ellipse(110, 108, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(146, 108, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(112, 106, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(148, 106, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function brows(ctx, color, angle = 0) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(100, 96 - angle);
  ctx.lineTo(120, 94 + angle);
  ctx.moveTo(136, 94 + angle);
  ctx.lineTo(156, 96 - angle);
  ctx.stroke();
}

function mouth(ctx, kind = 'smile') {
  ctx.strokeStyle = '#7a3a2a';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (kind === 'smile') {
    ctx.arc(128, 138, 12, 0.15 * Math.PI, 0.85 * Math.PI);
  } else if (kind === 'smirk') {
    ctx.moveTo(118, 146);
    ctx.quadraticCurveTo(130, 152, 142, 142);
  } else if (kind === 'stern') {
    ctx.moveTo(118, 146);
    ctx.lineTo(138, 146);
  } else if (kind === 'thin') {
    ctx.moveTo(120, 146);
    ctx.quadraticCurveTo(128, 144, 136, 146);
  }
  ctx.stroke();
}

function drawMara(ctx) {
  bg(ctx, '#2b1e4a', '#7a2d5e', '#e86a4a');
  shoulders(ctx, '#23232e');
  // Coral stripe down the jacket.
  ctx.fillStyle = '#e86a4a';
  ctx.fillRect(122, 190, 12, 66);
  face(ctx, '#e8b98a');
  // Short dark hair, swept back.
  ctx.fillStyle = '#1c1410';
  ctx.beginPath();
  ctx.ellipse(128, 66, 48, 26, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(128, 70, 47, 18, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(82, 62, 10, 26);
  ctx.fillRect(164, 62, 10, 26);
  eyes(ctx);
  brows(ctx, '#1c1410');
  mouth(ctx, 'smirk');
}

function drawTeo(ctx) {
  bg(ctx, '#1e3a2a', '#4a6b3a', '#d8a928');
  shoulders(ctx, '#3a5a8c');
  // Overalls straps + grease stain.
  ctx.fillStyle = '#33507a';
  ctx.fillRect(96, 190, 14, 66);
  ctx.fillRect(146, 190, 14, 66);
  ctx.fillStyle = 'rgba(20,20,20,0.55)';
  ctx.beginPath();
  ctx.ellipse(108, 224, 12, 7, 0.4, 0, Math.PI * 2);
  ctx.fill();
  face(ctx, '#d9a06b');
  // Green work cap.
  ctx.fillStyle = '#2e6b3a';
  ctx.beginPath();
  ctx.ellipse(128, 66, 48, 24, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(80, 64, 96, 10);
  ctx.beginPath();
  ctx.ellipse(128, 74, 52, 8, 0, 0, Math.PI);
  ctx.fill();
  eyes(ctx);
  brows(ctx, '#3a2418');
  mouth(ctx, 'smile');
  // Grease smudge on the cheek.
  ctx.fillStyle = 'rgba(30,30,30,0.5)';
  ctx.beginPath();
  ctx.ellipse(102, 128, 7, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawNia(ctx) {
  // The most important portrait: yellow jacket, high blue collar, teal
  // afro/fade, glowing blue cyberpunk eyewear.
  bg(ctx, '#0e2a4a', '#1e5fd6', '#f2c200');
  shoulders(ctx, '#f2c200', '#1e5fd6');
  // Jacket zip + pocket detail.
  ctx.strokeStyle = '#c9a000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(128, 196);
  ctx.lineTo(128, 256);
  ctx.stroke();
  ctx.fillStyle = '#1e5fd6';
  ctx.fillRect(96, 216, 18, 12);
  face(ctx, '#6b4423');
  // Teal afro: a cluster of circles, faded at the sides.
  ctx.fillStyle = '#0f8f7a';
  const afro = [
    [128, 52, 34], [96, 62, 24], [160, 62, 24], [76, 82, 18], [180, 82, 18],
    [110, 38, 20], [146, 38, 20], [128, 30, 18], [88, 44, 14], [168, 44, 14],
  ];
  for (const [x, y, r] of afro) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Teal highlight curls.
  ctx.fillStyle = '#2ec4a6';
  ctx.beginPath();
  ctx.arc(112, 44, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(148, 48, 7, 0, Math.PI * 2);
  ctx.fill();
  // Glowing blue cyberpunk eyewear: visor band + glow.
  ctx.save();
  ctx.shadowColor = '#33ccff';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#1a3a5e';
  ctx.beginPath();
  ctx.roundRect(84, 96, 88, 22, 10);
  ctx.fill();
  ctx.fillStyle = '#66d9ff';
  ctx.beginPath();
  ctx.roundRect(88, 100, 80, 14, 7);
  ctx.fill();
  ctx.restore();
  // Lens glints.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(104, 104, 8, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(152, 104, 8, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Small gold earring.
  ctx.fillStyle = '#f2c200';
  ctx.beginPath();
  ctx.arc(84, 128, 4, 0, Math.PI * 2);
  ctx.fill();
  mouth(ctx, 'smirk');
}

function drawSilas(ctx) {
  bg(ctx, '#120e1e', '#3a1a2e', '#8c1f28');
  shoulders(ctx, '#15151c');
  // Red tie.
  ctx.fillStyle = '#8c1f28';
  ctx.beginPath();
  ctx.moveTo(122, 192);
  ctx.lineTo(134, 192);
  ctx.lineTo(131, 226);
  ctx.lineTo(125, 226);
  ctx.closePath();
  ctx.fill();
  face(ctx, '#e0c0a0', { jaw: 4 });
  // Slicked-back black hair.
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.ellipse(128, 62, 47, 22, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(128, 58, 40, 10, 0, Math.PI, 0);
  ctx.fill();
  eyes(ctx);
  brows(ctx, '#0a0a0a', 4); // angled down — sharp, threatening
  // Scar across the left cheek.
  ctx.strokeStyle = '#f2d8c0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(98, 118);
  ctx.lineTo(112, 140);
  ctx.stroke();
  mouth(ctx, 'thin');
}

function drawValdez(ctx) {
  bg(ctx, '#0e1e3a', '#1c2b4a', '#d8a928');
  shoulders(ctx, '#1c2b4a');
  // Gold epaulettes + belt.
  ctx.fillStyle = '#d8a928';
  ctx.fillRect(40, 196, 34, 8);
  ctx.fillRect(182, 196, 34, 8);
  ctx.fillStyle = '#0d0d12';
  ctx.fillRect(96, 232, 64, 8);
  face(ctx, '#c98f5f');
  // Dark police cap with gold badge.
  ctx.fillStyle = '#14203a';
  ctx.beginPath();
  ctx.ellipse(128, 64, 49, 24, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(78, 62, 100, 10);
  ctx.beginPath();
  ctx.ellipse(128, 72, 54, 9, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#d8a928';
  ctx.beginPath();
  ctx.arc(128, 58, 7, 0, Math.PI * 2);
  ctx.fill();
  eyes(ctx);
  brows(ctx, '#14100c', 3);
  mouth(ctx, 'stern');
}

function drawDex(ctx) {
  bg(ctx, '#2a0e3a', '#7a2d8a', '#e84a8a');
  shoulders(ctx, '#e84a8a');
  // Orange chest panel on the shirt.
  ctx.fillStyle = '#f2a200';
  ctx.fillRect(108, 196, 40, 60);
  face(ctx, '#8a5a30');
  // Dark hair with a magenta streak.
  ctx.fillStyle = '#120e0a';
  ctx.beginPath();
  ctx.ellipse(128, 64, 47, 24, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#e84a8a';
  ctx.fillRect(96, 48, 10, 34);
  // Big DJ headphones: band + cups.
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(128, 78, 52, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.ellipse(76, 104, 12, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(180, 104, 12, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e84a8a';
  ctx.beginPath();
  ctx.arc(76, 104, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(180, 104, 5, 0, Math.PI * 2);
  ctx.fill();
  eyes(ctx);
  brows(ctx, '#120e0a');
  mouth(ctx, 'smile');
}

const PORTRAIT_DRAWERS = {
  Mara: drawMara,
  Teo: drawTeo,
  Nia: drawNia,
  Silas: drawSilas,
  Valdez: drawValdez,
  Dex: drawDex,
};

const ROLES = {
  Mara: 'Getaway driver',
  Teo: 'Mechanic',
  Nia: 'Fixer',
  Silas: 'Tidewater Syndicate boss',
  Valdez: 'Marigold Harbor Police pursuit chief',
  Dex: 'Radio DJ & informant',
};

function drawPortrait(key) {
  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d');
  PORTRAIT_DRAWERS[key](ctx);
  return canvas;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createCharacters(scene) {
  const out = {};

  for (const key of Object.keys(LOOKS)) {
    const model = buildFigure(key);
    model.visible = false;
    if (scene) scene.add(model);
    out[key] = {
      name: key === 'Mara' ? 'Mara Quill'
        : key === 'Teo' ? 'Teo Brandt'
        : key === 'Nia' ? 'Nia Okafor'
        : key === 'Silas' ? 'Silas Orrin'
        : key === 'Valdez' ? 'Captain Ines Valdez'
        : 'Dex "Switch" Marlowe',
      role: ROLES[key],
      model,
      portrait: drawPortrait(key),
    };
  }

  // Place a character's model in the world for a mission scene.
  out.place = (name, x, z, facing = 0) => {
    const entry = out[name];
    if (!entry) return null;
    entry.model.position.set(x, 0, z);
    entry.model.rotation.y = facing;
    entry.model.visible = true;
    return entry.model;
  };

  out.hide = (name) => {
    const entry = out[name];
    if (entry) entry.model.visible = false;
  };

  out.hideAll = () => {
    for (const key of Object.keys(LOOKS)) out[key].model.visible = false;
  };

  return out;
}
