/* ============================================================
   Meta-progression + persistence (localStorage).
   Permanent upgrades, owned heroes, daily claim, best run.
   No PII — guest-local only.
   ============================================================ */
import { dailyHeroId, todayKey } from './characters.js';

const KEY = 'hordeRush.save.v1';

const DEFAULT = {
  coins: 0,
  best: 0,                 // best survival seconds
  bestKills: 0,
  totalRuns: 0,
  ownedChars: ['vanguard'],
  selectedChar: 'vanguard',
  upgrades: {},            // id -> level
  dailyClaimed: -1,        // day index of last claim
  muted: false,
};

export const META_UPGRADES = {
  vit:    { id:'vit',    name:'Toughness',  icon:'❤️', desc:'+12 starting max HP',   max:8, baseCost:60,  growth:1.6, per:12,   stat:'hp' },
  pow:    { id:'pow',    name:'Power',      icon:'🗡️', desc:'+6% damage',            max:8, baseCost:80,  growth:1.6, per:0.06, stat:'dmg' },
  spd:    { id:'spd',    name:'Agility',    icon:'👟', desc:'+4% move speed',        max:5, baseCost:90,  growth:1.7, per:0.04, stat:'speed' },
  mag:    { id:'mag',    name:'Lodestone',  icon:'🧲', desc:'+15% pickup range',     max:5, baseCost:70,  growth:1.6, per:0.15, stat:'pickup' },
  luck:   { id:'luck',   name:'Fortune',    icon:'🍀', desc:'Better upgrade rolls',  max:5, baseCost:120, growth:1.8, per:1,    stat:'luck' },
  coin:   { id:'coin',   name:'Prospector', icon:'💰', desc:'+10% coins earned',     max:6, baseCost:100, growth:1.6, per:0.10, stat:'greed' },
  rev:    { id:'rev',    name:'Phoenix',    icon:'🔥', desc:'+1 free revive',        max:2, baseCost:400, growth:2.5, per:1,    stat:'revives' },
  haste:  { id:'haste',  name:'Overclock',  icon:'⏩', desc:'+4% fire rate',         max:6, baseCost:90,  growth:1.6, per:0.04, stat:'haste' },
};

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const p = JSON.parse(raw);
    return Object.assign({}, DEFAULT, p, {
      ownedChars: p.ownedChars && p.ownedChars.length ? p.ownedChars : ['vanguard'],
      upgrades: p.upgrades || {},
    });
  } catch { return { ...DEFAULT }; }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function get() { return data; }
export function coins() { return data.coins; }
export function addCoins(n) { data.coins += Math.max(0, Math.floor(n)); save(); }
export function spendCoins(n) { if (data.coins >= n) { data.coins -= n; save(); return true; } return false; }

export function upgLevel(id) { return data.upgrades[id] || 0; }
export function upgCost(id) {
  const u = META_UPGRADES[id]; const lvl = upgLevel(id);
  if (lvl >= u.max) return Infinity;
  return Math.round(u.baseCost * Math.pow(u.growth, lvl));
}
export function buyUpgrade(id) {
  const u = META_UPGRADES[id]; const lvl = upgLevel(id);
  if (lvl >= u.max) return false;
  const cost = upgCost(id);
  if (!spendCoins(cost)) return false;
  data.upgrades[id] = lvl + 1; save(); return true;
}

/** Aggregate permanent bonuses to feed into a run. */
export function permBonuses() {
  const b = { hp:0, dmg:0, speed:0, pickup:0, luck:0, greed:0, revives:0, haste:0 };
  for (const id in META_UPGRADES) {
    const u = META_UPGRADES[id]; const lvl = upgLevel(id);
    if (!lvl) continue;
    b[u.stat] = (b[u.stat] || 0) + u.per * lvl;
  }
  return b;
}

/* ---------- heroes ---------- */
export function ownsChar(id) { return data.ownedChars.includes(id); }
export function buyChar(id, cost) {
  if (ownsChar(id)) return true;
  if (!spendCoins(cost)) return false;
  data.ownedChars.push(id); save(); return true;
}
export function selectChar(id) { if (ownsChar(id)) { data.selectedChar = id; save(); } }
export function selectedChar() { return data.selectedChar; }

/* ---------- daily ---------- */
export function dailyAvailable() { return data.dailyClaimed !== todayKey(); }
export function claimDaily() {
  const hero = dailyHeroId();
  let granted = false;
  if (!ownsChar(hero)) { data.ownedChars.push(hero); granted = true; }
  data.dailyClaimed = todayKey();
  save();
  return { hero, granted };
}

/* ---------- run results ---------- */
export function recordRun(seconds, kills, coinsEarned) {
  data.totalRuns++;
  if (seconds > data.best) data.best = seconds;
  if (kills > data.bestKills) data.bestKills = kills;
  addCoins(coinsEarned);
  save();
}

/* ---------- audio pref ---------- */
export function setMutedPref(m) { data.muted = m; save(); }
export function mutedPref() { return data.muted; }
