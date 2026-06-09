/* ============================================================
   Weapon + fusion data (the differentiator lives here).
   - Base weapons, passive upgrades, and FUSION recipes.
   - getStats(def, level) returns concrete numbers used by game.js.
   ============================================================ */

// behavior types interpreted by game.js:
//  projectile | orbit | nova | beam | chain | shotgun | mine | boomerang

export const WEAPONS = {
  pulse: {
    id:'pulse', name:'Pulse Bolt', icon:'➤', color:'#22e6ff', behavior:'projectile', max:8,
    desc:'Fires a fast bolt at the nearest enemy.',
    base:{ dmg:10, cd:0.55, count:1, pierce:0, speed:520, area:7 },
    scale:{ dmg:5, cd:0.93, area:1.0 }, countEvery:3,
  },
  orbit: {
    id:'orbit', name:'Orbit Blades', icon:'🌀', color:'#9dff3c', behavior:'orbit', max:8,
    desc:'Blades spin around you, shredding contact.',
    base:{ dmg:8, cd:0, count:2, pierce:999, speed:2.6, area:14 },
    scale:{ dmg:4, area:1.04 }, countEvery:2,
  },
  nova: {
    id:'nova', name:'Frost Nova', icon:'❄️', color:'#7fdfff', behavior:'nova', max:8,
    desc:'Pulses an icy ring that damages and slows.',
    base:{ dmg:9, cd:1.6, count:1, area:90, slow:0.45, slowTime:1.4 },
    scale:{ dmg:5, cd:0.95, area:1.10 },
  },
  chain: {
    id:'chain', name:'Tesla Arc', icon:'⚡', color:'#ffc23c', behavior:'chain', max:8,
    desc:'Lightning that jumps between enemies.',
    base:{ dmg:12, cd:1.0, count:1, jumps:3, area:9, range:300 },
    scale:{ dmg:6, cd:0.95, jumps:1 }, jumpEvery:3,
  },
  scatter: {
    id:'scatter', name:'Scatter Gun', icon:'🔱', color:'#ff8a4d', behavior:'shotgun', max:8,
    desc:'A cone of pellets in your facing direction.',
    base:{ dmg:7, cd:0.9, count:4, pierce:0, speed:480, spread:0.55, area:6, life:0.4 },
    scale:{ dmg:3.5, cd:0.95 }, countEvery:2,
  },
  saw: {
    id:'saw', name:'Boomerang Saw', icon:'🪃', color:'#c08bff', behavior:'boomerang', max:8,
    desc:'A saw that flies out and curves back.',
    base:{ dmg:11, cd:1.1, count:1, pierce:999, speed:430, area:13, range:240 },
    scale:{ dmg:5, cd:0.95 }, countEvery:3,
  },
  spike: {
    id:'spike', name:'Spike Field', icon:'✸', color:'#ff4d5e', behavior:'mine', max:8,
    desc:'Drops spike traps that detonate on contact.',
    base:{ dmg:16, cd:1.3, count:1, area:46, life:6 },
    scale:{ dmg:8, cd:0.95, area:1.06 }, countEvery:3,
  },

  /* ---------- FUSED weapons (created via merge) ---------- */
  orbital_cannon: {
    id:'orbital_cannon', name:'Orbital Cannon', icon:'🛰️', color:'#5cffd0', behavior:'orbit', max:6, fused:true,
    desc:'Orbiting turrets that ALSO snipe enemies.',
    base:{ dmg:16, cd:0.5, count:3, pierce:999, speed:2.9, area:16, shoots:true, shotDmg:14, shotSpeed:560 },
    scale:{ dmg:7, area:1.05 }, countEvery:2,
  },
  railgun: {
    id:'railgun', name:'Railgun', icon:'🔭', color:'#a0f0ff', behavior:'projectile', max:6, fused:true,
    desc:'Piercing rail shot that arcs to nearby foes.',
    base:{ dmg:30, cd:0.7, count:1, pierce:999, speed:900, area:10, chainOnHit:2, chainRange:220, chainDmg:18 },
    scale:{ dmg:12, cd:0.94 }, countEvery:4,
  },
  cryo_laser: {
    id:'cryo_laser', name:'Cryo Laser', icon:'🌟', color:'#bfe9ff', behavior:'beam', max:6, fused:true,
    desc:'A sweeping beam that freezes everything it touches.',
    base:{ dmg:7, cd:0, count:1, area:26, len:260, rot:1.3, slow:0.55, slowTime:1.2 },
    scale:{ dmg:3, area:1.05 },
  },
  storm_scatter: {
    id:'storm_scatter', name:'Storm Scatter', icon:'🌩️', color:'#ffd86b', behavior:'shotgun', max:6, fused:true,
    desc:'A chaining pellet storm in a wide cone.',
    base:{ dmg:11, cd:0.7, count:7, speed:520, spread:0.8, area:7, life:0.45, chainOnHit:2, chainRange:160, chainDmg:9 },
    scale:{ dmg:5, cd:0.95 }, countEvery:2,
  },
  frost_ring: {
    id:'frost_ring', name:'Frost Ring', icon:'💠', color:'#7fe9ff', behavior:'orbit', max:6, fused:true,
    desc:'Orbiting shards that pulse freezing waves.',
    base:{ dmg:13, cd:1.2, count:4, pierce:999, speed:2.4, area:16, emitsNova:true, novaDmg:10, novaArea:80, slow:0.5, slowTime:1.4 },
    scale:{ dmg:6, area:1.04 }, countEvery:2,
  },
  glacial_saw: {
    id:'glacial_saw', name:'Glacial Saw', icon:'🌀', color:'#9ce6ff', behavior:'boomerang', max:6, fused:true,
    desc:'A freezing saw that boomerangs through hordes.',
    base:{ dmg:20, cd:0.85, count:2, pierce:999, speed:500, area:16, range:300, slow:0.5, slowTime:1.2 },
    scale:{ dmg:9, cd:0.95 }, countEvery:3,
  },
  cluster_bomb: {
    id:'cluster_bomb', name:'Cluster Mines', icon:'💥', color:'#ff7a4d', behavior:'mine', max:6, fused:true,
    desc:'Mines that scatter shrapnel on detonation.',
    base:{ dmg:26, cd:1.0, count:2, area:60, life:5, shrapnel:6, shrapnelDmg:10, shrapnelSpeed:420 },
    scale:{ dmg:11, cd:0.95, area:1.06 }, countEvery:3,
  },
  plasma_web: {
    id:'plasma_web', name:'Plasma Web', icon:'🕸️', color:'#ff6bd6', behavior:'chain', max:6, fused:true,
    desc:'A relentless web of arcing plasma.',
    base:{ dmg:18, cd:0.55, count:2, jumps:6, area:10, range:340 },
    scale:{ dmg:8, cd:0.96, jumps:1 }, jumpEvery:2,
  },
};

/* Passive stat upgrades (not weapons). mult applied to player stats. */
export const PASSIVES = {
  might:  { id:'might',  name:'Might',     icon:'🗡️', color:'#ff6a7a', desc:'+15% damage',        max:6, stat:'dmg',    add:0.15 },
  haste:  { id:'haste',  name:'Haste',     icon:'⏩', color:'#22e6ff', desc:'+12% fire rate',     max:6, stat:'haste',  add:0.12 },
  swift:  { id:'swift',  name:'Swift',     icon:'👟', color:'#9dff3c', desc:'+10% move speed',    max:5, stat:'speed',  add:0.10 },
  vigor:  { id:'vigor',  name:'Vigor',     icon:'❤️', color:'#ff4d5e', desc:'+25 max HP & heal',  max:6, stat:'hp',     add:25 },
  magnet: { id:'magnet', name:'Magnet',    icon:'🧲', color:'#c08bff', desc:'+30% pickup range',  max:5, stat:'pickup', add:0.30 },
  greed:  { id:'greed',  name:'Greed',     icon:'💰', color:'#ffd54a', desc:'+20% coins',         max:5, stat:'greed',  add:0.20 },
  regen:  { id:'regen',  name:'Regen',     icon:'🩹', color:'#9dff3c', desc:'+0.6 HP/sec',        max:5, stat:'regen',  add:0.6 },
  armor:  { id:'armor',  name:'Armor',     icon:'🛡️', color:'#8aa0c8', desc:'-8% damage taken',   max:5, stat:'armor',  add:0.08 },
};

/* Fusion recipes: every pair uses two BASE weapons -> one fused weapon.
   Covers all 21 base pairs so any two base weapons can always fuse. */
const RAW_RECIPES = [
  ['pulse','orbit','orbital_cannon'],
  ['pulse','chain','railgun'],
  ['pulse','scatter','railgun'],
  ['pulse','nova','cryo_laser'],
  ['pulse','saw','orbital_cannon'],
  ['pulse','spike','railgun'],
  ['orbit','nova','frost_ring'],
  ['orbit','chain','orbital_cannon'],
  ['orbit','scatter','storm_scatter'],
  ['orbit','saw','frost_ring'],
  ['orbit','spike','cluster_bomb'],
  ['nova','chain','cryo_laser'],
  ['nova','scatter','storm_scatter'],
  ['nova','saw','glacial_saw'],
  ['nova','spike','frost_ring'],
  ['chain','scatter','storm_scatter'],
  ['chain','saw','plasma_web'],
  ['chain','spike','plasma_web'],
  ['scatter','saw','storm_scatter'],
  ['scatter','spike','cluster_bomb'],
  ['saw','spike','cluster_bomb'],
];
const RECIPES = {};
for (const [a, b, out] of RAW_RECIPES) {
  if (!WEAPONS[a] || !WEAPONS[b] || !WEAPONS[out]) continue;
  RECIPES[fuseKey(a, b)] = out;
}

function fuseKey(a, b) { return [a, b].sort().join('|'); }

/** Returns the fused weapon id for two ids, or null if no recipe. */
export function getFusion(a, b) {
  if (a === b) return null;
  return RECIPES[fuseKey(a, b)] || null;
}

/** True if two owned weapon ids can fuse. */
export function canFuse(a, b) { return !!getFusion(a, b); }

/** Concrete stats for a weapon at a level. */
export function getStats(def, level) {
  const s = Object.assign({}, def.base);
  for (let L = 2; L <= level; L++) {
    if (def.scale.dmg) s.dmg += def.scale.dmg;
    if (def.scale.cd) s.cd *= def.scale.cd;
    if (def.scale.area) s.area *= def.scale.area;
    if (def.scale.jumps && def.jumpEvery && (L - 1) % def.jumpEvery === 0) s.jumps = (s.jumps || 0) + def.scale.jumps;
  }
  if (def.countEvery) s.count = def.base.count + Math.floor((level - 1) / def.countEvery);
  return s;
}

export function isWeapon(id) { return !!WEAPONS[id]; }
export function getDef(id) { return WEAPONS[id] || PASSIVES[id] || null; }
