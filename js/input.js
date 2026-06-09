/* ============================================================
   Input — unified movement vector from:
   - Keyboard: WASD / Arrow keys (desktop)
   - Pointer drag: floating virtual joystick (touch + mouse)
   Exposes getMove() -> {x,y} normalized-ish (magnitude <=1).
   ============================================================ */

const keys = new Set();
let pointerActive = false;
let pointerId = null;
let baseX = 0, baseY = 0;     // joystick origin (screen px)
let curX = 0, curY = 0;       // current pointer (screen px)
const STICK_R = 60;           // px radius for full speed

let enabled = false;
let canvas = null;
let layerEl = null, baseEl = null, nubEl = null;
let onFirstInput = null;       // callback (audio unlock etc.)

export function initInput(canvasEl, opts = {}) {
  canvas = canvasEl;
  layerEl = document.getElementById('stickLayer');
  baseEl = document.getElementById('stickBase');
  nubEl = document.getElementById('stickNub');
  onFirstInput = opts.onFirstInput || null;

  // keyboard
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' '].includes(k)) {
      keys.add(k);
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
      fireFirst();
    }
  }, { passive: false });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // pointer (joystick) — only on the canvas
  canvas.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function fireFirst() { if (onFirstInput) { onFirstInput(); onFirstInput = null; } }

export function setEnabled(v) {
  enabled = v;
  if (!v) { pointerActive = false; pointerId = null; hideStick(); keys.clear(); }
}

function onDown(e) {
  if (!enabled) return;
  if (pointerActive) return;
  pointerActive = true;
  pointerId = e.pointerId;
  baseX = curX = e.clientX;
  baseY = curY = e.clientY;
  showStick();
  fireFirst();
  e.preventDefault();
}
function onMove(e) {
  if (!pointerActive || e.pointerId !== pointerId) return;
  curX = e.clientX; curY = e.clientY;
  updateStick();
  e.preventDefault();
}
function onUp(e) {
  if (e.pointerId !== pointerId) return;
  pointerActive = false; pointerId = null;
  hideStick();
}

function showStick() {
  if (!layerEl) return;
  layerEl.classList.remove('hidden');
  baseEl.style.left = baseX + 'px';
  baseEl.style.top = baseY + 'px';
  nubEl.style.transform = 'translate(0,0)';
}
function hideStick() { if (layerEl) layerEl.classList.add('hidden'); }
function updateStick() {
  let dx = curX - baseX, dy = curY - baseY;
  const len = Math.hypot(dx, dy);
  if (len > STICK_R) { dx = dx / len * STICK_R; dy = dy / len * STICK_R; }
  if (nubEl) nubEl.style.transform = `translate(${dx}px,${dy}px)`;
}

/** Returns desired movement direction, magnitude clamped to 1. */
export function getMove() {
  let x = 0, y = 0;
  // keyboard
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  if (x || y) {
    const l = Math.hypot(x, y);
    return { x: x / l, y: y / l };
  }
  // pointer joystick
  if (pointerActive) {
    let dx = curX - baseX, dy = curY - baseY;
    const len = Math.hypot(dx, dy);
    if (len < 6) return { x: 0, y: 0 };
    const m = Math.min(len, STICK_R) / STICK_R;
    return { x: (dx / len) * m, y: (dy / len) * m };
  }
  return { x: 0, y: 0 };
}

export function isPausePressed() { return keys.has('escape'); }
