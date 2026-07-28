import * as THREE from 'three';

// The Skeld layout — walkable rectangles: [x1, z1, x2, z2, floorColor, name]
export const ROOMS = [
  // rooms
  [-8, -30, 14, -10, 0x9aa3b5, 'Cafeteria'],
  [22, -30, 34, -20, 0x9a86a8, 'Weapons'],
  [18, -14, 26, -6, 0x7fa88a, 'O2'],
  [38, -10, 46, 2, 0x8098b8, 'Navigation'],
  [24, 12, 34, 22, 0xb0a070, 'Shields'],
  [4, -4, 14, 6, 0xa87e70, 'Admin'],
  [-8, 6, 6, 26, 0x8f8a76, 'Storage'],
  [8, 20, 20, 28, 0x7a93a0, 'Comms'],
  [-22, -20, -12, -6, 0x7fa89a, 'MedBay'],
  [-42, -28, -30, -18, 0xa88080, 'Upper Engine'],
  [-45, -8, -38, 6, 0x9d80b0, 'Reactor'],
  [-34, -8, -28, 2, 0x8a8aa0, 'Security'],
  [-42, 14, -30, 24, 0xa88080, 'Lower Engine'],
  [-24, 8, -12, 20, 0xb0a070, 'Electrical'],
  // hallways
  [14, -26, 22, -22, 0x707a90, 'Hallway'],
  [26, -20, 30, -4, 0x707a90, 'Hallway'],
  [30, -12, 38, -6, 0x707a90, 'Hallway'],
  [30, -6, 34, 12, 0x707a90, 'Hallway'],
  [6, -10, 12, -4, 0x707a90, 'Hallway'],
  [-4, -10, 2, 6, 0x707a90, 'Hallway'],
  [6, 21, 8, 25, 0x707a90, 'Hallway'],
  [6, 14, 24, 18, 0x707a90, 'Hallway'],
  [-30, -24, -8, -20, 0x707a90, 'Hallway'],
  [-38, -18, -34, 14, 0x707a90, 'Hallway'],
  [-30, 16, -24, 20, 0x707a90, 'Hallway'],
  [-12, 10, -8, 14, 0x707a90, 'Hallway'],
];

export const TASKS = [
  { x: -41.5, z: -1, label: 'Start Reactor' },
  { x: 42, z: -4, label: 'Chart Course' },
  { x: -18, z: 14, label: 'Fix Wiring' },
  { x: -17, z: -13, label: 'Submit Scan' },
  { x: -1, z: 16, label: 'Empty Garbage' },
  { x: 29, z: 17, label: 'Prime Shields' },
  { x: 14, z: 24, label: 'Upload Data' },
];

export const VENTS = [
  [11, -13], [-40, 3], [43, 0], [-14, 18], [31, 14], [-14, -8],
];

export const EMERGENCY_POS = new THREE.Vector3(3, 0, -20);

// circular blockers for large props: [x, z, radius]
export const OBSTACLES = [
  [-4, -25, 1.9], [10, -25, 1.9], [-4, -15, 1.9], [10, -15, 1.9], // cafeteria tables
  [9, 1, 2.2],       // admin table
  [-43.5, 3, 1.9],   // reactor core
  [-40, -23, 2.4],   // upper engine block
  [-40, 19, 2.4],    // lower engine block
];

export function roomNameAt(x, z) {
  for (const [x1, z1, x2, z2, , name] of ROOMS) {
    if (x >= x1 && x <= x2 && z >= z1 && z <= z2) return name;
  }
  return 'the ship';
}

// ---------- collision ----------
export function pointWalkable(x, z) {
  if (Math.hypot(x - EMERGENCY_POS.x, z - EMERGENCY_POS.z) < 1.5) return false;
  for (const [ox, oz, r] of OBSTACLES) {
    if (Math.hypot(x - ox, z - oz) < r) return false;
  }
  for (const [x1, z1, x2, z2] of ROOMS) {
    if (x >= x1 && x <= x2 && z >= z1 && z <= z2) return true;
  }
  return false;
}

export function circleWalkable(x, z, r) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (!pointWalkable(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
  }
  return true;
}

export function tryMove(pos, dx, dz, r) {
  if (circleWalkable(pos.x + dx, pos.z + dz, r)) { pos.x += dx; pos.z += dz; return; }
  if (circleWalkable(pos.x + dx, pos.z, r)) { pos.x += dx; return; }
  if (circleWalkable(pos.x, pos.z + dz, r)) { pos.z += dz; }
}

// ---------- crewmate factory ----------
export function makeCrewmate(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 });
  // one outline material per crewmate so effects (invisibility) never leak to others
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x10131f, side: THREE.BackSide });
  const addOutline = (mesh, scale = 1.09) => {
    const outline = new THREE.Mesh(mesh.geometry, outlineMat);
    outline.scale.setScalar(scale);
    mesh.add(outline);
  };

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.55, 6, 14), mat);
  body.position.y = 0.95;
  body.castShadow = true;
  addOutline(body);
  group.add(body);

  const legGeo = new THREE.CapsuleGeometry(0.17, 0.28, 4, 8);
  const legL = new THREE.Mesh(legGeo, mat);
  legL.position.set(-0.24, 0.3, 0);
  legL.castShadow = true;
  addOutline(legL, 1.14);
  const legR = new THREE.Mesh(legGeo, mat);
  legR.position.set(0.24, 0.3, 0);
  legR.castShadow = true;
  addOutline(legR, 1.14);
  group.add(legL, legR);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0x8fc6dd, roughness: 0.08, metalness: 0.45 })
  );
  visor.scale.set(1.05, 0.72, 0.75);
  visor.position.set(0, 1.22, 0.36);
  addOutline(visor, 1.12);
  group.add(visor);

  // specular glint on the visor
  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  shine.scale.set(1.4, 0.7, 0.6);
  shine.position.set(-0.11, 1.32, 0.62);
  group.add(shine);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.28), mat);
  pack.position.set(0, 0.95, -0.55);
  pack.castShadow = true;
  addOutline(pack);
  group.add(pack);

  group.userData.legs = [legL, legR];
  group.userData.mat = mat;
  group.userData.visor = visor;
  return group;
}

// ---------- static world geometry ----------
function subtractIntervals(base, cuts) {
  let pieces = [base];
  for (const [c1, c2] of cuts) {
    const next = [];
    for (const [p1, p2] of pieces) {
      if (c2 <= p1 || c1 >= p2) { next.push([p1, p2]); continue; }
      if (c1 > p1) next.push([p1, c1]);
      if (c2 < p2) next.push([c2, p2]);
    }
    pieces = next;
  }
  return pieces.filter(([a, b]) => b - a > 0.05);
}

function makeTileTexture(colorHex) {
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 64;
  canvas2d.height = 64;
  const c = canvas2d.getContext('2d');
  const base = new THREE.Color(colorHex);
  c.fillStyle = `#${base.getHexString()}`;
  c.fillRect(0, 0, 64, 64);
  const dark = base.clone().multiplyScalar(0.86);
  c.strokeStyle = `#${dark.getHexString()}`;
  c.lineWidth = 3;
  c.strokeRect(0, 0, 64, 64);
  const light = base.clone().multiplyScalar(1.06);
  c.fillStyle = `#${light.getHexString()}`;
  c.fillRect(4, 4, 24, 24);
  const tex = new THREE.CanvasTexture(canvas2d);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function buildWorld(scene) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4260, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x232a44, roughness: 0.9 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x5a6a95, roughness: 0.6, emissive: 0x131b33 });

  for (const [x1, z1, x2, z2, color] of ROOMS) {
    const w = x2 - x1;
    const d = z2 - z1;
    const tex = makeTileTexture(color);
    tex.repeat.set(w / 3, d / 3);
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.4, d),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
    );
    floor.position.set((x1 + x2) / 2, -0.2, (z1 + z2) / 2);
    floor.receiveShadow = true;
    scene.add(floor);
  }

  const WALL_H = 3.2;
  const WALL_T = 0.6;
  const segs = [];
  for (const [x1, z1, x2, z2] of ROOMS) {
    const sides = [
      { axis: 'x', line: z1, span: [x1, x2], dir: -1 },
      { axis: 'x', line: z2, span: [x1, x2], dir: 1 },
      { axis: 'z', line: x1, span: [z1, z2], dir: -1 },
      { axis: 'z', line: x2, span: [z1, z2], dir: 1 },
    ];
    for (const side of sides) {
      const cuts = [];
      for (const [ox1, oz1, ox2, oz2] of ROOMS) {
        if (ox1 === x1 && oz1 === z1 && ox2 === x2 && oz2 === z2) continue;
        if (side.axis === 'x') {
          const touches = (side.dir === -1 && oz2 === side.line) || (side.dir === 1 && oz1 === side.line);
          if (touches) cuts.push([Math.max(side.span[0], ox1), Math.min(side.span[1], ox2)]);
        } else {
          const touches = (side.dir === -1 && ox2 === side.line) || (side.dir === 1 && ox1 === side.line);
          if (touches) cuts.push([Math.max(side.span[0], oz1), Math.min(side.span[1], oz2)]);
        }
      }
      for (const [a, b] of subtractIntervals(side.span, cuts)) {
        segs.push({ axis: side.axis, line: side.line + side.dir * (WALL_T / 2), a, b });
      }
    }
  }
  for (const { axis, line, a, b } of segs) {
    const len = b - a + WALL_T;
    const geo = axis === 'x'
      ? new THREE.BoxGeometry(len, WALL_H, WALL_T)
      : new THREE.BoxGeometry(WALL_T, WALL_H, len);
    const wall = new THREE.Mesh(geo, wallMat);
    if (axis === 'x') wall.position.set((a + b) / 2, WALL_H / 2, line);
    else wall.position.set(line, WALL_H / 2, (a + b) / 2);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    const trim = new THREE.Mesh(geo.clone(), trimMat);
    trim.scale.set(1.02, 0.12, 1.02);
    trim.position.copy(wall.position);
    trim.position.y = WALL_H + 0.15;
    scene.add(trim);
    const band = new THREE.Mesh(geo.clone(), bandMat);
    band.scale.set(1.015, 0.14, 1.015);
    band.position.copy(wall.position);
    band.position.y = 2.05;
    scene.add(band);
  }

  // emergency button
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.3, 0.8, 20),
    new THREE.MeshStandardMaterial({ color: 0x4a5470, roughness: 0.7 })
  );
  pedestal.position.set(EMERGENCY_POS.x, 0.4, EMERGENCY_POS.z);
  pedestal.castShadow = true;
  scene.add(pedestal);
  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.55, 0.25, 20),
    new THREE.MeshStandardMaterial({ color: 0xd42020, emissive: 0x770a0a, roughness: 0.3 })
  );
  button.position.set(EMERGENCY_POS.x, 0.9, EMERGENCY_POS.z);
  scene.add(button);
  // glass dome over the button
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0xffb0b0, roughness: 0.05, metalness: 0.2,
      transparent: true, opacity: 0.28, depthWrite: false,
    })
  );
  dome.position.set(EMERGENCY_POS.x, 0.82, EMERGENCY_POS.z);
  scene.add(dome);

  // floating room labels
  for (const [x1, z1, x2, z2, , name] of ROOMS) {
    if (name === 'Hallway') continue;
    const canvas2d = document.createElement('canvas');
    canvas2d.width = 256;
    canvas2d.height = 64;
    const c = canvas2d.getContext('2d');
    c.font = 'bold 34px "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(238, 242, 255, 0.85)';
    c.strokeStyle = 'rgba(5, 6, 14, 0.9)';
    c.lineWidth = 6;
    c.strokeText(name.toUpperCase(), 128, 32);
    c.fillText(name.toUpperCase(), 128, 32);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas2d),
      transparent: true,
      depthTest: false,
      opacity: 0.8,
    }));
    sprite.scale.set(8, 2, 1);
    sprite.position.set((x1 + x2) / 2, 4.2, (z1 + z2) / 2);
    scene.add(sprite);
  }

  // vents
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x2c3248, roughness: 0.6, metalness: 0.4 });
  const slatMat = new THREE.MeshStandardMaterial({ color: 0x151a2c, roughness: 0.8 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x1a1f30, roughness: 0.5, metalness: 0.5 });
  for (const [vx, vz] of VENTS) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.2, 0.1, 6), rimMat);
    rim.position.set(vx, 0.05, vz);
    scene.add(rim);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.18, 6), ventMat);
    base.position.set(vx, 0.12, vz);
    scene.add(base);
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.16), slatMat);
      slat.position.set(vx, 0.24, vz + i * 0.3);
      scene.add(slat);
    }
  }

  addProps(scene);
  addRoomLights(scene);
  addStarfield(scene);
}

// ---------- props ----------
function prop(scene, geo, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.7,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.ei ?? 1,
  }));
  mesh.position.set(x, y, z);
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addProps(scene) {
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
  const cone = (r, h, s = 10) => new THREE.ConeGeometry(r, h, s);

  // cafeteria: round tables with stools
  for (const [tx, tz] of [[-4, -25], [10, -25], [-4, -15], [10, -15]]) {
    prop(scene, cyl(1.6, 1.6, 0.22, 20), 0xa8b8cc, tx, 1.05, tz);
    prop(scene, cyl(0.32, 0.45, 1.0, 10), 0x6a7890, tx, 0.5, tz);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      prop(scene, cyl(0.38, 0.38, 0.5, 10), 0x8593ab, tx + Math.cos(a) * 2.5, 0.25, tz + Math.sin(a) * 2.5);
    }
  }

  // admin: holo table
  prop(scene, box(4, 1.1, 2.6), 0x77584a, 9, 0.55, 1);
  prop(scene, box(3.4, 0.12, 2.0), 0x39d353, 9, 1.25, 1, { emissive: 0x1a7a2f, ei: 1.4 });

  // reactor: glowing core with rings
  prop(scene, cyl(1.4, 1.7, 2.4, 14), 0x9d7fd0, -43.5, 1.2, 3, { emissive: 0x5522aa, ei: 0.9 });
  for (const ry of [0.6, 1.7]) {
    prop(scene, new THREE.TorusGeometry(1.8, 0.12, 8, 22), 0x2c3248, -43.5, ry, 3, { rx: Math.PI / 2 });
  }

  // engines: block + glowing thruster nozzle
  for (const ez of [-23, 19]) {
    prop(scene, box(3.4, 2.6, 3.4), 0x6a5a5a, -40, 1.3, ez);
    prop(scene, cyl(0.9, 0.9, 0.6, 14), 0xffaa55, -38, 1.3, ez, { emissive: 0xcc5511, ei: 1.6, rz: Math.PI / 2 });
  }

  // medbay: scan pad + beds
  prop(scene, cyl(1.2, 1.4, 0.18, 20), 0x66e0d0, -20, 0.09, -9, { emissive: 0x1a7a70, ei: 1.3 });
  prop(scene, box(1.4, 0.5, 2.6), 0xd6e0f0, -13.2, 0.25, -17.5);
  prop(scene, box(1.4, 0.5, 2.6), 0xd6e0f0, -13.2, 0.25, -14);

  // electrical: wall panels with blinking-colored lights
  const lightColors = [0xffdd44, 0x44ff66, 0xff4444];
  [-22, -19, -16].forEach((px, i) => {
    prop(scene, box(2.2, 1.8, 0.35), 0x4a4438, px, 1.3, 8.9);
    prop(scene, box(0.25, 0.25, 0.12), lightColors[i], px - 0.5, 1.6, 9.12, { emissive: lightColors[i], ei: 1.8 });
    prop(scene, box(0.25, 0.25, 0.12), lightColors[(i + 1) % 3], px + 0.5, 1.6, 9.12, { emissive: lightColors[(i + 1) % 3], ei: 1.8 });
  });

  // storage: crates + barrels
  for (const [cx, cz, r] of [[-6, 8.8, 0.2], [-6, 11.5, 0.7], [-3.8, 8.8, 0.4], [4, 23.5, 0.1], [1.5, 24.2, 0.9], [4, 20.5, 0.5]]) {
    prop(scene, box(1.8, 1.4, 1.8), 0x8a6f4d, cx, 0.7, cz, { ry: r });
  }
  prop(scene, cyl(0.7, 0.7, 1.5, 12), 0x5a7a5a, -5.5, 0.75, 23.5);
  prop(scene, cyl(0.7, 0.7, 1.5, 12), 0x5a7a5a, -3.4, 0.75, 24.3);

  // security: desk + monitor wall
  prop(scene, box(0.6, 1.0, 4.5), 0x3a4260, -33.4, 0.5, -3);
  for (const sz of [-4.6, -3, -1.4]) {
    prop(scene, box(0.12, 0.8, 1.2), 0x88ccff, -33.1, 1.7, sz, { emissive: 0x2266aa, ei: 1.5 });
  }

  // weapons: console + chair
  prop(scene, box(2.6, 1.0, 1.2), 0x5a5470, 28, 0.5, -28.6);
  prop(scene, box(2.0, 0.6, 0.12), 0x88ccff, 28, 1.3, -28.2, { emissive: 0x2266aa, ei: 1.4, rx: -0.4 });
  prop(scene, cyl(0.5, 0.6, 0.9, 10), 0x8a4a5a, 28, 0.45, -26.4);

  // navigation: console + chair
  prop(scene, box(1.2, 1.0, 3.2), 0x5a6a95, 45.2, 0.5, -7);
  prop(scene, box(0.15, 0.7, 2.4), 0x88ccff, 44.7, 1.4, -7, { emissive: 0x3a86dd, ei: 1.4 });
  prop(scene, cyl(0.5, 0.6, 0.9, 10), 0x8a5a4a, 43.5, 0.45, -7);

  // o2: plants + tank
  for (const [px, pz] of [[19.5, -12.5], [24.5, -7.5]]) {
    prop(scene, cyl(0.5, 0.65, 0.6, 10), 0x7a5a3a, px, 0.3, pz);
    prop(scene, cone(0.9, 1.5, 8), 0x2f9e44, px, 1.35, pz);
  }
  prop(scene, cyl(0.8, 0.8, 2.0, 12), 0xb8c8d8, 24.5, 1.0, -12.5);

  // comms: console + dish
  prop(scene, box(2.0, 1.1, 1.4), 0x5a6a95, 18, 0.55, 26.5);
  prop(scene, cyl(0.1, 0.1, 1.4, 8), 0x8593ab, 18, 1.8, 26.5);
  prop(scene, cone(1.1, 0.7, 12), 0xd0d8e8, 18, 2.7, 26.5, { rx: Math.PI });

  // shields: twin consoles
  for (const sx of [26, 32]) {
    prop(scene, box(1.6, 1.2, 0.8), 0x6a5a3a, sx, 0.6, 20.8);
    prop(scene, box(1.2, 0.35, 0.12), 0xffd23e, sx, 1.35, 20.5, { emissive: 0xaa7d10, ei: 1.3, rx: -0.4 });
  }
}

// ---------- room mood lights ----------
function addRoomLights(scene) {
  const lights = [
    [3, -20, 0xfff0d0, 22, 0.9],     // cafeteria
    [-41, 0, 0xbb66ff, 18, 1.3],     // reactor
    [-18, 14, 0xffcc55, 16, 1.0],    // electrical
    [-17, -12, 0x55ffd5, 14, 0.9],   // medbay
    [42, -4, 0x6699ff, 14, 0.8],     // navigation
    [-40, -23, 0xff8844, 14, 0.9],   // upper engine
    [-40, 19, 0xff8844, 14, 0.9],    // lower engine
  ];
  for (const [x, z, color, dist, intensity] of lights) {
    const light = new THREE.PointLight(color, intensity, dist, 1.6);
    light.position.set(x, 4.5, z);
    scene.add(light);
  }
}

// ---------- starfield ----------
function addStarfield(scene) {
  const COUNT = 900;
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const radius = 130 + Math.random() * 140;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xbfd0ff, size: 1.3, sizeAttenuation: true });
  mat.fog = false;
  scene.add(new THREE.Points(geo, mat));
}
