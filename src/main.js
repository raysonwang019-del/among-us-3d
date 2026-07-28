import * as THREE from 'three';
import { ROOMS, TASKS, EMERGENCY_POS, buildWorld, makeCrewmate, tryMove, roomNameAt } from './world.js?v=7';
import * as Roles from './roles.js?v=7';

// ---------- constants ----------
const PLAYER_SPEED = 7.5;
const NPC_SPEED = 3.4;
const IMPOSTOR_SPEED = 4.2;
const PLAYER_RADIUS = 0.55;
const TASK_RANGE = 2.4;
const TASK_HOLD_SECONDS = 2.5;
const REPORT_RANGE = 3.2;
const KILL_RANGE = 1.5;
const KILL_COOLDOWN = 11;
const IMPOSTOR_HUNT_RANGE = 9;
const PLAYER_KILL_RANGE = 2.0;
const PLAYER_KILL_COOLDOWN = 8;
const WITNESS_RANGE = 8;
const ALERT_SPEED = 4.8;
const PLAYER_COLOR = 0x38fedc;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 15;

const ALL_CREW_DEFS = [
  { name: 'Red', color: 0xc51111 },
  { name: 'Blue', color: 0x132ed1 },
  { name: 'Green', color: 0x117f2d },
  { name: 'Orange', color: 0xef7d0d },
  { name: 'Pink', color: 0xed54ba },
  { name: 'Purple', color: 0x6b2fbb },
  { name: 'Yellow', color: 0xf5f557 },
  { name: 'Black', color: 0x3f474e },
  { name: 'White', color: 0xd6e0f0 },
  { name: 'Brown', color: 0x71491e },
  { name: 'Lime', color: 0x50ef39 },
  { name: 'Maroon', color: 0x6b2b3c },
  { name: 'Rose', color: 0xecc0d3 },
  { name: 'Banana', color: 0xf0e796 },
];

// ---------- renderer / scene ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060e);
scene.fog = new THREE.Fog(0x05060e, 45, 95);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.HemisphereLight(0x9db4ff, 0x2a2438, 0.75));
const sun = new THREE.DirectionalLight(0xfff2df, 1.4);
sun.position.set(18, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
scene.add(sun);

buildWorld(scene);

// ---------- lobby / mode ----------
const params = new URLSearchParams(location.search);
const inLobby = !params.has('players');
const totalPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, parseInt(params.get('players'), 10) || 7));
const CREW_DEFS = ALL_CREW_DEFS.slice(0, totalPlayers - 1);

const roleParam = params.get('role');
const playerIsImpostor = roleParam === 'impostor' ? true
  : roleParam === 'crew' ? false
  : Math.random() < 0.4;

// ---------- entities ----------
const player = {
  mesh: makeCrewmate(PLAYER_COLOR),
  pos: new THREE.Vector3(3, 0, -14),
  alive: true,
  walkPhase: 0,
};
scene.add(player.mesh);

// impostor count scales with lobby size (player counts as one when impostor)
const IMPOSTOR_COUNT = totalPlayers <= 6 ? 1 : totalPlayers <= 10 ? 2 : 3;
const npcImpostorCount = playerIsImpostor ? IMPOSTOR_COUNT - 1 : IMPOSTOR_COUNT;
const impostorSet = new Set(
  CREW_DEFS.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, npcImpostorCount)
);
const npcs = CREW_DEFS.map((def, i) => {
  const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
  const npc = {
    name: def.name,
    color: def.color,
    isImpostor: impostorSet.has(i),
    killCd: 6 + Math.random() * 6, // staggered grace so kills don't sync

    mesh: makeCrewmate(def.color),
    pos: new THREE.Vector3(
      THREE.MathUtils.lerp(room[0] + 1, room[2] - 1, Math.random()),
      0,
      THREE.MathUtils.lerp(room[1] + 1, room[3] - 1, Math.random())
    ),
    target: null,
    waitTimer: Math.random() * 2,
    alive: true,
    alerted: false,
    frameTarget: null,
    walkPhase: Math.random() * 6,
  };
  const alertMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
  const alertMark = new THREE.Group();
  const alertBar = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 8), alertMat);
  alertBar.rotation.x = Math.PI;
  alertBar.position.y = 0.35;
  const alertDot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), alertMat);
  alertMark.add(alertBar, alertDot);
  alertMark.position.y = 2.3;
  alertMark.visible = false;
  npc.mesh.add(alertMark);
  npc.alertMark = alertMark;
  scene.add(npc.mesh);
  return npc;
});

const bodies = []; // { mesh, pos, name }

function randomPointInRooms() {
  const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
  return new THREE.Vector3(
    THREE.MathUtils.lerp(room[0] + 1, room[2] - 1, Math.random()),
    0,
    THREE.MathUtils.lerp(room[1] + 1, room[3] - 1, Math.random())
  );
}

function spawnBody(who) {
  const group = new THREE.Group();
  const corpse = makeCrewmate(who.color);
  corpse.rotation.x = -Math.PI / 2;
  corpse.rotation.z = Math.random() * Math.PI * 2;
  corpse.position.y = 0.35;
  corpse.traverse((o) => {
    if (o.isMesh && !o.material.side) {
      o.material = o.material.clone();
      o.material.color.multiplyScalar(0.55);
    }
  });
  group.add(corpse);

  // classic bone sticking out
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8e8dc, roughness: 0.5 });
  const bone = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), boneMat);
  stick.position.y = 0.25;
  bone.add(stick);
  for (const [bx, bz] of [[-0.09, 0], [0.09, 0]]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), boneMat);
    knob.position.set(bx, 0.52, bz);
    bone.add(knob);
  }
  bone.position.set(0.25, 0.55, 0.1);
  bone.rotation.z = -0.4;
  group.add(bone);

  // dark pool under the body
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 18),
    new THREE.MeshBasicMaterial({ color: 0x4a0f14, transparent: true, opacity: 0.55 })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.04;
  pool.scale.set(1.25, 0.85, 1);
  group.add(pool);

  group.position.copy(who.pos);
  scene.add(group);
  bodies.push({ mesh: group, pos: who.pos.clone(), name: who.name });
}

// ---------- task pads ----------
const taskPads = TASKS.map((t, i) => {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.15, 0.22, 24),
    new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xaa7d10, roughness: 0.4 })
  );
  pad.position.set(t.x, 0.11, t.z);
  scene.add(pad);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 1.55, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(t.x, 0.05, t.z);
  scene.add(halo);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 1.0, 3.2, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  beam.position.set(t.x, 1.7, t.z);
  scene.add(beam);
  return { ...t, index: i, pad, halo, beam, done: false, progress: 0 };
});

// ---------- UI ----------
const taskBarEl = document.getElementById('task-bar');
const taskListEl = document.getElementById('task-list');
const promptEl = document.getElementById('prompt');
const ringEl = document.getElementById('progress-ring');
const arcEl = document.getElementById('progress-arc');
const toastEl = document.getElementById('toast');
const meetingOverlay = document.getElementById('meeting-overlay');
const suspectGrid = document.getElementById('suspect-grid');
const endOverlay = document.getElementById('end-overlay');
const endTitle = document.getElementById('end-title');
const endMessage = document.getElementById('end-message');

if (!playerIsImpostor) {
  for (const t of taskPads) {
    const li = document.createElement('li');
    li.textContent = t.label;
    li.id = `task-li-${t.index}`;
    taskListEl.appendChild(li);
  }
}

function updateTaskUI() {
  const done = taskPads.filter((t) => t.done).length;
  taskBarEl.style.width = `${(done / taskPads.length) * 100}%`;
  for (const t of taskPads) {
    const li = document.getElementById(`task-li-${t.index}`);
    if (li) li.classList.toggle('done', t.done);
  }
}

let toastTimer = null;
function toast(msg, ms = 3000) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ---------- game state ----------
let gameState = inLobby ? 'lobby' : 'playing'; // lobby | playing | meeting | over
let graveMode = false;

function endGame(won, title, message) {
  gameState = 'over';
  endTitle.textContent = title;
  endTitle.className = won ? 'victory' : 'defeat';
  endMessage.textContent = message;
  meetingOverlay.style.display = 'none';
  endOverlay.style.display = 'flex';
}

document.getElementById('restart-btn').addEventListener('click', () => {
  location.href = location.pathname; // fresh random role
});

function populateSuspects() {
  suspectGrid.innerHTML = '';
  for (const npc of npcs) {
    if (!npc.alive) continue;
    const btn = document.createElement('button');
    btn.className = 'suspect-btn';
    const swatch = document.createElement('div');
    swatch.className = 'suspect-swatch';
    swatch.style.background = `#${npc.color.toString(16).padStart(6, '0')}`;
    const label = document.createElement('span');
    label.textContent = npc.name;
    const role = document.createElement('small');
    role.textContent = Roles.npcRoleName(npc);
    btn.append(swatch, label, role);
    btn.addEventListener('click', () => castVote(npc));
    suspectGrid.appendChild(btn);
  }
}

function openMeeting() {
  gameState = 'meeting';
  graveMode = false;
  document.getElementById('meeting-title').textContent = 'BODY REPORTED';
  document.getElementById('meeting-sub').textContent =
    'Emergency meeting. Who is the impostor? Choose carefully — eject wrong and an innocent dies.';
  populateSuspects();
  meetingOverlay.style.display = 'flex';
}

function openGraveMeeting() {
  gameState = 'meeting';
  graveMode = true;
  document.getElementById('meeting-title').textContent = 'FINAL ALARM';
  document.getElementById('meeting-sub').textContent =
    'Your noisemaker screams as you fall. One accusation from beyond the grave — name the Impostor.';
  populateSuspects();
  meetingOverlay.style.display = 'flex';
}

function closeMeeting() {
  meetingOverlay.style.display = 'none';
  for (const b of bodies) scene.remove(b.mesh);
  bodies.length = 0;
  for (const npc of npcs) {
    if (npc.isImpostor) npc.killCd = KILL_COOLDOWN;
  }
  gameState = 'playing';
}

function castVote(npc) {
  if (graveMode) {
    if (npc.isImpostor) {
      endGame(true, 'VICTORY', `Your dying alarm exposed ${npc.name}. The crew ejects them!`);
    } else {
      endGame(false, 'DEFEAT', `The crew ejected ${npc.name} — the real Impostor escaped.`);
    }
    return;
  }
  npc.alive = false;
  scene.remove(npc.mesh);
  Roles.onNpcDeath(npc, 'ejected');
  if (npc.isImpostor) {
    const remaining = npcs.filter((n) => n.alive && n.isImpostor).length;
    if (remaining === 0) {
      endGame(true, 'VICTORY', `${npc.name} was the last Impostor. The crew is safe!`);
      return;
    }
    toast(`${npc.name} was An Impostor! ${remaining} remain${remaining > 1 ? '' : 's'}…`, 5000);
    closeMeeting();
    return;
  }
  toast(`${npc.name} was not An Impostor…`, 4000);
  closeMeeting();
  checkCrewWipe();
}

document.getElementById('skip-vote').addEventListener('click', () => {
  if (graveMode) {
    endGame(false, 'DEFEAT', 'No accusation was made. The Impostor finished the job.');
    return;
  }
  toast('No one was ejected.', 2500);
  closeMeeting();
});

function checkCrewWipe() {
  const aliveCrew = npcs.filter((n) => n.alive && !n.isImpostor).length;
  if (aliveCrew === 0 && gameState === 'playing') {
    endGame(false, 'DEFEAT', 'The Impostor eliminated the whole crew.');
  }
}

function checkImpostorWin() {
  if (gameState !== 'playing') return;
  if (npcs.every((n) => !n.alive || n.isImpostor)) {
    endGame(true, 'IMPOSTOR VICTORY', 'The whole crew is gone. The ship is yours.');
  }
}

// ---------- input ----------
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------- animation helpers ----------
function animateWalk(entity, moving, dt) {
  const legs = entity.mesh.userData.legs;
  if (moving) {
    entity.walkPhase += dt * 11;
    const swing = Math.sin(entity.walkPhase) * 0.32;
    legs[0].position.z = swing;
    legs[1].position.z = -swing;
    entity.mesh.position.y = Math.abs(Math.sin(entity.walkPhase)) * 0.09;
  } else {
    legs[0].position.z = 0;
    legs[1].position.z = 0;
    entity.mesh.position.y = 0;
  }
}

function faceToward(mesh, dx, dz, dt) {
  if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
  const target = Math.atan2(dx, dz);
  let diff = target - mesh.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  mesh.rotation.y += diff * Math.min(1, dt * 12);
}

// ---------- witnesses ----------
function alertWitnesses(frame) {
  let count = 0;
  for (const other of npcs) {
    if (!other.alive || other.alerted) continue;
    if (other.pos.distanceTo(player.pos) < WITNESS_RANGE) {
      other.alerted = true;
      other.frameTarget = frame;
      other.alertMark.visible = true;
      count++;
    }
  }
  return count;
}

// ---------- NPC logic ----------
function updateNpc(npc, dt) {
  if (!npc.alive) return;

  if (npc.alerted) {
    const dx = EMERGENCY_POS.x - npc.pos.x;
    const dz = EMERGENCY_POS.z - npc.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.6) {
      const framed = npc.frameTarget;
      if (framed && framed.alive) {
        framed.alive = false;
        scene.remove(framed.mesh);
        Roles.onNpcDeath(framed, 'ejected');
        for (const w of npcs) {
          w.alerted = false;
          w.frameTarget = null;
          w.alertMark.visible = false;
        }
        toast(`The crew ejected ${framed.name}! Your disguise fooled them.`, 5000);
        checkImpostorWin();
      } else {
        endGame(false, 'EJECTED', `${npc.name} reached the emergency button. The crew voted you out.`);
      }
      return;
    }
    const step = ALERT_SPEED * dt;
    tryMove(npc.pos, (dx / dist) * step, (dz / dist) * step, 0.5);
    faceToward(npc.mesh, dx, dz, dt);
    animateWalk(npc, true, dt);
    npc.mesh.position.x = npc.pos.x;
    npc.mesh.position.z = npc.pos.z;
    return;
  }

  let speed = NPC_SPEED;
  let target = npc.target;

  if (npc.isImpostor) npc.killCd -= dt;

  if (npc.isImpostor && npc.killCd <= 0) {
    let best = null;
    let bestDist = IMPOSTOR_HUNT_RANGE;
    for (const other of npcs) {
      if (other === npc || !other.alive || other.isImpostor || Roles.isProtected(other)) continue;
      const d = other.pos.distanceTo(npc.pos);
      if (d < bestDist) { best = other; bestDist = d; }
    }
    // NPC impostors never hunt the player when the player is a fellow impostor
    const pd = player.alive && !playerIsImpostor ? player.pos.distanceTo(npc.pos) : Infinity;
    if (pd < bestDist) { best = player; bestDist = pd; }

    if (best) {
      target = best.pos;
      speed = IMPOSTOR_SPEED;
      if (bestDist < KILL_RANGE) {
        if (best === player) {
          if (Roles.beforePlayerDeath()) { npc.killCd = KILL_COOLDOWN; return; }
          player.alive = false;
          endGame(false, 'DEFEAT', 'You were eliminated by An Impostor.');
          return;
        }
        best.alive = false;
        scene.remove(best.mesh);
        spawnBody(best);
        Roles.onNpcDeath(best, 'killed');
        npc.killCd = KILL_COOLDOWN;
        checkCrewWipe();
        return;
      }
    }
  }

  if (!target) {
    npc.waitTimer -= dt;
    if (npc.waitTimer <= 0) npc.target = randomPointInRooms();
    animateWalk(npc, false, dt);
    npc.mesh.position.x = npc.pos.x;
    npc.mesh.position.z = npc.pos.z;
    return;
  }

  const dx = target.x - npc.pos.x;
  const dz = target.z - npc.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4 && target === npc.target) {
    npc.target = null;
    npc.waitTimer = 1 + Math.random() * 3;
    animateWalk(npc, false, dt);
    return;
  }

  const step = Math.min(speed * dt, dist);
  const beforeX = npc.pos.x;
  const beforeZ = npc.pos.z;
  tryMove(npc.pos, (dx / dist) * step, (dz / dist) * step, 0.5);
  const moved = Math.hypot(npc.pos.x - beforeX, npc.pos.z - beforeZ) > 1e-4;
  if (!moved && target === npc.target) {
    npc.target = randomPointInRooms();
  }

  faceToward(npc.mesh, dx, dz, dt);
  animateWalk(npc, moved, dt);
  npc.mesh.position.x = npc.pos.x;
  npc.mesh.position.z = npc.pos.z;
}

// ---------- player ----------
let activeTask = null;

function updatePlayer(dt) {
  if (!player.alive) return;

  let mx = 0;
  let mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1;
  if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;

  const moving = (mx !== 0 || mz !== 0) && !activeTask;
  if (moving) {
    const len = Math.hypot(mx, mz);
    tryMove(player.pos, (mx / len) * PLAYER_SPEED * dt, (mz / len) * PLAYER_SPEED * dt, PLAYER_RADIUS);
    faceToward(player.mesh, mx, mz, dt);
  }
  animateWalk(player, moving, dt);
  player.mesh.position.x = player.pos.x;
  player.mesh.position.z = player.pos.z;

  if (playerIsImpostor) {
    updateImpostorActions(dt);
    return;
  }

  let nearTask = null;
  for (const t of taskPads) {
    if (t.done) continue;
    if (Math.hypot(t.x - player.pos.x, t.z - player.pos.z) < TASK_RANGE) { nearTask = t; break; }
  }

  let nearBody = null;
  for (const b of bodies) {
    if (b.pos.distanceTo(player.pos) < REPORT_RANGE) { nearBody = b; break; }
  }

  if (nearTask && keys.KeyE) {
    activeTask = nearTask;
    nearTask.progress += dt / TASK_HOLD_SECONDS;
    if (nearTask.progress >= 1) {
      nearTask.done = true;
      nearTask.pad.material.color.set(0x37d67a);
      nearTask.pad.material.emissive.set(0x0f5c30);
      nearTask.halo.material.color.set(0x37d67a);
      nearTask.beam.material.color.set(0x37d67a);
      nearTask.beam.material.opacity = 0.05;
      activeTask = null;
      updateTaskUI();
      toast(`Task complete: ${nearTask.label}`);
      if (taskPads.every((t) => t.done)) {
        endGame(true, 'VICTORY', 'All tasks completed. The crew wins!');
      }
    }
  } else {
    if (activeTask) activeTask.progress = 0;
    activeTask = null;
  }

  if (nearBody && keys.KeyR) {
    openMeeting();
    return;
  }

  if (activeTask) {
    ringEl.style.display = 'block';
    arcEl.style.strokeDashoffset = `${188.5 * (1 - activeTask.progress)}`;
    promptEl.style.display = 'none';
  } else {
    ringEl.style.display = 'none';
    if (nearBody) {
      promptEl.textContent = `Press R — report ${nearBody.name}'s body`;
      promptEl.className = 'prompt danger';
      promptEl.style.display = 'block';
    } else if (nearTask) {
      promptEl.textContent = `Hold E — ${nearTask.label}`;
      promptEl.className = 'prompt';
      promptEl.style.display = 'block';
    } else {
      promptEl.style.display = 'none';
    }
  }
}

// ---------- impostor mode ----------
let playerKillCd = 6;
let crewProgress = 0;

function updateImpostorActions(dt) {
  playerKillCd -= dt;

  let victim = null;
  let victimDist = PLAYER_KILL_RANGE;
  for (const npc of npcs) {
    if (!npc.alive || npc.isImpostor || npc.poisonedFlag) continue;
    const d = npc.pos.distanceTo(player.pos);
    if (d < victimDist) { victim = npc; victimDist = d; }
  }

  if (victim && playerKillCd <= 0 && keys.KeyQ) {
    const roleCd = Roles.playerTryKill(victim);
    if (roleCd) {
      playerKillCd = roleCd;
      return;
    }
    victim.alive = false;
    scene.remove(victim.mesh);
    spawnBody(victim);
    Roles.onNpcDeath(victim, 'killed');
    playerKillCd = PLAYER_KILL_COOLDOWN;
    if (Roles.shouldWitness()) {
      const count = alertWitnesses(Roles.frameTarget());
      toast(count > 0
        ? `You were seen! ${count} witness${count > 1 ? 'es' : ''} running to report!`
        : `${victim.name} eliminated. No witnesses.`);
    } else {
      toast(`${victim.name} eliminated from the shadows. No witnesses.`);
    }
    checkImpostorWin();
    return;
  }

  const cdEl = document.getElementById('kill-cd');
  if (cdEl) {
    cdEl.textContent = playerKillCd <= 0 ? 'Kill ready' : `Kill in ${Math.ceil(playerKillCd)}s`;
    cdEl.style.color = playerKillCd <= 0 ? '#ff5c5c' : '#8b93ad';
  }

  if (victim && playerKillCd <= 0) {
    promptEl.textContent = `Press Q — ${Roles.killPromptVerb()} ${victim.name}`;
    promptEl.className = 'prompt danger';
    promptEl.style.display = 'block';
  } else {
    promptEl.style.display = 'none';
  }
}

// ---------- lobby ----------
function setupLobby() {
  const grid = document.getElementById('lobby-grid');
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const btn = document.createElement('button');
    btn.className = 'lobby-btn';
    btn.textContent = n;
    btn.addEventListener('click', () => {
      const p = new URLSearchParams(location.search);
      p.set('players', String(n));
      location.search = `?${p.toString()}`;
    });
    grid.appendChild(btn);
  }
  document.getElementById('lobby-overlay').style.display = 'flex';
  document.getElementById('role-overlay').style.display = 'none';
}

// ---------- mode setup ----------
function setupMode() {
  if (inLobby) {
    setupLobby();
    return;
  }
  const roleTitle = document.getElementById('role-title');
  const roleMessage = document.getElementById('role-message');
  const roleOverlay = document.getElementById('role-overlay');
  if (playerIsImpostor) {
    roleTitle.textContent = 'IMPOSTOR';
    roleTitle.className = 'defeat';
    const mates = npcs.filter((n) => n.isImpostor).map((n) => n.name);
    roleMessage.textContent = 'Eliminate the crew with Q before they finish their tasks. If a witness reaches the emergency button, you are ejected.'
      + (mates.length ? ` Your fellow Impostor${mates.length > 1 ? 's' : ''}: ${mates.join(' & ')}.` : ' You work alone.');
    document.querySelector('.task-panel h2').textContent = 'Crew Task Progress';
    const cd = document.createElement('li');
    cd.id = 'kill-cd';
    cd.textContent = 'Kill ready';
    taskListEl.appendChild(cd);
    document.querySelector('.controls-hint').innerHTML =
      '<b>WASD</b> move &nbsp; <b>Q</b> kill nearby crew<br />silence witnesses before they reach the button';
    for (const t of taskPads) {
      t.pad.material.emissive.set(0x332505);
      t.halo.material.opacity = 0.15;
    }
  } else {
    roleTitle.textContent = 'CREWMATE';
    roleTitle.className = 'victory';
    roleMessage.textContent = IMPOSTOR_COUNT > 1
      ? `Finish all tasks or find and eject all ${IMPOSTOR_COUNT} Impostors. Stay alive.`
      : 'Finish all tasks or find and eject the Impostor. Stay alive.';
    updateTaskUI();
  }
  setTimeout(() => { roleOverlay.style.display = 'none'; }, 3500);
}
setupMode();

Roles.setup({
  scene,
  player,
  npcs,
  bodies,
  keys,
  taskPads,
  toast,
  endGame,
  promptEl,
  spawnBody,
  alertWitnesses,
  checkImpostorWin,
  openGraveMeeting,
  getState: () => gameState,
  playerIsImpostor,
  playerColor: PLAYER_COLOR,
});

// ---------- camera ----------
const camOffset = new THREE.Vector3(0, 15, 11.5);
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  camTarget.copy(player.pos).add(camOffset);
  camera.position.lerp(camTarget, Math.min(1, dt * 5));
  camera.lookAt(player.pos.x, 1, player.pos.z);
}
camera.position.copy(player.pos).add(camOffset);
camera.lookAt(player.pos);

// debug handle for automated testing (harmless in normal play)
window.__amongus = {
  player,
  npcs,
  bodies,
  taskPads,
  keys,
  isImpostor: playerIsImpostor,
  impostorCount: IMPOSTOR_COUNT,
  roles: Roles,
  state: () => gameState,
  forceKillReady: () => { playerKillCd = 0; },
  step: (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt); },
};

// ---------- main loop ----------
const clock = new THREE.Clock();
let elapsed = 0;

function tick() {
  requestAnimationFrame(tick);
  step(Math.min(clock.getDelta(), 0.05));
}

function step(dt) {
  elapsed += dt;

  if (gameState === 'playing') {
    updatePlayer(dt);
    for (const npc of npcs) updateNpc(npc, dt);

    if (playerIsImpostor) {
      // full lobby finishes tasks in ~90s regardless of size; killing crew slows it
      const crewTotal = npcs.filter((n) => !n.isImpostor).length;
      const aliveCrew = npcs.filter((n) => n.alive && !n.isImpostor).length;
      crewProgress += (aliveCrew / crewTotal) * 0.011 * dt;
      taskBarEl.style.width = `${Math.min(crewProgress, 1) * 100}%`;
      if (crewProgress >= 1) {
        endGame(false, 'DEFEAT', 'The crew finished all their tasks before you could stop them.');
      }
    }
  }

  Roles.update(dt);

  for (const t of taskPads) {
    if (t.done) continue;
    const s = 1 + Math.sin(elapsed * 3 + t.index) * 0.08;
    t.halo.scale.set(s, s, 1);
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}
tick();
