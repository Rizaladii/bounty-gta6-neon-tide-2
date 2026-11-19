import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Port Marigold — the city for NEON TIDE.
// Seeded layout: the same streets, buildings and props on every run.
// The returned city object is the single source of truth for where things
// are — no other module hard-codes positions.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20261119;
const CITY_HALF = 220; // island edge; ocean beyond
const ROAD_LINES = [-180, -120, -60, 0, 60, 120, 180];
const ROAD_WIDTH = 12;
const SQUARE = { x: -60, z: 60, r: 28 }; // Old Cinder Town square
const SPAWN = { x: -60, z: 100, facing: Math.PI }; // road in front of safehouse
const SAFEHOUSE = { x: -78, z: 100, w: 12, d: 14, h: 7 };

const DISTRICTS = [
  { name: 'Sunset Boardwalk', color: 0xff5a3c, minX: -220, maxX: -120, minZ: -220, maxZ: 220 },
  { name: 'Velvet Hills', color: 0x9b59d0, minX: -120, maxX: 60, minZ: -220, maxZ: -80 },
  { name: 'Glass Harbor', color: 0x2ec4b6, minX: 60, maxX: 220, minZ: -220, maxZ: -40 },
  { name: 'Old Cinder Town', color: 0xc96f2e, minX: -120, maxX: 60, minZ: -80, maxZ: 140 },
  { name: 'Saltworks Docks', color: 0xe8a93c, minX: -120, maxX: 220, minZ: 140, maxZ: 220 },
];

const CAR_SPAWNS = [
  { x: -180, z: 40 }, { x: -120, z: -160 }, { x: -60, z: 140 },
  { x: 0, z: -120 }, { x: 60, z: 80 }, { x: 120, z: -60 },
  { x: 180, z: 160 }, { x: -60, z: -180 }, { x: 120, z: 40 },
  { x: 0, z: 180 },
];

const SHOP_WORDS = ['TIDE', 'NEON', 'PALMS', 'DOCK 9', 'SUNSET', 'VELVET', 'TACO', 'SURF', 'HOTEL', 'BAR'];
const NEON_COLORS = [0xff2e88, 0x00e5ff, 0xffe600, 0xff6b00, 0xb26bff];

// --- procedural canvas textures -------------------------------------------

function makeCanvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function brickTexture(rng) {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5e2f1a';
    ctx.fillRect(0, 0, w, h);
    const bh = 16, bw = 42;
    for (let y = 0; y < h; y += bh) {
      const off = ((y / bh) % 2 === 0) ? 0 : bw / 2;
      for (let x = -bw; x < w + bw; x += bw) {
        const v = 118 + Math.floor(rng() * 42);
        ctx.fillStyle = 'rgb(' + v + ',' + Math.floor(v * 0.55) + ',' + Math.floor(v * 0.32) + ')';
        ctx.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      }
    }
  });
}

function glassTexture(rng, top, bottom) {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const cols = 8, rows = 14;
    const cw = w / cols, ch = h / rows;
    const lit = ['#ffd27a', '#9fd8ff', '#ff9a5c', '#c8f0ff'];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng() < 0.45) {
          ctx.fillStyle = lit[Math.floor(rng() * lit.length)];
        } else {
          ctx.fillStyle = 'rgba(8, 22, 30, 0.9)';
        }
        ctx.fillRect(c * cw + 3, r * ch + 3, cw - 6, ch - 6);
      }
    }
  });
}

function facadeTexture(rng, base, trim) {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // faint vertical grime streaks
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(rng() * w, 0, 3 + rng() * 5, h);
    }
    const cols = 6, rows = 8;
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = trim;
        ctx.fillRect(c * cw + 4, r * ch + 4, cw - 8, ch - 8);
        ctx.fillStyle = rng() < 0.3 ? '#ffd27a' : '#1a1210';
        ctx.fillRect(c * cw + 7, r * ch + 7, cw - 14, ch - 14);
      }
    }
  });
}

function asphaltTexture(rng) {
  const tex = makeCanvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#262126';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const g = 30 + Math.floor(rng() * 30);
      ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 6) + ',0.5)';
      ctx.fillRect(rng() * w, rng() * h, 2, 2);
    }
    // dashed centre line
    ctx.fillStyle = '#c9a227';
    for (let y = 8; y < h; y += 64) ctx.fillRect(w / 2 - 3, y, 6, 34);
    // edge lines
    ctx.fillStyle = 'rgba(220,220,220,0.55)';
    ctx.fillRect(4, 0, 3, h);
    ctx.fillRect(w - 7, 0, 3, h);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 10);
  return tex;
}

function plankTexture(rng) {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7d4f27';
    ctx.fillRect(0, 0, w, h);
    const ph = 32;
    for (let y = 0; y < h; y += ph) {
      const v = 110 + Math.floor(rng() * 30);
      ctx.fillStyle = 'rgb(' + v + ',' + Math.floor(v * 0.62) + ',' + Math.floor(v * 0.34) + ')';
      ctx.fillRect(0, y + 2, w, ph - 4);
      ctx.strokeStyle = 'rgba(40,20,8,0.6)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const gy = y + 6 + rng() * (ph - 12);
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(w * 0.3, gy + 3, w * 0.6, gy - 3, w, gy);
        ctx.stroke();
      }
    }
  });
}

function sandTexture(rng) {
  const tex = makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d9a066';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1200; i++) {
      const v = 190 + Math.floor(rng() * 50);
      ctx.fillStyle = 'rgba(' + v + ',' + Math.floor(v * 0.72) + ',' + Math.floor(v * 0.45) + ',0.6)';
      ctx.fillRect(rng() * w, rng() * h, 2, 2);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

function oceanTexture(rng) {
  const tex = makeCanvasTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1d6f8e');
    grad.addColorStop(1, '#155a78');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rng() < 0.2 ? 'rgba(255,240,200,0.85)' : 'rgba(127,212,232,0.5)';
      const s = 1 + rng() * 2.5;
      ctx.fillRect(rng() * w, rng() * h, s, s);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 28);
  return tex;
}

function neonTextTexture(text, color) {
  return makeCanvasTexture(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = 'bold 38px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2);
  });
}

// --- city ------------------------------------------------------------------

export function createCity(scene) {
  const rng = mulberry32(SEED);
  const collisionBoxes = [];
  const clouds = [];
  const neonMats = [];
  let sunsetOn = true;

  function getDistrictAt(x, z) {
    for (const d of DISTRICTS) {
      if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) return d.name;
    }
    return 'Ocean';
  }

  // --- sky, sun, lights, fog ---------------------------------------------
  scene.background = new THREE.Color(0x2a1440);
  scene.fog = new THREE.Fog(0x4a2350, 150, 750);

  const sunDir = new THREE.Vector3(-0.62, 0.16, -0.28).normalize();

  const skyUniforms = {
    topColor: { value: new THREE.Color(0x1b1440) },
    midColor: { value: new THREE.Color(0x8a2a6d) },
    horizonColor: { value: new THREE.Color(0xff7a2a) },
    sunDirection: { value: sunDir.clone() },
    sunColor: { value: new THREE.Color(0xffd27a) },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform vec3 topColor; uniform vec3 midColor; uniform vec3 horizonColor;',
      'uniform vec3 sunDirection; uniform vec3 sunColor;',
      'void main(){',
      '  float h = clamp(vDir.y, -0.05, 1.0);',
      '  vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));',
      '  col = mix(col, topColor, smoothstep(0.22, 0.75, h));',
      '  float s = max(dot(normalize(vDir), normalize(sunDirection)), 0.0);',
      '  col += sunColor * (pow(s, 220.0) * 1.4 + pow(s, 18.0) * 0.45 + pow(s, 4.0) * 0.18);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), skyMat);
  scene.add(sky);

  // low sun disc on the western horizon
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(28, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
  );
  sunDisc.position.copy(sunDir).multiplyScalar(820);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  const sunLight = new THREE.DirectionalLight(0xffb36b, 2.2);
  sunLight.position.copy(sunDir).multiplyScalar(320);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0x7a4a8a, 0x2a1a12, 0.9);
  scene.add(hemiLight);

  // soft volumetric-looking clouds, pink in the sunset
  const cloudGeo = new THREE.SphereGeometry(1, 12, 8);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffb8c8, transparent: true, opacity: 0.32, fog: false });
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.position.set(-350 + rng() * 700, 95 + rng() * 60, -350 + rng() * 700);
    cloud.scale.set(30 + rng() * 40, 6 + rng() * 4, 18 + rng() * 14);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // --- ocean, sand, ground --------------------------------------------------
  const oceanTex = oceanTexture(rng);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({ map: oceanTex, color: 0x2a7fa8, roughness: 0.15, metalness: 0.55 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.5;
  scene.add(ocean);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshStandardMaterial({ map: sandTexture(rng), roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.15;
  scene.add(sand);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x33302c, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // --- roads ----------------------------------------------------------------
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(rng), roughness: 0.35, metalness: 0.15 });
  function addRoad(x, z, rotY) {
    const geo = new THREE.PlaneGeometry(ROAD_WIDTH, CITY_HALF * 2);
    geo.rotateX(-Math.PI / 2);
    if (rotY) geo.rotateY(rotY);
    const road = new THREE.Mesh(geo, roadMat);
    road.position.set(x, 0.05, z);
    scene.add(road);
  }
  for (const line of ROAD_LINES) {
    addRoad(line, 0, 0); // vertical road (along z)
    addRoad(0, line, Math.PI / 2); // horizontal road (along x)
  }
  // two diagonal avenues across the city
  const diagGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 640);
  diagGeo.rotateX(-Math.PI / 2);
  const diagMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(rng), roughness: 0.35, metalness: 0.15 });
  for (const rot of [Math.PI / 4, -Math.PI / 4]) {
    const geo = diagGeo.clone();
    geo.rotateY(rot);
    const road = new THREE.Mesh(geo, diagMat);
    road.position.set(0, 0.05, 0);
    scene.add(road);
  }

  // wooden boardwalk deck along the west shore
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 400),
    new THREE.MeshStandardMaterial({ map: plankTexture(rng), roughness: 0.9 })
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(-200, 0.08, 0);
  scene.add(deck);

  // --- materials ------------------------------------------------------------
  const brickTex = brickTexture(rng);
  const glassTex = glassTexture(rng, '#0d3542', '#123f52');
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({
    map: glassTex, metalness: 0.65, roughness: 0.28,
    emissive: 0xffffff, emissiveMap: glassTex, emissiveIntensity: 0.35,
  });
  const villaMat = new THREE.MeshStandardMaterial({ map: facadeTexture(rng, '#6b4a8f', '#3a2a55'), roughness: 0.85 });
  const warehouseMat = new THREE.MeshStandardMaterial({ map: facadeTexture(rng, '#8a6a3a', '#4a3a1a'), roughness: 0.9 });
  const kioskMat = new THREE.MeshStandardMaterial({ map: facadeTexture(rng, '#b0503a', '#5e2418'), roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2326, roughness: 0.9 });
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xe8a93c, roughness: 0.6, metalness: 0.4 });
  const containerMats = [0x2a6fb0, 0xc0392b, 0x27ae60, 0xe67e22].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.3 })
  );

  // --- building helpers -----------------------------------------------------
  function clearOfSpecials(x, z, w, d) {
    const r = Math.max(w, d) / 2;
    if (Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r + r + 2) return false;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 10 + r) return false;
    if (Math.hypot(x - SAFEHOUSE.x, z - SAFEHOUSE.z) < 12 + r) return false;
    const d1 = Math.abs(z - x) / Math.SQRT2;
    const d2 = Math.abs(z + x) / Math.SQRT2;
    if (Math.min(d1, d2) < 10 + r) return false;
    return true;
  }

  function addBuilding(cx, cz, w, d, h, material, opts) {
    opts = opts || {};
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(cx, h / 2, cz);
    scene.add(mesh);
    collisionBoxes.push({ x: cx, z: cz, width: w, depth: d, top: h });
    if (opts.roof) {
      const roofH = 2 + rng() * 2;
      const radius = Math.max(w, d) * 0.72;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(radius, roofH, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.scale.x = w / (radius * Math.SQRT2);
      roof.scale.z = d / (radius * Math.SQRT2);
      roof.position.set(cx, h + roofH / 2 - 0.05, cz);
      scene.add(roof);
    }
    if (opts.sign) {
      addNeonSign(cx, cz, w, d, h);
    }
    return mesh;
  }

  function addNeonSign(cx, cz, w, d, h, text) {
    const color = NEON_COLORS[Math.floor(rng() * NEON_COLORS.length)];
    const hex = '#' + color.toString(16).padStart(6, '0');
    const tex = neonTextTexture(text || SHOP_WORDS[Math.floor(rng() * SHOP_WORDS.length)], hex);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: 0xffffff, emissiveMap: tex,
      emissiveIntensity: 2.6, transparent: true,
    });
    neonMats.push(mat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.7, 12), 3), mat);
    sign.position.set(cx, h * 0.72, cz + d / 2 + 0.12);
    scene.add(sign);
  }

  function addContainerStack(x, z) {
    const mat = containerMats[Math.floor(rng() * containerMats.length)];
    const levels = rng() < 0.4 ? 2 : 1;
    for (let i = 0; i < levels; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.6), mat);
      box.position.set(x, 1.3 + i * 2.6, z);
      scene.add(box);
    }
    collisionBoxes.push({ x: x, z: z, width: 6.4, depth: 3, top: levels * 2.6 });
  }

  function addCrane(x, z) {
    const group = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(2.4, 30, 2.4), craneMat);
    mast.position.y = 15;
    group.add(mast);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 1.6, 1.6), craneMat);
    jib.position.set(8, 29, 0);
    group.add(jib);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 1.6), craneMat);
    counter.position.set(-9, 29, 0);
    group.add(counter);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 12, 4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    cable.position.set(18, 23, 0);
    group.add(cable);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    hook.position.set(18, 16.5, 0);
    group.add(hook);
    group.position.set(x, 0, z);
    group.rotation.y = rng() * Math.PI;
    scene.add(group);
    collisionBoxes.push({ x: x, z: z, width: 3, depth: 3, top: 30 });
  }

  // --- town square, fountain, safehouse --------------------------------------
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(SQUARE.r, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 1 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(SQUARE.x, 0.06, SQUARE.z);
  scene.add(plaza);

  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6.4, 0.9, 24),
    new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.9 })
  );
  basin.position.set(SQUARE.x, 0.45, SQUARE.z);
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(5.4, 24),
    new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.1, metalness: 0.4, emissive: 0x0a3a44, emissiveIntensity: 0.5 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(SQUARE.x, 0.92, SQUARE.z);
  scene.add(water);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 2.6, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.9 })
  );
  column.position.set(SQUARE.x, 2.2, SQUARE.z);
  scene.add(column);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xff9a3c, emissiveIntensity: 1.6 })
  );
  orb.position.set(SQUARE.x, 3.9, SQUARE.z);
  scene.add(orb);
  collisionBoxes.push({ x: SQUARE.x, z: SQUARE.z, width: 12, depth: 12, top: 2.5 });

  // benches around the square
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), benchMat);
    bench.position.set(SQUARE.x + Math.cos(a) * 20, 0.5, SQUARE.z + Math.sin(a) * 20);
    bench.rotation.y = -a;
    scene.add(bench);
  }

  // Mara's safehouse garage, fronting the road at x = -60
  addBuilding(SAFEHOUSE.x, SAFEHOUSE.z, SAFEHOUSE.w, SAFEHOUSE.d, SAFEHOUSE.h, brickMat, { roof: true });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.4 });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.5), doorMat);
  door.rotation.y = Math.PI / 2;
  door.position.set(SAFEHOUSE.x + SAFEHOUSE.w / 2 + 0.12, 2.25, SAFEHOUSE.z);
  scene.add(door);
  const safeTex = neonTextTexture('SAFEHOUSE', '#ff6b00');
  const safeMat = new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: 0xffffff, emissiveMap: safeTex,
    emissiveIntensity: 2.6, transparent: true,
  });
  neonMats.push(safeMat);
  const safeSign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), safeMat);
  safeSign.rotation.y = Math.PI / 2;
  safeSign.position.set(SAFEHOUSE.x + SAFEHOUSE.w / 2 + 0.12, 5.4, SAFEHOUSE.z);
  scene.add(safeSign);

  // --- district buildings ----------------------------------------------------
  const blockCenters = [-150, -90, -30, 30, 90, 150];
  const craneSpots = [[150, 165], [30, 200], [210, 200]];
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const district = getDistrictAt(bx, bz);
      if (district === 'Ocean') continue;
      // keep the diagonal avenues clear
      const dd1 = Math.abs(bz - bx) / Math.SQRT2;
      const dd2 = Math.abs(bz + bx) / Math.SQRT2;
      if (Math.min(dd1, dd2) < 20) continue;
      // keep the town square open
      if (Math.hypot(bx - SQUARE.x, bz - SQUARE.z) < 36) continue;
      // cranes own their blocks in the Docks
      let craneBlock = false;
      for (const [cx, cz] of craneSpots) {
        if (Math.hypot(bx - cx, bz - cz) < 30) craneBlock = true;
      }
      if (craneBlock) continue;

      const jx = () => (rng() - 0.5) * 10;
      const jz = () => (rng() - 0.5) * 10;

      if (district === 'Glass Harbor') {
        const w = 26 + rng() * 8, d = 26 + rng() * 8, h = 35 + rng() * 55;
        const x = bx + (rng() - 0.5) * 8, z = bz + (rng() - 0.5) * 8;
        if (!clearOfSpecials(x, z, w, d)) continue;
        addBuilding(x, z, w, d, h, glassMat, {});
        // rooftop antenna on the tallest towers
        if (h > 60) {
          const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 10, 6), craneMat);
          ant.position.set(x, h + 5, z);
          scene.add(ant);
        }
      } else if (district === 'Old Cinder Town') {
        for (let i = 0; i < 2; i++) {
          const w = 13 + rng() * 7, d = 13 + rng() * 7, h = 8 + rng() * 10;
          const x = bx + (i === 0 ? -11 : 11) + jx() * 0.4;
          const z = bz + jz() * 0.6;
          if (!clearOfSpecials(x, z, w, d)) continue;
          addBuilding(x, z, w, d, h, brickMat, { roof: true, sign: rng() < 0.5 });
        }
      } else if (district === 'Velvet Hills') {
        const w = 16 + rng() * 6, d = 14 + rng() * 6, h = 7 + rng() * 7;
        const x = bx + jx(), z = bz + jz();
        if (clearOfSpecials(x, z, w, d)) {
          addBuilding(x, z, w, d, h, villaMat, { roof: true, sign: rng() < 0.4 });
        }
      } else if (district === 'Saltworks Docks') {
        const w = 30, d = 20, h = 9 + rng() * 5;
        const x = bx + jx() * 0.4, z = bz + jz() * 0.6;
        if (clearOfSpecials(x, z, w, d)) {
          addBuilding(x, z, w, d, h, warehouseMat, {});
        }
        if (rng() < 0.6) {
          const cx = bx - 14, cz = bz + 14;
          if (clearOfSpecials(cx, cz, 6.4, 3)) addContainerStack(cx, cz);
          const cx2 = bx + 14, cz2 = bz - 14;
          if (rng() < 0.5 && clearOfSpecials(cx2, cz2, 6.4, 3)) addContainerStack(cx2, cz2);
        }
      } else if (district === 'Sunset Boardwalk') {
        const count = rng() < 0.5 ? 1 : 2;
        for (let i = 0; i < count; i++) {
          const w = 10 + rng() * 4, d = 8 + rng() * 4, h = 4 + rng() * 2.5;
          const x = bx + (i === 0 ? -9 : 9) + jx() * 0.3;
          const z = bz + jz() * 0.5;
          if (!clearOfSpecials(x, z, w, d)) continue;
          addBuilding(x, z, w, d, h, kioskMat, { sign: rng() < 0.7 });
          // striped awning over the kiosk front
          const awn = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.8, 0.25, 3),
            new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.9 })
          );
          awn.position.set(x, h * 0.62, z + d / 2 + 1.2);
          awn.rotation.x = 0.18;
          scene.add(awn);
        }
      }
    }
  }

  // cranes over the Docks
  for (const [cx, cz] of craneSpots) addCrane(cx, cz);

  // --- harbor piers, moored boats --------------------------------------------
  const pierMat = new THREE.MeshStandardMaterial({ map: plankTexture(rng), roughness: 0.9 });
  for (const pz of [-160, -120, -80]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 6), pierMat);
    pier.position.set(235, 0.6, pz);
    scene.add(pier);
  }
  const boatHullMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
  const boatCabinMat = new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.5 });
  function addMooredBoat(x, z, rot) {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 2.6), boatHullMat);
    hull.position.y = 0.3;
    group.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 2), boatCabinMat);
    cabin.position.set(-0.5, 1.7, 0);
    group.add(cabin);
    group.position.set(x, -0.5, z);
    group.rotation.y = rot;
    scene.add(group);
  }
  addMooredBoat(242, -142, 0.15);
  addMooredBoat(242, -98, -0.1);

  // --- palms ------------------------------------------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 6.5, 6);
  const frondGeo = new THREE.ConeGeometry(1.1, 4.2, 4);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.9, side: THREE.DoubleSide });
  function addPalm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.25;
    trunk.rotation.z = (rng() - 0.5) * 0.24;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      const a = (i / 6) * Math.PI * 2 + rng() * 0.4;
      frond.position.set(Math.cos(a) * 0.4, 6.6, Math.sin(a) * 0.4);
      frond.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      frond.scale.set(1, 1, 0.28);
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  // palms along the boardwalk deck, alternating sides
  for (let i = 0, z = -190; z <= 190; i++, z += 26) {
    addPalm(i % 2 === 0 ? -210 : -190, z);
  }
  // a few palms in Velvet Hills
  for (let i = 0; i < 6; i++) {
    addPalm(-110 + rng() * 150, -210 + rng() * 110);
  }

  // --- streetlamps --------------------------------------------------------------
  const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6);
  const lampHeadGeo = new THREE.SphereGeometry(0.38, 10, 8);
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x1c1a20, roughness: 0.6, metalness: 0.6 });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb347, emissiveIntensity: 2.4 });
  function addLamp(x, z) {
    const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
    pole.position.set(x, 2.75, z);
    scene.add(pole);
    const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
    head.position.set(x, 5.6, z);
    scene.add(head);
  }
  for (const line of ROAD_LINES) {
    for (let t = -180; t <= 180; t += 60) {
      addLamp(line + 8, t + 15);
      addLamp(t + 15, line - 8);
    }
  }

  // --- string lights over the boardwalk -----------------------------------------
  const bulbGeo = new THREE.SphereGeometry(0.14, 6, 5);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4, 5);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });
  for (let z = -180; z <= 180; z += 45) {
    for (const px of [-212, -188]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(px, 2, z);
      scene.add(pole);
    }
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(-212 + t * 24, 4 - Math.sin(t * Math.PI) * 0.9, z);
      scene.add(bulb);
    }
  }

  // --- beach umbrellas ------------------------------------------------------------
  const umbrellaColors = [0xff5a3c, 0x2ec4b6, 0xffe600, 0xff2e88];
  for (let i = 0; i < 4; i++) {
    const ux = -228, uz = -120 + i * 80;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 5), poleMat);
    pole.position.set(ux, 1.2, uz);
    scene.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: umbrellaColors[i], roughness: 0.9 })
    );
    top.position.set(ux, 2.9, uz);
    scene.add(top);
  }

  // --- walk points, road points -----------------------------------------------------
  const walkPoints = [];
  for (let i = 0; i < 48; i++) {
    if (rng() < 0.5) {
      const line = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
      walkPoints.push({ x: line + (rng() < 0.5 ? -1 : 1) * (8 + rng() * 2), z: -200 + rng() * 400 });
    } else {
      const line = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
      walkPoints.push({ x: -200 + rng() * 400, z: line + (rng() < 0.5 ? -1 : 1) * (8 + rng() * 2) });
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    walkPoints.push({ x: SQUARE.x + Math.cos(a) * 32, z: SQUARE.z + Math.sin(a) * 32 });
  }

  function randomRoadPoint() {
    if (rng() < 0.5) {
      return { x: ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)], z: -210 + rng() * 420 };
    }
    return { x: -210 + rng() * 420, z: ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)] };
  }

  // --- sunset toggle (for testing) --------------------------------------------------
  function setSunset(enabled) {
    sunsetOn = !!enabled;
    if (sunsetOn) {
      skyUniforms.topColor.value.set(0x1b1440);
      skyUniforms.midColor.value.set(0x8a2a6d);
      skyUniforms.horizonColor.value.set(0xff7a2a);
      skyUniforms.sunColor.value.set(0xffd27a);
      sunLight.color.set(0xffb36b);
      sunLight.intensity = 2.2;
      hemiLight.intensity = 0.9;
      scene.fog.color.set(0x4a2350);
      lampHeadMat.emissiveIntensity = 2.4;
      for (const m of neonMats) m.emissiveIntensity = 2.6;
    } else {
      skyUniforms.topColor.value.set(0x2f6fd0);
      skyUniforms.midColor.value.set(0x7fb2e8);
      skyUniforms.horizonColor.value.set(0xd8ecff);
      skyUniforms.sunColor.value.set(0xfff2c0);
      sunLight.color.set(0xfff0d0);
      sunLight.intensity = 2.6;
      hemiLight.intensity = 1.2;
      scene.fog.color.set(0x9fc3e0);
      lampHeadMat.emissiveIntensity = 0.4;
      for (const m of neonMats) m.emissiveIntensity = 0.8;
    }
  }

  // --- ambient animation (ocean sparkle drift, cloud drift) --------------------------
  function update(dt) {
    oceanTex.offset.x += dt * 0.004;
    oceanTex.offset.y += dt * 0.002;
    for (const c of clouds) {
      c.position.x += dt * 1.5;
      if (c.position.x > 380) c.position.x = -380;
    }
  }

  return {
    districts: DISTRICTS.map((d) => ({
      name: d.name,
      color: d.color,
      bounds: { minX: d.minX, maxX: d.maxX, minZ: d.minZ, maxZ: d.maxZ },
    })),
    collisionBoxes: collisionBoxes,
    spawn: { x: SPAWN.x, z: SPAWN.z, facing: SPAWN.facing },
    carSpawns: CAR_SPAWNS.map((p) => ({ x: p.x, z: p.z })),
    boatSpawn: { x: 238, z: -108 },
    walkPoints: walkPoints,
    getDistrictAt: getDistrictAt,
    randomRoadPoint: randomRoadPoint,
    setSunset: setSunset,
    update: update,
  };
}
