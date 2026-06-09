/* ============================================================
   HORDE RUSH — core simulation + renderer (vanilla Canvas).
   Move-only control, auto-fire, hordes, bosses, weapon fusion.
   ============================================================ */
import { getMove, setEnabled as setInputEnabled } from './input.js';
import { WEAPONS, PASSIVES, getStats, getDef } from './weapons.js';
import { CHARACTERS } from './characters.js';
import { SFX } from './audio.js';
import * as Meta from './meta.js';
import * as SDK from './sdk.js';

let cv, ctx, W = 0, H = 0, DPR = 1;
let cb = {};               // ui callbacks
let raf = 0, last = 0;
let running = false;       // simulation active
let started = false;       // a run exists

const state = {
  t: 0, kills: 0, coins: 0, level: 1, xp: 0, xpNext: 5,
  pendingLevels: 0, revivesLeft: 0, ended: false,
  shake: 0, shakeX: 0, shakeY: 0, charId: 'vanguard',
};

let player = null;
let enemies = [], projectiles = [], gems = [], coinsArr = [], particles = [],
    floats = [], hazards = [], arcs = [], orbiters = [], pickups = [];
let boss = null, bossPending = 0, bossIndex = 0, nextBossT = 120;
let spawnAcc = 0;
let cam = { x: 0, y: 0 };
let eid = 1;

/* ---------------- spatial grid (enemy queries) ---------------- */
const CELL = 120;
let grid = new Map();
function gkey(cx, cy) { return cx + ',' + cy; }
function buildGrid() {
  grid.clear();
  for (const e of enemies) {
    const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
    const k = gkey(cx, cy);
    let a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
    a.push(e);
  }
}
function queryNear(x, y, r, fn) {
  const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL);
  const d0 = Math.floor((y - r) / CELL), d1 = Math.floor((y + r) / CELL);
  for (let cx = c0; cx <= c1; cx++)
    for (let cy = d0; cy <= d1; cy++) {
      const a = grid.get(gkey(cx, cy));
      if (a) for (const e of a) fn(e);
    }
}
function nearestEnemy(x, y, maxR = 99999, exclude = null) {
  let best = null, bd = maxR * maxR;
  // expand search rings
  const tryCell = (cx, cy) => {
    const a = grid.get(gkey(cx, cy)); if (!a) return;
    for (const e of a) { if (e === exclude || (exclude && exclude.has && exclude.has(e.id))) continue;
      const dx = e.x - x, dy = e.y - y, d = dx*dx+dy*dy; if (d < bd) { bd = d; best = e; } }
  };
  const pcx = Math.floor(x / CELL), pcy = Math.floor(y / CELL);
  const maxRing = Math.min(20, Math.ceil(maxR / CELL) + 1);
  for (let ring = 0; ring <= maxRing; ring++) {
    if (ring === 0) tryCell(pcx, pcy);
    else {
      for (let i = -ring; i <= ring; i++) { tryCell(pcx+i, pcy-ring); tryCell(pcx+i, pcy+ring); }
      for (let j = -ring+1; j <= ring-1; j++) { tryCell(pcx-ring, pcy+j); tryCell(pcx+ring, pcy+j); }
    }
    if (best && ring > 1) break; // good enough once found + a ring of slack
  }
  // include boss as a target (it is not stored in the enemy grid)
  if (boss && !(exclude && exclude.has && exclude.has(boss.id))) {
    const dx = boss.x - x, dy = boss.y - y, d = dx*dx + dy*dy;
    if (d < bd) best = boss;
  }
  return best;
}

/* ---------------- setup ---------------- */
export function init(canvas, callbacks) {
  cv = canvas; ctx = cv.getContext('2d'); cb = callbacks || {};
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
}
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

/* ---------------- run lifecycle ---------------- */
export function startRun(charId) {
  const ch = CHARACTERS[charId] || CHARACTERS.vanguard;
  state.charId = ch.id;
  const perm = Meta.permBonuses();
  const m = ch.mods || {};

  player = {
    x: 0, y: 0, r: 16, face: { x: 0, y: -1 },
    baseSpeed: 215 * (1 + (m.speed || 0) + (perm.speed || 0)),
    maxHp: Math.round(120 + (m.hp || 0) + (perm.hp || 0)),
    hp: 0, invuln: 0,
    dmgMul: 1 + (m.dmg || 0) + (perm.dmg || 0),
    hasteMul: 1 + (perm.haste || 0),
    areaMul: 1 + (m.area || 0),
    pickup: 100 * (1 + (m.pickup || 0) + (perm.pickup || 0)),
    greed: 1 + (m.greed || 0) + (perm.greed || 0),
    armor: 0, regen: 0,
    luck: (perm.luck || 0),
    weapons: [],         // {id, level, timer, angle?}
    passives: {},        // id -> level
  };
  player.hp = player.maxHp;
  state.revivesLeft = (perm.revives || 0);

  addWeapon(ch.start, 1);

  // reset world
  enemies.length = projectiles.length = gems.length = coinsArr.length = 0;
  particles.length = floats.length = hazards.length = arcs.length = orbiters.length = pickups.length = 0;
  enemyBullets.length = 0;
  boss = null; bossPending = 0; bossIndex = 0; nextBossT = 140; spawnAcc = 0; eid = 1;
  Object.assign(state, { t: 0, kills: 0, coins: 0, level: 1, xp: 0, xpNext: xpForLevel(1), pendingLevels: 0, ended: false, shake: 0 });
  cam.x = 0; cam.y = 0;

  started = true; running = true;
  setInputEnabled(true);
  SDK.gameplayStart();
  document.getElementById('hud').classList.remove('hidden');
  last = performance.now();
  if (!raf) raf = requestAnimationFrame(loop);
}

function xpForLevel(lvl) { return Math.round(3 + (lvl - 1) * 2.4 + (lvl - 1) * (lvl - 1) * 0.55); }

export function pause() {
  if (!running) return;
  running = false; setInputEnabled(false); SDK.gameplayStop();
}
export function resumePlay() {
  if (!started || state.ended) return;
  running = true; setInputEnabled(true); SDK.gameplayStart();
  last = performance.now();
}
export function isRunning() { return running; }
export function hasRun() { return started; }

/* ---------------- weapons / leveling ---------------- */
function findWeapon(id) { return player.weapons.find((w) => w.id === id); }
function addWeapon(id, level = 1) {
  const def = WEAPONS[id]; if (!def) return;
  player.weapons.push({ id, level, timer: 0, angle: Math.random() * 6.28 });
}
function levelWeapon(id) { const w = findWeapon(id); if (w) w.level = Math.min(WEAPONS[id].max, w.level + 1); }
function addPassive(id) {
  const def = PASSIVES[id]; if (!def) return;
  const lvl = (player.passives[id] || 0) + 1;
  player.passives[id] = Math.min(def.max, lvl);
  recalcPassives();
}
function recalcPassives() {
  // recompute multipliers from base char/perm + passives
  const ch = CHARACTERS[state.charId]; const perm = Meta.permBonuses(); const m = ch.mods || {};
  let dmg = 1 + (m.dmg||0) + (perm.dmg||0), haste = 1 + (perm.haste||0), speed = 1 + (m.speed||0) + (perm.speed||0);
  let pickup = 1 + (m.pickup||0) + (perm.pickup||0), greed = 1 + (m.greed||0) + (perm.greed||0);
  let hpAdd = 0, armor = 0, regen = 0;
  for (const id in player.passives) {
    const p = PASSIVES[id], lvl = player.passives[id];
    if (p.stat === 'dmg') dmg += p.add * lvl;
    else if (p.stat === 'haste') haste += p.add * lvl;
    else if (p.stat === 'speed') speed += p.add * lvl;
    else if (p.stat === 'pickup') pickup += p.add * lvl;
    else if (p.stat === 'greed') greed += p.add * lvl;
    else if (p.stat === 'armor') armor += p.add * lvl;
    else if (p.stat === 'regen') regen += p.add * lvl;
    else if (p.stat === 'hp') hpAdd += p.add * lvl;
  }
  player.dmgMul = dmg; player.hasteMul = haste; player.greed = greed;
  player.baseSpeed = 215 * speed; player.pickup = 100 * pickup;
  player.armor = Math.min(0.7, armor); player.regen = regen;
  const newMax = Math.round(120 + (m.hp||0) + (perm.hp||0) + hpAdd);
  if (newMax > player.maxHp) player.hp += (newMax - player.maxHp); // heal the delta
  player.maxHp = newMax;
}

function gainXP(n) {
  state.xp += n;
  while (state.xp >= state.xpNext) {
    state.xp -= state.xpNext;
    state.level++;
    state.xpNext = xpForLevel(state.level);
    state.pendingLevels++;
  }
  if (state.pendingLevels > 0 && running) openLevelUp();
}

function openLevelUp() {
  pause();
  SFX.level();
  const choices = rollChoices();
  cb.onLevelUp && cb.onLevelUp({ level: state.level, choices, weapons: snapshotWeapons() });
}

/** Build the level-up snapshot of owned weapons for the fusion bench. */
function snapshotWeapons() {
  return player.weapons.map((w) => ({ id: w.id, level: w.level, def: WEAPONS[w.id] }));
}

/** Roll 3 upgrade choices (new weapon / level up / passive). luck adds rerolls toward rarer. */
function rollChoices() {
  const owned = new Set(player.weapons.map((w) => w.id));
  const pool = [];
  // level-up existing (not maxed)
  for (const w of player.weapons) {
    const def = WEAPONS[w.id]; if (w.level < def.max)
      pool.push({ kind: 'levelW', id: w.id, name: def.name, icon: def.icon, color: def.color,
        tag: 'up', desc: `Level ${w.level} → ${w.level + 1}`, weight: 3 });
  }
  // new base weapons (cap arsenal at 6)
  if (player.weapons.length < 6) {
    for (const id in WEAPONS) {
      const def = WEAPONS[id]; if (def.fused) continue; if (owned.has(id)) continue;
      pool.push({ kind: 'newW', id, name: def.name, icon: def.icon, color: def.color,
        tag: 'new', desc: def.desc, weight: 2 });
    }
  }
  // passives
  for (const id in PASSIVES) {
    const def = PASSIVES[id]; const lvl = player.passives[id] || 0; if (lvl >= def.max) continue;
    pool.push({ kind: 'passive', id, name: def.name, icon: def.icon, color: def.color,
      tag: 'up', desc: def.desc, weight: 2 });
  }
  // heal fallback
  pool.push({ kind: 'heal', id: 'heal', name: 'Repair', icon: '➕', color: '#9dff3c', tag: 'up', desc: 'Restore 35% HP', weight: 1.2 });

  // Fortune (luck) biases rolls toward weapons/upgrades and away from filler heals.
  const luck = player.luck || 0;
  if (luck) for (const c of pool) {
    if (c.kind === 'newW' || c.kind === 'levelW') c.weight *= (1 + 0.12 * luck);
    else if (c.kind === 'heal') c.weight /= (1 + 0.5 * luck);
  }

  const picks = [];
  const tmp = pool.slice();
  const n = Math.min(3, tmp.length);
  for (let i = 0; i < n; i++) {
    let total = 0; for (const c of tmp) total += c.weight;
    let r = Math.random() * total, idx = 0;
    for (let j = 0; j < tmp.length; j++) { r -= tmp[j].weight; if (r <= 0) { idx = j; break; } }
    picks.push(tmp.splice(idx, 1)[0]);
  }
  return picks;
}

/** Called by UI when the player taps a choice card. */
export function applyChoice(choice) {
  if (choice.kind === 'newW') addWeapon(choice.id, 1);
  else if (choice.kind === 'levelW') levelWeapon(choice.id);
  else if (choice.kind === 'passive') addPassive(choice.id);
  else if (choice.kind === 'heal') player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
  afterChoice();
}

/** Called by UI when a fusion is performed (drag-merge). */
export function applyFusion(aId, bId, outId) {
  // remove the two ingredients, add fused at combined level
  const wa = findWeapon(aId), wb = findWeapon(bId);
  const lvl = Math.max(1, Math.min(WEAPONS[outId].max, Math.max(wa ? wa.level : 1, wb ? wb.level : 1)));
  player.weapons = player.weapons.filter((w) => w.id !== aId && w.id !== bId);
  addWeapon(outId, lvl);
  SFX.fuse();
  SDK.happytime();
  spawnFloat(player.x, player.y - 30, 'FUSION!', '#9dff3c', 26);
  burst(player.x, player.y, '#9dff3c', 30);
  state.shake = Math.max(state.shake, 8);
  afterChoice();
}

function afterChoice() {
  state.pendingLevels = Math.max(0, state.pendingLevels - 1);
  if (state.pendingLevels > 0) { openLevelUp(); }
  else { cb.onLevelClose && cb.onLevelClose(); resumePlay(); }
}

/* ---------------- spawning ---------------- */
const ENEMY_TYPES = {
  grunt:  { r: 13, hp: 1.0, spd: 74,  dmg: 5,  color: '#ff5d6c', xp: 1, coin: 0.20, shape: 'tri' },
  fast:   { r: 10, hp: 0.6, spd: 128, dmg: 4,  color: '#ff9f43', xp: 1, coin: 0.16, shape: 'dia' },
  tank:   { r: 22, hp: 3.2, spd: 50,  dmg: 9,  color: '#a55bff', xp: 3, coin: 0.5,  shape: 'hex' },
  shoot:  { r: 13, hp: 1.2, spd: 58,  dmg: 6,  color: '#36d1c4', xp: 2, coin: 0.4,  shape: 'sq', ranged: true },
  brute:  { r: 28, hp: 6.0, spd: 44,  dmg: 13, color: '#ff3cac', xp: 6, coin: 1.0,  shape: 'hex' },
};
function pickType() {
  const t = state.t; const r = Math.random();
  if (t > 170 && r < 0.10) return 'brute';
  if (t > 105 && r < 0.20) return 'shoot';
  if (t > 70 && r < 0.36) return 'tank';
  if (t > 28 && r < 0.55) return 'fast';
  return 'grunt';
}
function difficultyHp() { return 10 + state.t * 0.85 + Math.pow(state.t, 1.32) * 0.03; }

function spawnEnemy(typeKey) {
  if (enemies.length > 360) return;
  const T = ENEMY_TYPES[typeKey];
  // spawn just off the screen edge around the player
  const ang = Math.random() * Math.PI * 2;
  const dist = Math.max(W, H) * 0.62 + 60;
  const e = {
    id: eid++, type: typeKey, x: player.x + Math.cos(ang) * dist, y: player.y + Math.sin(ang) * dist,
    r: T.r, hp: T.hp * difficultyHp(), maxHp: T.hp * difficultyHp(),
    spd: T.spd * (0.9 + Math.random() * 0.2), dmg: T.dmg, color: T.color, shape: T.shape,
    xp: T.xp, coin: T.coin, flash: 0, slow: 0, slowT: 0, meleeCd: 0, fireCd: 1 + Math.random(),
    ranged: !!T.ranged, hitBy: null,
  };
  enemies.push(e);
}

function spawnBoss() {
  bossIndex++;
  const hpMul = 32 + bossIndex * 20;
  const b = {
    id: eid++, boss: true, x: player.x, y: player.y - Math.max(W, H) * 0.62,
    r: 46 + bossIndex * 4, hp: difficultyHp() * hpMul, maxHp: difficultyHp() * hpMul,
    spd: 56 + bossIndex * 4, dmg: 26, color: '#ff3cac', flash: 0, slow: 0, slowT: 0, meleeCd: 0,
    fireCd: 2, ringCd: 3, name: 'WARDEN ' + romanize(bossIndex),
  };
  boss = b;
  SFX.boss();
  state.shake = 14;
  cb.onBossStart && cb.onBossStart(b.name);
}
function romanize(n){ return ['I','II','III','IV','V','VI','VII','VIII','IX','X'][Math.min(9,n-1)] || ('x'+n); }

/* ---------------- weapon firing ---------------- */
function fireWeapons(dt) {
  // continuous + cooldown weapons
  for (const w of player.weapons) {
    const def = WEAPONS[w.id];
    const s = getStats(def, w.level);
    s.dmg *= player.dmgMul;
    if (def.area) s.area *= player.areaMul;
    const cd = (s.cd || 0) / player.hasteMul;

    if (def.behavior === 'orbit') {
      w.angle += (s.speed || 2.5) * dt;
      // build orbiter positions; damage handled in collision
      // store for render + collide
      w._orbs = [];
      const count = s.count, R = 46 + s.area * 1.5;
      for (let i = 0; i < count; i++) {
        const a = w.angle + (i / count) * Math.PI * 2;
        w._orbs.push({ x: player.x + Math.cos(a) * R, y: player.y + Math.sin(a) * R, r: s.area, dmg: s.dmg });
      }
      // periodic extras
      if (s.shoots) { w.timer -= dt; if (w.timer <= 0) { w.timer = (s.cd||0.5)/player.hasteMul; for (const o of w._orbs) shootAt(o.x, o.y, (s.shotDmg||10)*player.dmgMul, s.shotSpeed||540, def.color, 0); } }
      if (s.emitsNova) { w.timer -= dt; if (w.timer <= 0) { w.timer = (s.cd||1.2)/player.hasteMul; for (const o of w._orbs) doNova(o.x, o.y, s.novaArea*player.areaMul, (s.novaDmg||10)*player.dmgMul, s.slow, s.slowTime, def.color); } }
      continue;
    }
    if (def.behavior === 'beam') {
      w.angle += (s.rot || 1.2) * dt;
      w._beam = { ang: w.angle, len: s.len * player.areaMul, width: s.area, dmg: s.dmg * dt * 6, slow: s.slow, slowTime: s.slowTime, color: def.color };
      continue;
    }

    // cooldown-driven
    w.timer -= dt;
    if (w.timer > 0) continue;
    w.timer = Math.max(0.05, cd);

    if (def.behavior === 'projectile') {
      const target = nearestEnemy(player.x, player.y, 1400);
      for (let i = 0; i < s.count; i++) {
        let ang;
        if (target) { ang = Math.atan2(target.y - player.y, target.x - player.x); }
        else { ang = Math.atan2(player.face.y, player.face.x); }
        ang += (i - (s.count - 1) / 2) * 0.16;
        shootAng(ang, s.dmg, s.speed, def.color, s.pierce, s.area, def, s);
      }
      SFX.shoot();
    } else if (def.behavior === 'shotgun') {
      const target = nearestEnemy(player.x, player.y, 900);
      const baseAng = target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.atan2(player.face.y, player.face.x);
      for (let i = 0; i < s.count; i++) {
        const ang = baseAng + (Math.random() - 0.5) * s.spread;
        const p = shootAng(ang, s.dmg, s.speed * (0.85 + Math.random() * 0.3), def.color, s.pierce || 0, s.area, def, s);
        if (p) p.life = s.life || 0.5;
      }
      SFX.shoot();
    } else if (def.behavior === 'chain') {
      doChain(player.x, player.y, s.dmg, s.jumps, s.range, def.color);
    } else if (def.behavior === 'nova') {
      doNova(player.x, player.y, s.area, s.dmg, s.slow, s.slowTime, def.color);
    } else if (def.behavior === 'saw') {
      const target = nearestEnemy(player.x, player.y, 1200);
      const baseAng = target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.random() * 6.28;
      for (let i = 0; i < s.count; i++) {
        const ang = baseAng + (i / s.count) * Math.PI * 2 * (s.count > 1 ? 1 : 0);
        spawnSaw(ang, s, def);
      }
    } else if (def.behavior === 'mine') {
      for (let i = 0; i < s.count; i++) {
        const off = i === 0 ? { x: 0, y: 0 } : { x: (Math.random()-0.5)*80, y: (Math.random()-0.5)*80 };
        hazards.push({ x: player.x + off.x, y: player.y + off.y, r: s.area, dmg: s.dmg, life: s.life || 5,
          tick: 0, color: def.color, cluster: !!def.base.shrapnel, shrapnel: def.base.shrapnel || 0,
          shrapnelDmg: (def.base.shrapnelDmg||0)*player.dmgMul, shrapnelSpeed: def.base.shrapnelSpeed||400, def });
      }
    }
  }
}

function shootAng(ang, dmg, speed, color, pierce, area, def, s) {
  const p = { x: player.x, y: player.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    dmg, r: area || 7, color, pierce: pierce || 0, life: 2.2, hits: (pierce > 0 ? new Set() : null),
    chainOnHit: (s && s.chainOnHit) || 0, chainRange: (s && s.chainRange) || 0, chainDmg: ((s && s.chainDmg) || 0) * 1 };
  projectiles.push(p); return p;
}
function shootAt(x, y, dmg, speed, color, pierce) {
  const t = nearestEnemy(x, y, 900); let ang;
  if (t) ang = Math.atan2(t.y - y, t.x - x); else ang = Math.random() * 6.28;
  projectiles.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg, r: 7, color, pierce: pierce || 0, life: 1.6, hits: (pierce > 0 ? new Set() : null) });
}
function spawnSaw(ang, s, def) {
  projectiles.push({ saw: true, x: player.x, y: player.y, vx: Math.cos(ang) * s.speed, vy: Math.sin(ang) * s.speed,
    dmg: s.dmg, r: s.area, color: def.color, pierce: 999, life: 3, hits: new Set(),
    range: s.range || 240, phase: 'out', spin: 0, slow: s.slow, slowTime: s.slowTime });
}

function doNova(x, y, area, dmg, slow, slowTime, color) {
  particles.push({ ring: true, x, y, r: 8, max: area, t: 0, life: 0.45, color });
  queryNear(x, y, area + 30, (e) => {
    const dx = e.x - x, dy = e.y - y;
    if (dx*dx+dy*dy <= (area + e.r) * (area + e.r)) {
      damageEnemy(e, dmg, color);
      if (slow) { e.slow = Math.max(e.slow, slow); e.slowT = Math.max(e.slowT, slowTime || 1); }
    }
  });
  if (boss && dist2(boss, {x,y}) <= (area + boss.r) ** 2) damageEnemy(boss, dmg, color);
}

function doChain(x, y, dmg, jumps, range, color) {
  let cx = x, cy = y; const hit = new Set(); let last = null;
  for (let j = 0; j <= jumps; j++) {
    const e = nearestEnemy(cx, cy, range, hit);
    if (!e) break;
    arcs.push({ x1: cx, y1: cy, x2: e.x, y2: e.y, t: 0, life: 0.18, color });
    damageEnemy(e, dmg, color);
    hit.add(e.id); cx = e.x; cy = e.y;
  }
  if (hit.size) SFX.hit();
}

/* ---------------- damage / death ---------------- */
function damageEnemy(e, dmg, color) {
  e.hp -= dmg; e.flash = 0.08;
  spawnFloat(e.x, e.y - e.r - 6, Math.round(dmg), color || '#fff', 13);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.boss) { killBoss(e); return; }
  e.dead = true;
  state.kills++;
  burst(e.x, e.y, e.color, 8);
  SFX.kill();
  // drop xp gem
  gems.push({ x: e.x, y: e.y, v: e.xp, r: 5, vy: 0, color: '#9dff3c' });
  if (Math.random() < e.coin) coinsArr.push({ x: e.x + (Math.random()-0.5)*10, y: e.y, v: 1, r: 5 });
}
function killBoss(b) {
  boss = null;
  state.kills++;
  SFX.bossDie();
  SDK.happytime();
  state.shake = 16;
  burst(b.x, b.y, b.color, 60);
  for (let i = 0; i < 18; i++) gems.push({ x: b.x + (Math.random()-0.5)*80, y: b.y + (Math.random()-0.5)*80, v: 4, r: 6, color: '#9dff3c' });
  // golden chest pickup (rewarded)
  pickups.push({ chest: true, x: b.x, y: b.y, r: 18, t: 0 });
  spawnFloat(b.x, b.y - 50, 'BOSS DOWN!', '#ffd54a', 28);
  cb.onBossEnd && cb.onBossEnd();
}

function hurtPlayer(dmg) {
  if (player.invuln > 0) return;
  dmg *= (1 - player.armor);
  player.hp -= dmg; player.invuln = 0.75;
  state.shake = Math.max(state.shake, 6);
  SFX.hurt();
  spawnFloat(player.x, player.y - 26, '-' + Math.round(dmg), '#ff4d5e', 16);
  if (player.hp <= 0) onDeath();
}

function onDeath() {
  if (state.ended) return;
  player.hp = 0; state.ended = true; running = false;
  setInputEnabled(false); SDK.gameplayStop();
  SFX.death();
  burst(player.x, player.y, '#22e6ff', 40);
  cb.onDeath && cb.onDeath({ canRevive: state.revivesLeft > 0 || true });
}

/** Revive (granted by rewarded ad). Clears nearby enemies, restores HP. */
export function revive() {
  if (!state.ended) return;
  state.ended = false;
  player.hp = Math.round(player.maxHp * 0.6); player.invuln = 2.5;
  // nuke nearby
  for (const e of enemies) { const d2 = dist2(e, player); if (d2 < 320*320) { e.hp = -1; killEnemy(e); } }
  if (state.revivesLeft > 0) state.revivesLeft--;
  resumePlay();
}

/** Open chest reward (rewarded ad) -> coins + a random level-up. */
export function openChest() {
  const bonus = 12 + bossIndex * 6;
  state.coins += bonus;
  spawnFloat(player.x, player.y - 40, '+' + bonus + ' ◈', '#ffd54a', 24);
  SFX.coin();
  state.pendingLevels++; openLevelUp();
}

/* ---------------- end / results ---------------- */
export function endRun() {
  if (!started) return;
  running = false; started = false;
  setInputEnabled(false); SDK.gameplayStop();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('bossHpWrap').classList.add('hidden');
  const coinsEarned = Math.round(state.coins * player.greed);
  const result = {
    seconds: Math.floor(state.t), kills: state.kills, level: state.level,
    coins: coinsEarned, charId: state.charId,
    weapons: player.weapons.map((w) => ({ id: w.id, level: w.level, def: WEAPONS[w.id] })),
    isBest: state.t > Meta.get().best,
  };
  Meta.recordRun(result.seconds, result.kills, coinsEarned);
  cb.onResults && cb.onResults(result);
}
export function getRunState() { return state; }

/* ---------------- main loop ---------------- */
function loop(now) {
  raf = requestAnimationFrame(loop);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05; // clamp big frame gaps
  if (running) update(dt);
  render();
  updateHUD();
}

function update(dt) {
  state.t += dt;

  // ----- player movement -----
  const mv = getMove();
  if (mv.x || mv.y) { player.face.x = mv.x; player.face.y = mv.y; }
  player.x += mv.x * player.baseSpeed * dt;
  player.y += mv.y * player.baseSpeed * dt;
  if (player.invuln > 0) player.invuln -= dt;
  if (player.regen) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);

  // camera
  cam.x += (player.x - cam.x) * Math.min(1, dt * 8);
  cam.y += (player.y - cam.y) * Math.min(1, dt * 8);

  buildGrid();

  // ----- spawning -----
  const interval = Math.max(0.25, 1.3 - state.t * 0.0048);
  spawnAcc += dt;
  while (spawnAcc >= interval) {
    spawnAcc -= interval;
    const burstN = 1 + Math.floor(state.t / 40);
    for (let i = 0; i < burstN; i++) spawnEnemy(pickType());
  }
  // boss timing
  if (!boss && state.t >= nextBossT) { spawnBoss(); nextBossT += 140; }

  // ----- weapons -----
  fireWeapons(dt);

  // ----- update enemies -----
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    let sp = e.spd;
    if (e.slowT > 0) { e.slowT -= dt; sp *= (1 - e.slow); } else e.slow = 0;
    const dx = player.x - e.x, dy = player.y - e.y; const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * sp * dt; e.y += (dy / d) * sp * dt;
    e.meleeCd -= dt;
    // ranged shooters
    if (e.ranged) { e.fireCd -= dt; if (e.fireCd <= 0 && d < 520) { e.fireCd = 2.4; spawnEnemyBullet(e, dx/d, dy/d); } }
    // contact damage
    if (d < e.r + player.r) hurtPlayer(e.dmg);
    // orbit/beam contact damage applied below via weapon hit pass
  }
  // weapon contact (orbit + beam) vs enemies
  applyContactWeapons(dt);

  // boss
  if (boss) updateBoss(dt);

  // ----- projectiles -----
  for (const p of projectiles) {
    if (p.dead) continue;
    if (p.saw) updateSaw(p, dt); else { p.x += p.vx * dt; p.y += p.vy * dt; }
    p.life -= dt; if (p.life <= 0) { p.dead = true; continue; }
    const pr = p.r;
    let consumed = false;
    queryNear(p.x, p.y, pr + 30, (e) => {
      if (consumed || e.dead) return;
      if (p.hits && p.hits.has(e.id)) return;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx*dx + dy*dy <= (pr + e.r) * (pr + e.r)) {
        damageEnemy(e, p.dmg, p.color);
        if (p.slow) { e.slow = Math.max(e.slow, p.slow); e.slowT = Math.max(e.slowT, p.slowTime || 1); }
        if (p.chainOnHit) doChain(e.x, e.y, p.chainDmg || p.dmg * 0.5, p.chainOnHit, p.chainRange || 180, p.color);
        if (p.hits) { p.hits.add(e.id); if (p.hits.size > p.pierce) { p.dead = true; consumed = true; } }
        else { p.dead = true; consumed = true; }
      }
    });
    // projectile vs boss
    if (boss && !p.dead) {
      if (!(p.hits && p.hits.has(boss.id))) {
        const dx = boss.x - p.x, dy = boss.y - p.y;
        if (dx*dx+dy*dy <= (pr + boss.r)**2) {
          damageEnemy(boss, p.dmg, p.color);
          if (p.chainOnHit) doChain(boss.x, boss.y, p.chainDmg || p.dmg*0.5, p.chainOnHit, p.chainRange||180, p.color);
          if (p.hits) { p.hits.add(boss.id); if (p.hits.size > p.pierce) p.dead = true; }
          else p.dead = true;
        }
      }
    }
  }

  // enemy bullets
  updateEnemyBullets(dt);

  // ----- hazards (mines/spike fields) -----
  for (const h of hazards) {
    if (h.dead) continue;
    h.life -= dt; h.tick -= dt;
    if (h.life <= 0) { h.dead = true; continue; }
    let touched = false;
    queryNear(h.x, h.y, h.r + 30, (e) => {
      if (e.dead) return;
      const dx = e.x - h.x, dy = e.y - h.y;
      if (dx*dx+dy*dy <= (h.r + e.r) ** 2) {
        touched = true;
        if (h.cluster) { /* explode handled after loop */ }
        else if (h.tick <= 0) damageEnemy(e, h.dmg, h.color);
      }
    });
    if (h.cluster && touched) { explodeCluster(h); h.dead = true; }
    else if (h.tick <= 0) h.tick = 0.35;
  }

  // ----- gems / coins pickup -----
  collectibles(dt);

  // ----- particles / floats / arcs -----
  for (const pa of particles) {
    pa.t += dt;
    if (pa.ring) { pa.r = pa.r + (pa.max - pa.r) * Math.min(1, dt * 10); }
    else { pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.vx *= 0.92; pa.vy *= 0.92; }
    if (pa.t >= pa.life) pa.dead = true;
  }
  for (const f of floats) { f.t += dt; f.y -= 22 * dt; if (f.t >= f.life) f.dead = true; }
  for (const a of arcs) { a.t += dt; if (a.t >= a.life) a.dead = true; }

  // cleanup
  enemies = enemies.filter((e) => !e.dead);
  projectiles = projectiles.filter((p) => !p.dead);
  hazards = hazards.filter((h) => !h.dead);
  particles = particles.filter((p) => !p.dead);
  floats = floats.filter((f) => !f.dead);
  arcs = arcs.filter((a) => !a.dead);

  // shake decay
  if (state.shake > 0) { state.shake = Math.max(0, state.shake - dt * 30); }
  state.shakeX = (Math.random() - 0.5) * state.shake;
  state.shakeY = (Math.random() - 0.5) * state.shake;
}

let enemyBullets = [];
function spawnEnemyBullet(e, nx, ny) {
  enemyBullets.push({ x: e.x, y: e.y, vx: nx * 230, vy: ny * 230, r: 6, dmg: e.dmg, life: 3, color: '#36d1c4' });
}
function updateEnemyBullets(dt) {
  for (const b of enemyBullets) {
    if (b.dead) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    const dx = b.x - player.x, dy = b.y - player.y;
    if (dx*dx+dy*dy <= (b.r + player.r) ** 2) { hurtPlayer(b.dmg); b.dead = true; }
  }
  enemyBullets = enemyBullets.filter((b) => !b.dead);
}

function applyContactWeapons(dt) {
  for (const w of player.weapons) {
    const def = WEAPONS[w.id];
    if (def.behavior === 'orbit' && w._orbs) {
      for (const o of w._orbs) {
        queryNear(o.x, o.y, o.r + 30, (e) => {
          if (e.dead || e.meleeCd > 0) return;
          const dx = e.x - o.x, dy = e.y - o.y;
          if (dx*dx+dy*dy <= (o.r + e.r) ** 2) { damageEnemy(e, o.dmg, def.color); e.meleeCd = 0.22; }
        });
        if (boss && boss.meleeCd <= 0) { const dx=boss.x-o.x,dy=boss.y-o.y; if (dx*dx+dy*dy<=(o.r+boss.r)**2){ damageEnemy(boss,o.dmg,def.color); boss.meleeCd=0.22; } }
      }
    } else if (def.behavior === 'beam' && w._beam) {
      const bm = w._beam;
      const ex = player.x + Math.cos(bm.ang) * bm.len, ey = player.y + Math.sin(bm.ang) * bm.len;
      // sample along the beam
      const steps = 14;
      for (const e of enemies) {
        if (e.dead || e.meleeCd > 0) continue;
        // distance from point to segment
        if (segHit(player.x, player.y, ex, ey, e.x, e.y, bm.width + e.r)) {
          damageEnemy(e, bm.dmg, bm.color); e.meleeCd = 0.12;
          if (bm.slow) { e.slow = Math.max(e.slow, bm.slow); e.slowT = Math.max(e.slowT, bm.slowTime || 1); }
        }
      }
      if (boss && boss.meleeCd <= 0 && segHit(player.x, player.y, ex, ey, boss.x, boss.y, bm.width + boss.r)) { damageEnemy(boss, bm.dmg, bm.color); boss.meleeCd = 0.1; }
    }
  }
}
function segHit(x1, y1, x2, y2, px, py, rad) {
  const dx = x2 - x1, dy = y2 - y1; const l2 = dx*dx + dy*dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / l2; t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy; const ex = px - cx, ey = py - cy;
  return ex*ex + ey*ey <= rad * rad;
}

function updateSaw(p, dt) {
  p.spin += dt * 18;
  if (p.phase === 'out') {
    p.x += p.vx * dt; p.y += p.vy * dt;
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d >= p.range) p.phase = 'back';
  } else {
    const dx = player.x - p.x, dy = player.y - p.y; const d = Math.hypot(dx, dy) || 1;
    const sp = Math.hypot(p.vx, p.vy);
    p.x += (dx / d) * sp * dt; p.y += (dy / d) * sp * dt;
    if (d < 18) p.dead = true;
  }
}

function explodeCluster(h) {
  doNova(h.x, h.y, h.r, h.dmg, 0, 0, h.color);
  burst(h.x, h.y, h.color, 18);
  state.shake = Math.max(state.shake, 5);
  for (let i = 0; i < h.shrapnel; i++) {
    const a = (i / h.shrapnel) * Math.PI * 2;
    projectiles.push({ x: h.x, y: h.y, vx: Math.cos(a) * h.shrapnelSpeed, vy: Math.sin(a) * h.shrapnelSpeed,
      dmg: h.shrapnelDmg, r: 6, color: h.color, pierce: 1, life: 0.6, hits: null });
  }
}

function updateBoss(dt) {
  const b = boss;
  if (b.flash > 0) b.flash -= dt;
  let sp = b.spd; if (b.slowT > 0) { b.slowT -= dt; sp *= (1 - b.slow); }
  const dx = player.x - b.x, dy = player.y - b.y; const d = Math.hypot(dx, dy) || 1;
  b.x += (dx / d) * sp * dt; b.y += (dy / d) * sp * dt;
  b.meleeCd -= dt;
  if (d < b.r + player.r) hurtPlayer(b.dmg);
  // ranged ring attack
  b.fireCd -= dt; b.ringCd -= dt;
  if (b.fireCd <= 0) { b.fireCd = 1.6; spawnEnemyBullet(b, dx/d, dy/d); }
  if (b.ringCd <= 0) {
    b.ringCd = 3.2;
    const n = 14;
    for (let i = 0; i < n; i++) { const a = (i/n)*Math.PI*2; enemyBullets.push({ x:b.x,y:b.y,vx:Math.cos(a)*180,vy:Math.sin(a)*180,r:7,dmg:b.dmg*0.6,life:3,color:'#ff3cac' }); }
  }
  document.getElementById('bossHpWrap').classList.remove('hidden');
  document.getElementById('bossHpFill').style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
  document.getElementById('bossName').textContent = b.name;
}

function collectibles(dt) {
  const pr = player.pickup;
  for (const g of gems) {
    if (g.dead) continue;
    const dx = player.x - g.x, dy = player.y - g.y; const d2 = dx*dx+dy*dy;
    if (d2 < pr*pr) { const d = Math.sqrt(d2)||1; const pull = Math.min(620, 220 + (pr - d)); g.x += (dx/d)*pull*dt; g.y += (dy/d)*pull*dt; }
    if (d2 < (player.r+8)**2) { g.dead = true; gainXP(g.v); SFX.pickup(); spawnFloat(g.x, g.y, '+'+g.v+'xp', '#9dff3c', 11); }
  }
  for (const c of coinsArr) {
    if (c.dead) continue;
    const dx = player.x - c.x, dy = player.y - c.y; const d2 = dx*dx+dy*dy;
    if (d2 < pr*pr) { const d = Math.sqrt(d2)||1; c.x += (dx/d)*420*dt; c.y += (dy/d)*420*dt; }
    if (d2 < (player.r+8)**2) { c.dead = true; state.coins += c.v; SFX.coin(); }
  }
  for (const pk of pickups) {
    if (pk.dead) continue; pk.t += dt;
    const dx = player.x - pk.x, dy = player.y - pk.y;
    if (dx*dx+dy*dy < (player.r + pk.r) ** 2) { pk.dead = true; cb.onChest && cb.onChest(); }
  }
  gems = gems.filter((g) => !g.dead);
  coinsArr = coinsArr.filter((c) => !c.dead);
  pickups = pickups.filter((p) => !p.dead);
}

/* ---------------- visuals helpers ---------------- */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = 60 + Math.random() * 220;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, r: 2 + Math.random()*3, life: 0.3 + Math.random()*0.3, t: 0, color });
  }
}
function spawnFloat(x, y, text, color, size) { floats.push({ x, y, text: '' + text, color, size: size || 13, t: 0, life: 0.7 }); }
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx*dx + dy*dy; }

/* ---------------- render ---------------- */
function render() {
  ctx.clearRect(0, 0, W, H);
  const ox = W/2 - cam.x + state.shakeX, oy = H/2 - cam.y + state.shakeY;

  drawBackground(ox, oy);

  if (!started && !state.ended) return; // menu: just background

  // hazards
  for (const h of hazards) {
    const a = Math.min(1, h.life);
    ctx.globalAlpha = 0.18 * a; ctx.fillStyle = h.color;
    ctx.beginPath(); ctx.arc(h.x + ox, h.y + oy, h.r, 0, 6.28); ctx.fill();
    ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = h.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(h.x + ox, h.y + oy, h.r, 0, 6.28); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // gems & coins
  for (const g of gems) drawDiamond(g.x + ox, g.y + oy, g.r, '#9dff3c');
  for (const c of coinsArr) { ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(c.x+ox, c.y+oy, c.r, 0, 6.28); ctx.fill(); }

  // enemies
  for (const e of enemies) drawEnemy(e, ox, oy);
  if (boss) drawBoss(boss, ox, oy);

  // chest pickups
  for (const pk of pickups) { if (pk.chest) drawChest(pk.x+ox, pk.y+oy, pk.t); }

  // beams (under projectiles)
  for (const w of player.weapons) { const def = WEAPONS[w.id]; if (def.behavior === 'beam' && w._beam) drawBeam(player.x+ox, player.y+oy, w._beam); }

  // orbiters
  for (const w of player.weapons) { const def = WEAPONS[w.id]; if (def.behavior === 'orbit' && w._orbs) for (const o of w._orbs) drawBlade(o.x+ox, o.y+oy, o.r, def.color); }

  // projectiles
  for (const p of projectiles) drawProjectile(p, ox, oy);
  // enemy bullets
  for (const b of enemyBullets) { ctx.fillStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(b.x+ox, b.y+oy, b.r, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0; }

  // arcs (lightning)
  for (const a of arcs) drawArc(a, ox, oy);

  // player
  if (!state.ended || true) drawPlayer(ox, oy);

  // particles
  for (const pa of particles) {
    const al = 1 - pa.t / pa.life;
    if (pa.ring) { ctx.globalAlpha = al * 0.8; ctx.strokeStyle = pa.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pa.x+ox, pa.y+oy, pa.r, 0, 6.28); ctx.stroke(); }
    else { ctx.globalAlpha = al; ctx.fillStyle = pa.color; ctx.beginPath(); ctx.arc(pa.x+ox, pa.y+oy, pa.r, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  // floats
  ctx.textAlign = 'center';
  for (const f of floats) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    ctx.fillStyle = f.color; ctx.font = `900 ${f.size}px Segoe UI, system-ui, sans-serif`;
    ctx.fillText(f.text, f.x + ox, f.y + oy);
  }
  ctx.globalAlpha = 1;

  // vignette
  drawVignette();
}

function drawBackground(ox, oy) {
  ctx.fillStyle = '#070b16'; ctx.fillRect(0, 0, W, H);
  const grid = 80;
  const sx = ((ox % grid) + grid) % grid, sy = ((oy % grid) + grid) % grid;
  ctx.strokeStyle = 'rgba(70,110,200,0.10)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = sx; x < W; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = sy; y < H; y += grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  // subtle radial glow at player
  if (player) {
    const g = ctx.createRadialGradient(player.x+ox, player.y+oy, 10, player.x+ox, player.y+oy, 260);
    g.addColorStop(0, 'rgba(34,230,255,0.06)'); g.addColorStop(1, 'rgba(34,230,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}
function drawVignette() {
  const g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.35, W/2, H/2, Math.max(W,H)*0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function drawPlayer(ox, oy) {
  const x = player.x + ox, y = player.y + oy;
  const blink = player.invuln > 0 && Math.floor(player.invuln * 16) % 2 === 0;
  ctx.shadowColor = '#22e6ff'; ctx.shadowBlur = 18;
  ctx.fillStyle = blink ? 'rgba(255,255,255,0.5)' : '#22e6ff';
  ctx.beginPath(); ctx.arc(x, y, player.r, 0, 6.28); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#06121a';
  ctx.beginPath(); ctx.arc(x, y, player.r * 0.55, 0, 6.28); ctx.fill();
  // facing indicator
  ctx.fillStyle = '#eaf6ff';
  ctx.beginPath(); ctx.arc(x + player.face.x * player.r * 0.7, y + player.face.y * player.r * 0.7, 4, 0, 6.28); ctx.fill();
}
function drawEnemy(e, ox, oy) {
  const x = e.x + ox, y = e.y + oy;
  if (x < -40 || x > W+40 || y < -40 || y > H+40) return;
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
  ctx.shadowColor = e.color; ctx.shadowBlur = 6;
  shape(x, y, e.r, e.shape);
  ctx.shadowBlur = 0;
  if (e.slowT > 0) { ctx.strokeStyle = 'rgba(127,223,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, e.r + 3, 0, 6.28); ctx.stroke(); }
}
function shape(x, y, r, kind) {
  ctx.beginPath();
  if (kind === 'tri') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); }
  else if (kind === 'dia') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); }
  else if (kind === 'sq') { ctx.rect(x - r, y - r, r * 2, r * 2); }
  else if (kind === 'hex') { for (let i = 0; i < 6; i++) { const a = i/6*6.28; const fx = x+Math.cos(a)*r, fy = y+Math.sin(a)*r; i?ctx.lineTo(fx,fy):ctx.moveTo(fx,fy); } }
  else { ctx.arc(x, y, r, 0, 6.28); }
  ctx.closePath(); ctx.fill();
}
function drawBoss(b, ox, oy) {
  const x = b.x + ox, y = b.y + oy;
  ctx.shadowColor = b.color; ctx.shadowBlur = 24;
  ctx.fillStyle = b.flash > 0 ? '#fff' : b.color;
  ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i/8*6.28 + b.x*0.001; const r = b.r * (i%2?0.8:1); const fx=x+Math.cos(a)*r, fy=y+Math.sin(a)*r; i?ctx.lineTo(fx,fy):ctx.moveTo(fx,fy); } ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#1a0613'; ctx.beginPath(); ctx.arc(x, y, b.r*0.5, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#ff3cac'; ctx.beginPath(); ctx.arc(x, y, b.r*0.22, 0, 6.28); ctx.fill();
}
function drawProjectile(p, ox, oy) {
  const x = p.x + ox, y = p.y + oy;
  ctx.shadowColor = p.color; ctx.shadowBlur = 10;
  if (p.saw) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.spin);
    ctx.fillStyle = p.color; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i/8*6.28; const r = i%2?p.r:p.r*0.55; const fx=Math.cos(a)*r, fy=Math.sin(a)*r; i?ctx.lineTo(fx,fy):ctx.moveTo(fx,fy); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  } else {
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.28); ctx.fill();
    // motion trail
    ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(x - p.vx*0.012, y - p.vy*0.012, p.r*0.7, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}
function drawBlade(x, y, r, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(performance.now()*0.02);
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = i/6*6.28; const rr = i%2?r:r*0.5; const fx=Math.cos(a)*rr, fy=Math.sin(a)*rr; i?ctx.lineTo(fx,fy):ctx.moveTo(fx,fy); }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
}
function drawBeam(x, y, bm) {
  const ex = x + Math.cos(bm.ang) * bm.len, ey = y + Math.sin(bm.ang) * bm.len;
  ctx.strokeStyle = bm.color; ctx.shadowColor = bm.color; ctx.shadowBlur = 16;
  ctx.lineWidth = bm.width * 2; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.lineWidth = bm.width; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}
function drawArc(a, ox, oy) {
  const al = 1 - a.t / a.life;
  ctx.globalAlpha = al; ctx.strokeStyle = a.color; ctx.shadowColor = a.color; ctx.shadowBlur = 12; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(a.x1+ox, a.y1+oy);
  const segs = 4; for (let i = 1; i < segs; i++) { const tt = i/segs; const mx = a.x1+(a.x2-a.x1)*tt + (Math.random()-0.5)*16; const my = a.y1+(a.y2-a.y1)*tt + (Math.random()-0.5)*16; ctx.lineTo(mx+ox, my+oy); }
  ctx.lineTo(a.x2+ox, a.y2+oy); ctx.stroke();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}
function drawDiamond(x, y, r, color) {
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(x, y-r); ctx.lineTo(x+r, y); ctx.lineTo(x, y+r); ctx.lineTo(x-r, y); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
}
function drawChest(x, y, t) {
  const bob = Math.sin(t * 4) * 4;
  ctx.shadowColor = '#ffd54a'; ctx.shadowBlur = 20; ctx.fillStyle = '#ffd54a';
  ctx.fillRect(x - 16, y - 12 + bob, 32, 24);
  ctx.shadowBlur = 0; ctx.fillStyle = '#8a5a00'; ctx.fillRect(x - 16, y - 2 + bob, 32, 4);
  ctx.fillStyle = '#fff7d6'; ctx.fillRect(x - 3, y - 4 + bob, 6, 8);
}

/* ---------------- HUD ---------------- */
const $ = (id) => document.getElementById(id);
function updateHUD() {
  if (!started) return;
  const hpPct = Math.max(0, player.hp / player.maxHp) * 100;
  $('hpFill').style.width = hpPct + '%';
  $('hpText').textContent = Math.max(0, Math.ceil(player.hp)) + '/' + player.maxHp;
  $('xpFill').style.width = (state.xp / state.xpNext * 100) + '%';
  $('lvlText').textContent = 'Lv ' + state.level;
  const s = Math.floor(state.t);
  $('timeText').textContent = String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
  $('killText').textContent = '☠ ' + state.kills;
  $('coinText').textContent = '◈ ' + state.coins;
}
