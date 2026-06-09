/* ============================================================
   Heroes + daily free-hero rotation.
   mods are multipliers/additives applied at run start.
   ============================================================ */

export const CHARACTERS = {
  vanguard: {
    id:'vanguard', name:'Vanguard', icon:'🛡️', color:'#22e6ff', start:'pulse', cost:0,
    desc:'Balanced all-rounder.',
    mods:{ hp:0, dmg:0, speed:0, pickup:0 },
  },
  frost: {
    id:'frost', name:'Cryomancer', icon:'❄️', color:'#7fdfff', start:'nova', cost:300,
    desc:'Starts with Frost Nova. +area, slower.',
    mods:{ hp:0, dmg:0.05, speed:-0.05, area:0.15 },
  },
  striker: {
    id:'striker', name:'Striker', icon:'🌀', color:'#9dff3c', start:'orbit', cost:300,
    desc:'Orbit Blades + fast feet.',
    mods:{ hp:-10, dmg:0, speed:0.15, pickup:0.10 },
  },
  tesla: {
    id:'tesla', name:'Tesla', icon:'⚡', color:'#ffc23c', start:'chain', cost:500,
    desc:'Tesla Arc + bonus area, glassy.',
    mods:{ hp:-20, dmg:0.15, area:0.10, speed:0.05 },
  },
  ranger: {
    id:'ranger', name:'Ranger', icon:'🪃', color:'#c08bff', start:'saw', cost:500,
    desc:'Boomerang Saw + huge pickup range.',
    mods:{ hp:0, dmg:0, speed:0.05, pickup:0.5 },
  },
  bruiser: {
    id:'bruiser', name:'Bruiser', icon:'💢', color:'#ff6a7a', start:'scatter', cost:700,
    desc:'Scatter Gun + tanky, hits hard.',
    mods:{ hp:60, dmg:0.10, speed:-0.05 },
  },
  sapper: {
    id:'sapper', name:'Sapper', icon:'✸', color:'#ff4d5e', start:'spike', cost:700,
    desc:'Spike Field + extra coins.',
    mods:{ hp:20, dmg:0.05, greed:0.25 },
  },
};

export const CHAR_LIST = Object.values(CHARACTERS);

/** Deterministic daily hero id from the date (UTC day index). */
export function dailyHeroId() {
  const ids = Object.keys(CHARACTERS).filter((id) => CHARACTERS[id].cost > 0);
  const dayIndex = Math.floor(Date.now() / 86400000);
  return ids[dayIndex % ids.length];
}

/** Today's date key for claim tracking. */
export function todayKey() {
  return Math.floor(Date.now() / 86400000);
}

/** Ms until next daily reset (UTC midnight-ish on the 24h grid). */
export function msToNextDaily() {
  const day = 86400000;
  return day - (Date.now() % day);
}
