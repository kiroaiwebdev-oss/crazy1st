/* ============================================================
   CrazyGames SDK adapter
   - Loads the official SDK when on a CrazyGames domain.
   - Every call is wrapped so it is a SAFE NO-OP off-domain.
   - Ads / IAP are WIRED but DISABLED for Basic Launch (ADS_ENABLED=false).
     Reward callbacks still resolve so revive / chest / x2 flows work
     and can be QA-tested; on Full Launch flip ADS_ENABLED + the SDK
     will serve real ads via the exact same calls.
   ============================================================ */

// Flip to true ONLY for Full Launch (after graduation + SDK approval).
export const ADS_ENABLED = false;

import { duckForAd } from './audio.js';

const SDK_SRC = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

let sdk = null;            // window.CrazyGames.SDK when available
let available = false;     // true only on a real CrazyGames domain
let inited = false;

function getSDK() {
  try { return window.CrazyGames && window.CrazyGames.SDK ? window.CrazyGames.SDK : null; }
  catch { return null; }
}

/** Load + init the SDK. Always resolves (never blocks the game). */
export async function initSDK() {
  // Load script (best-effort, short timeout).
  await new Promise((resolve) => {
    if (getSDK()) return resolve();
    const s = document.createElement('script');
    s.src = SDK_SRC;
    s.async = true;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    s.onload = finish;
    s.onerror = finish;
    setTimeout(finish, 2500); // don't let a blocked CDN delay launch
    document.head.appendChild(s);
  });

  sdk = getSDK();
  if (sdk) {
    try {
      await sdk.init();
      // environment: 'crazygames' on-domain, 'disabled' elsewhere
      const env = (sdk.environment || (sdk.game && sdk.game.environment)) || 'disabled';
      available = env === 'crazygames';
      inited = true;
      if (available) loadingStart(); // begin the loading window (paired with loadingStop)
    } catch (e) {
      available = false;
    }
  }
  return available;
}

export function isAvailable() { return available; }

/* ---------- Loading API ---------- */
export function loadingStart() {
  if (!available) return;
  try { sdk.game.loadingStart(); } catch {}
}
export function loadingStop() {
  if (!available) return;
  try { sdk.game.loadingStop(); } catch {}
}

/* ---------- Gameplay markers (used to pause ads during play) ---------- */
export function gameplayStart() {
  if (!available) return;
  try { sdk.game.gameplayStart(); } catch {}
}
export function gameplayStop() {
  if (!available) return;
  try { sdk.game.gameplayStop(); } catch {}
}

/* ---------- Celebration ---------- */
export function happytime() {
  if (!available) return;
  try { sdk.game.happytime(); } catch {}
}

/* ---------- Ads ----------
   requestAd('midgame' | 'rewarded'). Returns a Promise<boolean> = reward granted.
   When ADS_ENABLED is false (Basic Launch) we resolve immediately so the
   reward logic is fully functional for testing without showing an ad. */
function fakeAdDelay(ok) {
  return new Promise((resolve) => setTimeout(() => resolve(ok), 350));
}

export function requestMidgame() {
  if (!ADS_ENABLED || !available) return fakeAdDelay(true);
  return new Promise((resolve) => {
    try {
      sdk.ad.requestAd('midgame', {
        adStarted: () => duckForAd(true),
        adFinished: () => { duckForAd(false); resolve(true); },
        adError: () => { duckForAd(false); resolve(false); },
      });
    } catch { duckForAd(false); resolve(false); }
  });
}

export function requestRewarded() {
  if (!ADS_ENABLED || !available) return fakeAdDelay(true);
  return new Promise((resolve) => {
    let rewarded = false;
    try {
      sdk.ad.requestAd('rewarded', {
        adStarted: () => duckForAd(true),
        adFinished: () => { duckForAd(false); resolve(rewarded || true); },
        rewardGranted: () => { rewarded = true; },
        adError: () => { duckForAd(false); resolve(false); },
      });
    } catch { duckForAd(false); resolve(false); }
  });
}

/* ---------- Banner (menus only on Full Launch) ---------- */
export function requestBanner(id) {
  if (!ADS_ENABLED || !available) return;
  try { sdk.banner.requestResponsiveBanner(id); } catch {}
}
export function clearBanners() {
  if (!available) return;
  try { sdk.banner.clearAllBanners(); } catch {}
}

/* ---------- Invite link (for "Beat my time" challenge) ---------- */
export function inviteLink(params) {
  if (available) {
    try { return sdk.game.inviteLink(params); } catch {}
  }
  // off-domain fallback: build a query-string link to the page
  const base = location.origin + location.pathname;
  const q = new URLSearchParams(params).toString();
  return base + (q ? '?' + q : '');
}
