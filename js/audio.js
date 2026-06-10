/* ============================================================
   Procedural audio (WebAudio) — zero asset bytes.
   Tiny synth blips for shoot / hit / pickup / level / boss / fuse.
   ============================================================ */
let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

// Browsers require a user gesture to start audio.
export function unlock() {
  ensure();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export function isMuted() { return muted; }

// Suspend/resume audio during ad playback (CrazyGames requires game audio
// to be muted while an ad plays). Does not change the user's mute preference.
export function duckForAd(on) {
  if (!ctx) return;
  try { if (on) ctx.suspend(); else if (!muted) ctx.resume(); } catch {}
}

function blip({ freq = 440, type = 'square', dur = 0.08, vol = 0.3, slide = 0, delay = 0 }) {
  if (!ensure() || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.18, vol = 0.25, delay = 0, lp = 1200 }) {
  if (!ensure() || muted) return;
  const t0 = ctx.currentTime + delay;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

// throttle shoot sound so dense fire doesn't clip
let lastShoot = 0;
export const SFX = {
  shoot() {
    const now = performance.now();
    if (now - lastShoot < 55) return;
    lastShoot = now;
    blip({ freq: 720, type: 'square', dur: 0.05, vol: 0.12, slide: -260 });
  },
  hit()    { blip({ freq: 220, type: 'sawtooth', dur: 0.05, vol: 0.10, slide: -80 }); },
  kill()   { noise({ dur: 0.12, vol: 0.10, lp: 900 }); },
  pickup() { blip({ freq: 880, type: 'sine', dur: 0.06, vol: 0.12, slide: 220 }); },
  coin()   { blip({ freq: 1040, type: 'sine', dur: 0.07, vol: 0.14, slide: 320 }); },
  hurt()   { blip({ freq: 180, type: 'sawtooth', dur: 0.18, vol: 0.28, slide: -90 }); noise({ dur: 0.16, vol: 0.18, lp: 700 }); },
  level()  { [523, 659, 784, 1046].forEach((f, i) => blip({ freq: f, type: 'triangle', dur: 0.12, vol: 0.2, delay: i * 0.06 })); },
  fuse()   { [392, 523, 784, 1175].forEach((f, i) => blip({ freq: f, type: 'sawtooth', dur: 0.14, vol: 0.22, delay: i * 0.05, slide: 120 })); },
  boss()   { blip({ freq: 80, type: 'sawtooth', dur: 0.6, vol: 0.34, slide: 40 }); noise({ dur: 0.5, vol: 0.2, lp: 400 }); },
  bossDie(){ [659, 523, 392, 261].forEach((f, i) => blip({ freq: f, type: 'triangle', dur: 0.18, vol: 0.26, delay: i * 0.08 })); noise({ dur: 0.4, vol: 0.22, lp: 1400 }); },
  click()  { blip({ freq: 600, type: 'square', dur: 0.04, vol: 0.14 }); },
  death()  { [392, 311, 233, 150].forEach((f, i) => blip({ freq: f, type: 'sawtooth', dur: 0.3, vol: 0.26, delay: i * 0.12, slide: -40 })); },
};
