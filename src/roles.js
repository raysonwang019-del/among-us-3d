import * as THREE from 'three';
import { ROOMS, VENTS, roomNameAt } from './world.js?v=7';

// ---------- role definitions ----------
export const CREW_ROLES = ['Engineer', 'Scientist', 'Noisemaker', 'Tracker', 'Detective', 'Guardian Angel'];
export const IMPOSTOR_ROLES = ['Shapeshifter', 'Phantom', 'Viper'];

const ROLE_HINTS = {
  Engineer: 'Press F near a vent to travel between vents.',
  Scientist: 'Press V to check live vitals of the whole crew.',
  Noisemaker: 'If you are killed, your alarm gives you one accusation from the grave.',
  Tracker: 'Press T near a crewmate to track them on your minimap.',
  Detective: 'You can see the red footprints the Impostor leaves behind.',
  'Guardian Angel': 'Press G to shield a nearby crewmate from the Impostor.',
  Shapeshifter: 'Press F to disguise as a crewmate. Witnessed kills get blamed on your disguise.',
  Phantom: 'Press F to turn invisible. Kills while invisible are never witnessed.',
  Viper: 'Your Q poisons instead of kills. Victims die later, with no witnesses.',
};

const VENT_COOLDOWN = 12;
const VENT_RANGE = 2.2;
const TRACK_RANGE = 3.0;
const SHIELD_DURATION = 12;
const SHIELD_COOLDOWN = 20;
const SHIELD_CAST_RANGE = 8;
const SHIFT_DURATION = 8;
const SHIFT_COOLDOWN = 18;
const INVIS_DURATION = 6;
const INVIS_COOLDOWN = 15;
const POISON_DELAY = 5;
const VIPER_COOLDOWN = 12;
const FOOTPRINT_INTERVAL = 0.5;
const FOOTPRINT_LIFE = 10;

// ---------- module state ----------
let G = null;
let playerRole = '';
const npcRoles = new Map();
let abilityCd = 0;
let tracked = null;
let vitalsVisible = false;
let disguise = null;      // { npc, timer }
let invisTimer = 0;
let shield = null;        // { npc, timer, mesh }
const poisoned = [];      // { npc, timer }
const footprints = [];    // { mesh, life }
const alarmRings = [];    // { mesh, life }
let footprintClock = 0;
let prevKeys = {};
let minimapCtx = null;

export function playerRoleName() { return playerRole; }
export function npcRoleName(npc) { return npcRoles.get(npc) || 'Crewmate'; }
export function isProtected(npc) { return shield !== null && shield.npc === npc; }
export function shouldWitness() { return invisTimer <= 0; }
export function frameTarget() { return disguise && disguise.npc.alive ? disguise.npc : null; }
export function killPromptVerb() { return playerRole === 'Viper' ? 'poison' : 'eliminate'; }

// ---------- setup ----------
export function setup(ctx) {
  G = ctx;
  const validRoles = G.playerIsImpostor ? IMPOSTOR_ROLES : CREW_ROLES;
  const forced = new URLSearchParams(location.search).get('prole');
  playerRole = validRoles.includes(forced)
    ? forced
    : validRoles[Math.floor(Math.random() * validRoles.length)];

  const pool = [...CREW_ROLES].sort(() => Math.random() - 0.5);
  G.npcs.forEach((npc, i) => npcRoles.set(npc, pool[i % pool.length]));

  const roleTag = document.getElementById('role-tag');
  roleTag.textContent = playerRole;
  roleTag.style.color = G.playerIsImpostor ? '#ff5c5c' : '#7fe0a0';
  document.getElementById('role-hint').textContent = ROLE_HINTS[playerRole];

  const abilityLi = document.createElement('li');
  abilityLi.id = 'ability-cd';
  abilityLi.style.color = 'var(--accent)';
  document.getElementById('task-list').appendChild(abilityLi);

  if (playerRole === 'Tracker') document.getElementById('minimap').style.display = 'block';
  minimapCtx = document.getElementById('minimap').getContext('2d');

  buildVitalsRows();
}

function buildVitalsRows() {
  const list = document.getElementById('vitals-list');
  list.innerHTML = '';
  for (const npc of G.npcs) {
    const row = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'vitals-dot';
    dot.style.background = `#${npc.color.toString(16).padStart(6, '0')}`;
    const label = document.createElement('span');
    label.textContent = npc.name;
    const status = document.createElement('b');
    status.dataset.npc = npc.name;
    row.append(dot, label, status);
    list.appendChild(row);
  }
}

// ---------- death / kill hooks ----------
export function onNpcDeath(npc, cause) {
  if (tracked === npc) tracked = null;
  if (shield && shield.npc === npc) removeShield();
  if (cause === 'killed' && npcRoles.get(npc) === 'Noisemaker') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.9, 32),
      new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(npc.pos.x, 0.1, npc.pos.z);
    G.scene.add(ring);
    alarmRings.push({ mesh: ring, life: 2.5 });
    G.toast(`ALARM! ${npc.name}'s noisemaker went off in ${roomNameAt(npc.pos.x, npc.pos.z)}!`, 5000);
  }
}

// Noisemaker: death becomes one final accusation instead of instant defeat
export function beforePlayerDeath() {
  if (playerRole !== 'Noisemaker') return false;
  G.player.alive = false;
  G.spawnBody({ color: G.playerColor, pos: G.player.pos, name: 'You' });
  G.scene.remove(G.player.mesh);
  G.toast('Your noisemaker alerted the crew!', 5000);
  G.openGraveMeeting();
  return true;
}

// Viper: replace the instant kill with delayed poison. Returns cooldown if handled.
export function playerTryKill(victim) {
  if (playerRole !== 'Viper') return 0;
  if (victim.poisonedFlag) return VIPER_COOLDOWN;
  victim.poisonedFlag = true;
  victim.mesh.userData.mat.color.lerp(new THREE.Color(0x39d353), 0.55);
  poisoned.push({ npc: victim, timer: POISON_DELAY });
  G.toast(`${victim.name} has been poisoned…`);
  return VIPER_COOLDOWN;
}

// ---------- ability activation ----------
function pressed(code) { return G.keys[code] && !prevKeys[code]; }

function useEngineerVent() {
  let nearIdx = -1;
  for (let i = 0; i < VENTS.length; i++) {
    if (Math.hypot(VENTS[i][0] - G.player.pos.x, VENTS[i][1] - G.player.pos.z) < VENT_RANGE) { nearIdx = i; break; }
  }
  if (nearIdx === -1) return;
  const next = VENTS[(nearIdx + 1) % VENTS.length];
  G.player.pos.set(next[0], 0, next[1]);
  abilityCd = VENT_COOLDOWN;
  G.toast(`Vented to ${roomNameAt(next[0], next[1])}.`);
}

function useTracker() {
  let best = null;
  let bestDist = TRACK_RANGE;
  for (const npc of G.npcs) {
    if (!npc.alive) continue;
    const d = npc.pos.distanceTo(G.player.pos);
    if (d < bestDist) { best = npc; bestDist = d; }
  }
  if (!best) return;
  tracked = best;
  G.toast(`Tracker placed on ${best.name}.`);
}

function useGuardianShield() {
  if (shield) return;
  let best = null;
  let bestDist = SHIELD_CAST_RANGE;
  for (const npc of G.npcs) {
    if (!npc.alive || npc.isImpostor) continue;
    const d = npc.pos.distanceTo(G.player.pos);
    if (d < bestDist) { best = npc; bestDist = d; }
  }
  if (!best) return;
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.22 })
  );
  bubble.position.y = 0.95;
  best.mesh.add(bubble);
  shield = { npc: best, timer: SHIELD_DURATION, mesh: bubble };
  abilityCd = SHIELD_COOLDOWN;
  G.toast(`Shield cast on ${best.name}.`);
}

function removeShield() {
  if (!shield) return;
  shield.npc.mesh.remove(shield.mesh);
  shield = null;
}

function useShapeshift() {
  const alive = G.npcs.filter((n) => n.alive && !n.isImpostor);
  if (alive.length === 0) return;
  const target = alive[Math.floor(Math.random() * alive.length)];
  disguise = { npc: target, timer: SHIFT_DURATION };
  G.player.mesh.userData.mat.color.set(target.color);
  abilityCd = SHIFT_COOLDOWN;
  G.toast(`Shapeshifted into ${target.name}.`);
}

function endShapeshift() {
  disguise = null;
  G.player.mesh.userData.mat.color.set(G.playerColor);
}

function usePhantom() {
  invisTimer = INVIS_DURATION;
  G.player.mesh.traverse((o) => {
    if (o.isMesh) { o.material.transparent = true; o.material.opacity = 0.2; }
  });
  abilityCd = INVIS_COOLDOWN;
  G.toast('You vanish into the shadows…');
}

function endPhantom() {
  G.player.mesh.traverse((o) => {
    if (o.isMesh) { o.material.transparent = false; o.material.opacity = 1; }
  });
}

// ---------- per-frame update ----------
export function update(dt) {
  abilityCd = Math.max(0, abilityCd - dt);

  if (G.getState() === 'playing' && G.player.alive) {
    if (playerRole === 'Engineer' && pressed('KeyF') && abilityCd <= 0) useEngineerVent();
    if (playerRole === 'Scientist' && pressed('KeyV')) {
      vitalsVisible = !vitalsVisible;
      document.getElementById('vitals-panel').style.display = vitalsVisible ? 'block' : 'none';
    }
    if (playerRole === 'Tracker' && pressed('KeyT')) useTracker();
    if (playerRole === 'Guardian Angel' && pressed('KeyG') && abilityCd <= 0) useGuardianShield();
    if (playerRole === 'Shapeshifter' && pressed('KeyF') && abilityCd <= 0 && !disguise) useShapeshift();
    if (playerRole === 'Phantom' && pressed('KeyF') && abilityCd <= 0 && invisTimer <= 0) usePhantom();
  }
  prevKeys = { ...G.keys };

  if (disguise) {
    disguise.timer -= dt;
    if (disguise.timer <= 0) endShapeshift();
  }
  if (invisTimer > 0) {
    invisTimer -= dt;
    if (invisTimer <= 0) endPhantom();
  }
  if (shield) {
    shield.timer -= dt;
    shield.mesh.material.opacity = 0.1 + Math.abs(Math.sin(shield.timer * 3)) * 0.15;
    if (shield.timer <= 0) removeShield();
  }

  for (let i = poisoned.length - 1; i >= 0; i--) {
    const p = poisoned[i];
    p.timer -= dt;
    if (p.timer <= 0) {
      poisoned.splice(i, 1);
      if (!p.npc.alive) continue;
      p.npc.alive = false;
      G.scene.remove(p.npc.mesh);
      G.spawnBody(p.npc);
      onNpcDeath(p.npc, 'killed');
      G.toast(`${p.npc.name} succumbed to the venom. No witnesses.`);
      G.checkImpostorWin();
    }
  }

  updateFootprints(dt);
  updateAlarmRings(dt);
  updateVitals();
  updateAbilityHud();
  if (playerRole === 'Tracker') drawMinimap();
}

function updateFootprints(dt) {
  if (playerRole === 'Detective') {
    footprintClock -= dt;
    if (footprintClock <= 0) {
      footprintClock = FOOTPRINT_INTERVAL;
      for (const impostor of G.npcs) {
        if (!impostor.isImpostor || !impostor.alive) continue;
        const print = new THREE.Mesh(
          new THREE.CircleGeometry(0.16, 10),
          new THREE.MeshBasicMaterial({ color: 0xcc2222, transparent: true, opacity: 0.85 })
        );
        print.rotation.x = -Math.PI / 2;
        print.position.set(impostor.pos.x, 0.06, impostor.pos.z);
        G.scene.add(print);
        footprints.push({ mesh: print, life: FOOTPRINT_LIFE });
      }
    }
  }
  for (let i = footprints.length - 1; i >= 0; i--) {
    const f = footprints[i];
    f.life -= dt;
    f.mesh.material.opacity = Math.min(0.85, f.life / FOOTPRINT_LIFE);
    if (f.life <= 0) {
      G.scene.remove(f.mesh);
      footprints.splice(i, 1);
    }
  }
}

function updateAlarmRings(dt) {
  for (let i = alarmRings.length - 1; i >= 0; i--) {
    const r = alarmRings[i];
    r.life -= dt;
    const s = 1 + (2.5 - r.life) * 4;
    r.mesh.scale.set(s, s, 1);
    r.mesh.material.opacity = Math.max(0, r.life / 2.5);
    if (r.life <= 0) {
      G.scene.remove(r.mesh);
      alarmRings.splice(i, 1);
    }
  }
}

function updateVitals() {
  if (!vitalsVisible) return;
  for (const el of document.querySelectorAll('#vitals-list b')) {
    const npc = G.npcs.find((n) => n.name === el.dataset.npc);
    const dead = !npc.alive;
    el.textContent = dead ? 'DEAD' : 'ALIVE';
    el.style.color = dead ? '#ff5c5c' : '#7fe0a0';
  }
}

function updateAbilityHud() {
  const el = document.getElementById('ability-cd');
  if (!el) return;
  const cd = Math.ceil(abilityCd);
  switch (playerRole) {
    case 'Engineer': el.textContent = abilityCd > 0 ? `Vent in ${cd}s` : 'Vent ready (F near vent)'; break;
    case 'Scientist': el.textContent = 'Vitals scanner (V)'; break;
    case 'Noisemaker': el.textContent = 'Alarm armed (passive)'; break;
    case 'Tracker': el.textContent = tracked ? `Tracking ${tracked.name}` : 'Tag a crewmate (T)'; break;
    case 'Detective': el.textContent = 'Follow the red footprints'; break;
    case 'Guardian Angel': el.textContent = shield ? `Shield on ${shield.npc.name}` : abilityCd > 0 ? `Shield in ${cd}s` : 'Shield ready (G)'; break;
    case 'Shapeshifter': el.textContent = disguise ? `Disguised as ${disguise.npc.name} (${Math.ceil(disguise.timer)}s)` : abilityCd > 0 ? `Shift in ${cd}s` : 'Shift ready (F)'; break;
    case 'Phantom': el.textContent = invisTimer > 0 ? `Invisible ${Math.ceil(invisTimer)}s` : abilityCd > 0 ? `Vanish in ${cd}s` : 'Vanish ready (F)'; break;
    case 'Viper': el.textContent = 'Venom loaded (Q)'; break;
  }
}

// ---------- minimap ----------
function drawMinimap() {
  const c = minimapCtx;
  const size = 170;
  const scale = size / 96;
  const toPx = (x, z) => [(x + 48) * scale, (z + 48) * scale];
  c.clearRect(0, 0, size, size);
  c.fillStyle = 'rgba(30, 36, 62, 0.9)';
  for (const [x1, z1, x2, z2] of ROOMS) {
    const [px, pz] = toPx(x1, z1);
    c.fillRect(px, pz, (x2 - x1) * scale, (z2 - z1) * scale);
  }
  const [ppx, ppz] = toPx(G.player.pos.x, G.player.pos.z);
  c.fillStyle = '#38fedc';
  c.beginPath();
  c.arc(ppx, ppz, 4, 0, Math.PI * 2);
  c.fill();
  if (tracked && tracked.alive) {
    const [tx, tz] = toPx(tracked.pos.x, tracked.pos.z);
    c.fillStyle = `#${tracked.color.toString(16).padStart(6, '0')}`;
    c.beginPath();
    c.arc(tx, tz, 4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fff';
    c.stroke();
  }
}
