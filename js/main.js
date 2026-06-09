/* ============================================================
   HORDE RUSH — bootstrap.
   Instant perceived load: arena + first wave are ready immediately;
   the SDK loads in parallel and never blocks reaching gameplay.
   ============================================================ */
import * as Game from './game.js';
import * as UI from './ui.js';
import * as Meta from './meta.js';
import * as SDK from './sdk.js';
import { unlock as audioUnlock } from './audio.js';

const $ = (id) => document.getElementById(id);

function boot() {
  const canvas = $('game');

  // Tell CrazyGames we are loading (no-op off-domain).
  SDK.loadingStart();

  // Wire game <-> ui callbacks.
  Game.init(canvas, {
    onLevelUp: UI.onLevelUp,
    onLevelClose: UI.onLevelClose,
    onDeath: UI.onDeath,
    onResults: UI.onResults,
    onChest: UI.onChest,
    onBossStart: UI.onBossStart,
    onBossEnd: UI.onBossEnd,
  });

  UI.initUI();

  // Input init lives in game's input module; unlock audio on first gesture.
  import('./input.js').then((Input) => {
    Input.initInput(canvas, { onFirstInput: audioUnlock });
  });

  // Initialise SDK in parallel — do NOT await before showing the menu.
  SDK.initSDK().finally(() => SDK.loadingStop());

  // Fake-but-honest progressive load bar (assets are procedural = instant).
  runLoadBar(() => {
    UI.refreshMenu();
    showMenu();
  });
}

function runLoadBar(done) {
  const fill = $('loadFill'); const hint = $('loadHint');
  const steps = [
    [30, 'Spinning up arena…'],
    [60, 'Loading weapon systems…'],
    [85, 'Summoning the horde…'],
    [100, 'Ready.'],
  ];
  let i = 0;
  const tick = () => {
    if (i >= steps.length) { done(); return; }
    const [pct, msg] = steps[i++];
    fill.style.width = pct + '%'; hint.textContent = msg;
    setTimeout(tick, 130);
  };
  tick();
}

function showMenu() {
  for (const s of ['loadingScreen']) $(s).classList.add('hidden');
  $('menuScreen').classList.remove('hidden');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
