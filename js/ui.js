/* ============================================================
   UI orchestration — DOM screens, level-up + FUSION drag,
   shop / heroes, death/revive, results + Build & Body-Count card.
   ============================================================ */
import * as Game from './game.js';
import * as Meta from './meta.js';
import * as SDK from './sdk.js';
import { SFX, setMuted, isMuted } from './audio.js';
import { WEAPONS, getFusion, canFuse } from './weapons.js';
import { CHARACTERS, CHAR_LIST, dailyHeroId, msToNextDaily } from './characters.js';
import { META_UPGRADES } from './meta.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['loadingScreen','menuScreen','charScreen','shopScreen','howScreen','tourScreen','levelScreen','pauseScreen','deathScreen','resultsScreen'];
const GAME_PAGE = 'https://www.crazygames.com/game/horde-rush'; // canonical page (links back here)

let currentResult = null;

function show(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); }
function hide(id) { $(id).classList.add('hidden'); }
function overlayShow(id) { $(id).classList.remove('hidden'); }

export function initUI() {
  // ---- main menu ----
  $('playBtn').addEventListener('click', () => { SFX.click(); startGame(); });
  $('charBtn').addEventListener('click', () => { SFX.click(); openHeroes(); });
  $('shopBtn').addEventListener('click', () => { SFX.click(); openShop(); });
  $('howBtn').addEventListener('click', () => { SFX.click(); openTour(() => { show('menuScreen'); }); });
  $('howPlay').addEventListener('click', () => { SFX.click(); beginRun(); });
  $('muteBtn').addEventListener('click', toggleMute);

  // tour
  $('tourNext').addEventListener('click', () => { SFX.click(); tourNext(); });
  $('tourSkip').addEventListener('click', () => { SFX.click(); tourFinish(); });

  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { SFX.click(); refreshMenu(); show('menuScreen'); }));

  // ---- pause ----
  $('pauseBtn').addEventListener('click', () => { SFX.click(); Game.pause(); overlayShow('pauseScreen'); });
  $('resumeBtn').addEventListener('click', () => { SFX.click(); hide('pauseScreen'); Game.resumePlay(); });
  $('quitBtn').addEventListener('click', () => { SFX.click(); hide('pauseScreen'); Game.endRun(); });

  // ---- death ----
  $('reviveBtn').addEventListener('click', onRevive);
  $('giveupBtn').addEventListener('click', () => { SFX.click(); hide('deathScreen'); Game.endRun(); });

  // ---- results ----
  $('x2Btn').addEventListener('click', onDoubleCoins);
  $('shareBtn').addEventListener('click', onShare);
  $('againBtn').addEventListener('click', () => { SFX.click(); hide('resultsScreen'); startGame(); });
  $('menuBtn2').addEventListener('click', () => { SFX.click(); hide('resultsScreen'); refreshMenu(); show('menuScreen'); });

  // keyboard pause
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && Game.hasRun()) {
      if (Game.isRunning()) { Game.pause(); overlayShow('pauseScreen'); }
      else if (!$('pauseScreen').classList.contains('hidden')) { hide('pauseScreen'); Game.resumePlay(); }
    }
  });

  setMuted(Meta.mutedPref());
  $('muteBtn').textContent = isMuted() ? '🔇' : '♪';
}

/* ---------------- menu ---------------- */
export function refreshMenu() {
  $('menuCoins').textContent = Meta.coins();
  $('shopCoins') && ($('shopCoins').textContent = Meta.coins());
  $('charCoins') && ($('charCoins').textContent = Meta.coins());
  const best = Meta.get().best;
  $('menuBest').textContent = fmtTime(best);
  // daily
  const hero = CHARACTERS[dailyHeroId()];
  $('dailyHeroName').textContent = hero.icon + ' ' + hero.name + (Meta.dailyAvailable() ? ' — FREE!' : ' (claimed)');
  tickDaily();
}
let dailyTimerInt = null;
function tickDaily() {
  if (dailyTimerInt) clearInterval(dailyTimerInt);
  const upd = () => {
    const ms = msToNextDaily(); const h = Math.floor(ms/3600000), m = Math.floor(ms%3600000/60000);
    $('dailyTimer').textContent = Meta.dailyAvailable() ? '' : `resets in ${h}h ${m}m`;
  };
  upd(); dailyTimerInt = setInterval(upd, 60000);
}

function toggleMute() {
  const m = !isMuted(); setMuted(m); Meta.setMutedPref(m);
  $('muteBtn').textContent = m ? '🔇' : '♪'; if (!m) SFX.click();
}

/* ---------------- start a run ---------------- */
function startGame() {
  // first-time players get the visual tour, then the run starts
  if (!Meta.tourSeen()) { openTour(beginRun); return; }
  beginRun();
}
function beginRun() {
  // claim daily hero on first play of the day (D1 retention hook)
  if (Meta.dailyAvailable()) {
    const { hero, granted } = Meta.claimDaily();
    if (granted) toast(`★ Daily hero unlocked: ${CHARACTERS[hero].name}!`);
  }
  for (const s of SCREENS) hide(s);
  Game.startRun(Meta.selectedChar());
  // first-ever-run coach hint (keeps conversion high; non-blocking)
  if (Meta.get().totalRuns === 0) {
    setTimeout(() => { if (Game.isRunning()) toast('Move to dodge — you fire automatically!'); }, 700);
    setTimeout(() => { if (Game.isRunning()) toast('Grab green gems to level up ✨'); }, 5200);
  }
}

/* ---------------- visual tour ---------------- */
const TOUR_STEPS = [
  { title: 'MOVE', text: 'Drag anywhere on screen (or use WASD / arrow keys) to move. There is NO fire button — your weapons shoot by themselves!',
    stage: `<div class="t-stick"></div><div class="t-nub"></div><div class="t-hero"></div>` },
  { title: 'AUTO-FIRE', text: 'You attack automatically at the nearest enemy. Just focus on dodging the horde and staying alive.',
    stage: `<div class="t-foe f1"></div><div class="t-foe f2"></div><div class="t-hero"></div>
            <div class="t-bolt b1"></div><div class="t-bolt b2"></div><div class="t-bolt b3"></div><div class="t-bolt b4"></div>` },
  { title: 'COLLECT & LEVEL UP', text: 'Defeated enemies drop green XP gems. Scoop them up to fill the bar and LEVEL UP for new upgrades.',
    stage: `<div class="t-gem g1"></div><div class="t-gem g2"></div><div class="t-gem g3"></div><div class="t-hero"></div><div class="t-xp"><i></i></div>` },
  { title: 'FUSE WEAPONS 🧬', text: 'The secret weapon: on the level-up screen, DRAG one weapon onto another to MERGE them into a powerful hybrid. Experiment for crazy builds!',
    stage: `<div class="t-chip cA">➤</div><div class="t-chip cB">⚡</div><div class="t-chip cF">🔭</div><div class="t-finger">👆</div>` },
  { title: 'SURVIVE & EARN', text: 'Outlast the horde, smash the bosses, and bank coins to buy permanent upgrades and new heroes. Good luck!',
    stage: `<div class="t-emo e1">⏱️</div><div class="t-emo e2">💰</div><div class="t-emo e3">☠️</div><div class="t-emo big">🛡️</div>` },
];
let tourStep = 0;
let tourDone = null;
function openTour(onDone) {
  tourDone = onDone || (() => show('menuScreen'));
  tourStep = 0;
  // build dots
  const dots = $('tourDots'); dots.innerHTML = '';
  TOUR_STEPS.forEach(() => dots.appendChild(document.createElement('i')));
  renderTour();
  overlayShow('tourScreen');
}
function renderTour() {
  const s = TOUR_STEPS[tourStep];
  $('tourStage').innerHTML = s.stage;
  $('tourTitle').textContent = s.title;
  $('tourText').textContent = s.text;
  $('tourNext').textContent = tourStep === TOUR_STEPS.length - 1 ? '▶ PLAY' : 'NEXT ▶';
  $('tourSkip').style.visibility = tourStep === TOUR_STEPS.length - 1 ? 'hidden' : 'visible';
  Array.from($('tourDots').children).forEach((d, i) => d.classList.toggle('on', i === tourStep));
}
function tourNext() {
  if (tourStep < TOUR_STEPS.length - 1) { tourStep++; renderTour(); }
  else tourFinish();
}
function tourFinish() {
  Meta.setTourSeen();
  hide('tourScreen');
  const fn = tourDone; tourDone = null;
  if (fn) fn();
}

/* ---------------- heroes ---------------- */
function openHeroes() {
  const grid = $('charGrid'); grid.innerHTML = '';
  for (const ch of CHAR_LIST) {
    const owned = Meta.ownsChar(ch.id);
    const selected = Meta.selectedChar() === ch.id;
    const w = WEAPONS[ch.start];
    const card = document.createElement('div');
    card.className = 'unit-card' + (owned ? '' : ' locked') + (selected ? ' selected' : '');
    card.innerHTML = `
      <div class="unit-ico" style="background:${hex(ch.color,0.16)};color:${ch.color}">${ch.icon}</div>
      <div class="unit-name">${ch.name}</div>
      <div class="unit-desc">${ch.desc}</div>
      <div class="unit-stat">Starts: ${w.icon} ${w.name}</div>`;
    const btn = document.createElement('button');
    if (selected) { btn.className = 'unit-btn owned'; btn.textContent = 'SELECTED'; btn.disabled = true; }
    else if (owned) { btn.className = 'unit-btn equip'; btn.textContent = 'SELECT'; btn.onclick = () => { SFX.click(); Meta.selectChar(ch.id); openHeroes(); }; }
    else { btn.className = 'unit-btn buy'; btn.textContent = `◈ ${ch.cost}`; btn.disabled = Meta.coins() < ch.cost;
      btn.onclick = () => { if (Meta.buyChar(ch.id, ch.cost)) { SFX.coin(); Meta.selectChar(ch.id); openHeroes(); refreshMenu(); } else toast('Not enough coins'); }; }
    card.appendChild(btn);
    grid.appendChild(card);
  }
  $('charCoins').textContent = Meta.coins();
  show('charScreen');
}

/* ---------------- shop ---------------- */
function openShop() {
  const grid = $('shopGrid'); grid.innerHTML = '';
  for (const id in META_UPGRADES) {
    const u = META_UPGRADES[id]; const lvl = Meta.upgLevel(id); const cost = Meta.upgCost(id);
    const maxed = lvl >= u.max;
    const card = document.createElement('div');
    card.className = 'unit-card';
    const dots = Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    card.innerHTML = `
      <div class="unit-ico" style="background:rgba(34,230,255,.12)">${u.icon}</div>
      <div class="unit-name">${u.name}</div>
      <div class="unit-desc">${u.desc}</div>
      <div class="lvl-dots">${dots}</div>`;
    const btn = document.createElement('button');
    if (maxed) { btn.className = 'unit-btn owned'; btn.textContent = 'MAX'; btn.disabled = true; }
    else { btn.className = 'unit-btn buy'; btn.textContent = `◈ ${cost}`; btn.disabled = Meta.coins() < cost;
      btn.onclick = () => { if (Meta.buyUpgrade(id)) { SFX.coin(); openShop(); refreshMenu(); } else toast('Not enough coins'); }; }
    card.appendChild(btn);
    grid.appendChild(card);
  }
  $('shopCoins').textContent = Meta.coins();
  show('shopScreen');
}

/* ---------------- level up + FUSION ---------------- */
export function onLevelUp({ level, choices, weapons }) {
  overlayShow('levelScreen');
  $('levelNum').textContent = level;
  // choice cards
  const row = $('choiceRow'); row.innerHTML = '';
  for (const c of choices) {
    const el = document.createElement('div');
    el.className = 'choice' + (c.tag === 'new' ? '' : '');
    const tagClass = c.tag === 'new' ? 'tag-new' : 'tag-up';
    const tagText = c.tag === 'new' ? 'NEW' : 'UPGRADE';
    el.innerHTML = `
      <span class="choice-tag ${tagClass}">${tagText}</span>
      <div class="choice-ico" style="background:${hex(c.color,0.16)};color:${c.color}">${c.icon}</div>
      <div class="choice-name">${c.name}</div>
      <div class="choice-desc">${c.desc}</div>`;
    el.onclick = () => { SFX.click(); Game.applyChoice(c); };
    row.appendChild(el);
  }
  renderBench(weapons);
}

function renderBench(weapons) {
  const bench = $('benchRow'); bench.innerHTML = '';
  // determine which weapons have at least one fusable partner
  const ids = weapons.map((w) => w.id);
  weapons.forEach((w) => {
    const def = WEAPONS[w.id];
    const chip = document.createElement('div');
    chip.className = 'chip' + (def.fused ? ' maxed' : '');
    chip.dataset.id = w.id;
    chip.innerHTML = `<span class="chip-ico">${def.icon}</span><span class="chip-lvl">L${w.level}</span>`;
    if (!def.fused) attachDrag(chip, w.id, ids);
    bench.appendChild(chip);
  });
  const hint = $('benchRow').children.length < 2;
  document.querySelector('.bench-hint').textContent = hint ? 'get 2+ base weapons to fuse' : 'drag one onto another to fuse';
}

let drag = null;
function attachDrag(chip, id, allIds) {
  chip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const ghost = document.createElement('div');
    ghost.className = 'chip-ghost'; ghost.textContent = WEAPONS[id].icon;
    document.body.appendChild(ghost);
    moveGhost(ghost, e.clientX, e.clientY);
    chip.classList.add('dragging');
    // highlight fusable partners
    document.querySelectorAll('.chip').forEach((c) => {
      const oid = c.dataset.id;
      if (oid && oid !== id && canFuse(id, oid)) c.classList.add('fusable');
    });
    drag = { id, ghost, chip };
    chip.setPointerCapture(e.pointerId);
  });
  chip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    moveGhost(drag.ghost, e.clientX, e.clientY);
    const target = chipUnder(e.clientX, e.clientY);
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('drop-ok'));
    if (target && target.dataset.id && target.dataset.id !== drag.id && canFuse(drag.id, target.dataset.id)) target.classList.add('drop-ok');
  });
  const end = (e) => {
    if (!drag) return;
    const target = chipUnder(e.clientX, e.clientY);
    const cleanup = () => {
      drag.ghost.remove();
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('fusable','drop-ok','dragging'));
      drag = null;
    };
    if (target && target.dataset.id && target.dataset.id !== drag.id) {
      const out = getFusion(drag.id, target.dataset.id);
      if (out) { const a = drag.id, b = target.dataset.id; cleanup(); Game.applyFusion(a, b, out); return; }
    }
    cleanup();
  };
  chip.addEventListener('pointerup', end);
  chip.addEventListener('pointercancel', end);
}
function moveGhost(g, x, y) { g.style.left = (x - 32) + 'px'; g.style.top = (y - 32) + 'px'; }
function chipUnder(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('.chip') : null;
}

export function onLevelClose() { hide('levelScreen'); }

/* ---------------- death / revive ---------------- */
export function onDeath() {
  overlayShow('deathScreen');
  const st = Game.getRunState();
  $('deathSub').textContent = `You survived ${fmtTime(Math.floor(st.t))} · ${st.kills} kills.`;
}
async function onRevive() {
  SFX.click();
  showAdCover();
  const ok = await SDK.requestRewarded();
  hideAdCover();
  if (ok) { hide('deathScreen'); Game.revive(); }
  else { toast('Ad unavailable — ending run'); hide('deathScreen'); Game.endRun(); }
}

/* ---------------- chest reward ---------------- */
export async function onChest() {
  // golden chest = rewarded. In Basic Launch the adapter grants instantly.
  Game.pause();
  showAdCover();
  const ok = await SDK.requestRewarded();
  hideAdCover();
  if (ok) Game.openChest();   // openChest opens a level-up (stays paused) 
  else Game.resumePlay();
}

/* ---------------- results + share ---------------- */
export function onResults(result) {
  currentResult = result;
  result.doubled = false;
  // interstitial fires only here, on the run-end fade (Basic Launch: no-op)
  SDK.requestMidgame();
  drawShareCard(result);
  $('x2Wrap').classList.remove('hidden');
  $('x2Btn').disabled = false; $('x2Btn').textContent = '×2 COINS (watch ad)';
  $('shareNote').classList.add('hidden');
  overlayShow('resultsScreen');
}
async function onDoubleCoins() {
  if (!currentResult || currentResult.doubled) return;
  SFX.click(); showAdCover();
  const ok = await SDK.requestRewarded();
  hideAdCover();
  if (ok) {
    Meta.addCoins(currentResult.coins); // grant another 1x = doubled total
    currentResult.doubled = true;
    $('x2Btn').disabled = true; $('x2Btn').textContent = '✓ COINS DOUBLED';
    toast(`+${currentResult.coins} ◈ bonus!`);
    refreshMenu();
  } else toast('Ad unavailable');
}

function onShare() {
  SFX.click();
  const r = currentResult; if (!r) return;
  const link = SDK.inviteLink({ t: r.seconds, k: r.kills, c: r.charId });
  const text = `I survived ${fmtTime(r.seconds)} with ${r.kills} kills in HORDE RUSH 🔥 Beat my time:`;
  const cardCanvas = $('shareCard');
  // try native share with the image
  if (navigator.share && cardCanvas.toBlob) {
    cardCanvas.toBlob(async (blob) => {
      const file = new File([blob], 'horde-rush.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'HORDE RUSH', text, url: link, files: [file] });
          return;
        }
        await navigator.share({ title: 'HORDE RUSH', text, url: link });
      } catch { copyLink(text + ' ' + link); }
    }, 'image/png');
  } else {
    copyLink(text + ' ' + link);
  }
}
function copyLink(s) {
  try { navigator.clipboard.writeText(s).then(() => { $('shareNote').classList.remove('hidden'); }); }
  catch { $('shareNote').classList.remove('hidden'); }
}

/* ---- Build & Body-Count card (canvas) ---- */
function drawShareCard(r) {
  const c = $('shareCard'); const x = c.getContext('2d'); const W = c.width, H = c.height;
  const ch = CHARACTERS[r.charId] || CHARACTERS.vanguard;
  // bg
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c1430'); g.addColorStop(1, '#05080f');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // grid
  x.strokeStyle = 'rgba(80,130,220,0.10)'; x.lineWidth = 1;
  for (let i = 0; i < W; i += 48) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let i = 0; i < H; i += 48) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
  // border glow
  x.strokeStyle = '#22e6ff'; x.lineWidth = 4; x.shadowColor = '#22e6ff'; x.shadowBlur = 24;
  roundRect(x, 8, 8, W - 16, H - 16, 24); x.stroke(); x.shadowBlur = 0;

  x.textAlign = 'center';
  // title
  x.fillStyle = '#eaf6ff'; x.font = '900 64px Segoe UI, system-ui, sans-serif';
  x.fillText('HORDE RUSH', W/2, 96);
  x.fillStyle = '#8aa0c8'; x.font = '700 24px Segoe UI, system-ui, sans-serif';
  x.fillText('SURVIVOR · BULLET HEAVEN', W/2, 134);

  // hero
  x.fillStyle = hex(ch.color, 0.16); roundRect(x, W/2 - 60, 168, 120, 120, 24); x.fill();
  x.font = '70px system-ui'; x.fillText(ch.icon, W/2, 256);
  x.fillStyle = ch.color; x.font = '800 28px Segoe UI, system-ui, sans-serif';
  x.fillText(ch.name, W/2, 320);

  // big time
  x.fillStyle = '#9dff3c'; x.font = '900 120px Segoe UI, system-ui, sans-serif';
  x.shadowColor = '#9dff3c'; x.shadowBlur = 22;
  x.fillText(fmtTime(r.seconds), W/2, 460); x.shadowBlur = 0;
  x.fillStyle = '#8aa0c8'; x.font = '700 22px Segoe UI, system-ui, sans-serif';
  x.fillText('SURVIVED', W/2, 496);

  // stats row
  stat(x, W*0.28, 560, '☠ ' + r.kills, 'KILLS', '#ff3cac');
  stat(x, W*0.72, 560, 'Lv ' + r.level, 'LEVEL', '#22e6ff');

  // build (weapon icons)
  x.fillStyle = '#8aa0c8'; x.font = '700 20px Segoe UI, system-ui, sans-serif';
  x.fillText('— MY BUILD —', W/2, 636);
  const ws = r.weapons.slice(0, 6);
  const slot = 96, gap = 14, totalW = ws.length * slot + (ws.length - 1) * gap;
  let sx = W/2 - totalW/2;
  for (const w of ws) {
    const fused = w.def.fused;
    x.fillStyle = fused ? hex('#9dff3c', 0.18) : 'rgba(255,255,255,0.06)';
    roundRect(x, sx, 660, slot, slot, 18); x.fill();
    if (fused) { x.strokeStyle = '#9dff3c'; x.lineWidth = 3; x.shadowColor = '#9dff3c'; x.shadowBlur = 14; roundRect(x, sx, 660, slot, slot, 18); x.stroke(); x.shadowBlur = 0; }
    x.font = '46px system-ui'; x.fillStyle = '#fff'; x.textAlign = 'center';
    x.fillText(w.def.icon, sx + slot/2, 660 + slot/2 + 14);
    x.font = '900 16px Segoe UI'; x.fillStyle = '#22e6ff'; x.fillText('L' + w.level, sx + slot/2, 660 + slot - 8);
    sx += slot + gap;
  }

  // footer challenge
  x.fillStyle = '#ffd54a'; x.font = '900 30px Segoe UI, system-ui, sans-serif';
  x.fillText('⚔ BEAT MY TIME ⚔', W/2, 812);
  x.fillStyle = '#8aa0c8'; x.font = '700 22px Segoe UI, system-ui, sans-serif';
  x.fillText('crazygames.com › Horde Rush', W/2, 850);
}
function stat(x, cx, cy, big, label, color) {
  x.textAlign = 'center';
  x.fillStyle = color; x.font = '900 54px Segoe UI, system-ui, sans-serif'; x.fillText(big, cx, cy);
  x.fillStyle = '#8aa0c8'; x.font = '700 20px Segoe UI, system-ui, sans-serif'; x.fillText(label, cx, cy + 30);
}
function roundRect(x, rx, ry, w, h, r) {
  x.beginPath();
  x.moveTo(rx + r, ry); x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r); x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r); x.closePath();
}

/* ---------------- helpers ---------------- */
function showAdCover() { $('adCover').classList.remove('hidden'); }
function hideAdCover() { $('adCover').classList.add('hidden'); }
let toastT = null;
export function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add('hidden'), 2200);
}
function fmtTime(s) { s = Math.max(0, Math.floor(s)); return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }
function hex(c, a) {
  // c is #rrggbb -> rgba string
  const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* boss banner helpers (called by game) */
export function onBossStart(name) {
  const el = $('bossBanner'); el.querySelector('span').textContent = '⚠ ' + name + ' ⚠';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2000);
}
export function onBossEnd() { $('bossHpWrap').classList.add('hidden'); }
