// ═══════════════════════════════════════════════════════════════════
// DRUM — sample data, playback engine, canvas draw
// ═══════════════════════════════════════════════════════════════════

import { audio } from './audio.js';
import { seqSteps, seqR, drumLoopLen, setDrumLoopLen } from './state.js';

// seqEngine reference — injected by sequencer.js after init to avoid circular import
let seqEngine = { playing: false, drumDisplayStep: -1, displayStep: -1 };
export function setSeqEngineRef(ref) { seqEngine = ref; }

let _onGridMutate = null;
export function setDrumGridMutateCallback(fn) { _onGridMutate = fn; }

// syncSend reference — injected by main.js
let _syncSend = () => {};
export function setSyncSend(fn) { _syncSend = fn; }

export const DRUM_B64 = {};

export const DRUM_LABELS = {"bassdrum": "Kick", "snare": "Snare", "hat_closed": "Hi-Hat", "hat_open": "Open HH", "clap": "Clap", "rimshot": "Rim", "tom_h": "Tom H", "tom_m": "Tom M", "tom_l": "Tom L", "cymbal": "Cymbal", "cowbell": "Cowbell", "claves": "Claves"};
export const DRUM_KEYS = ["bassdrum", "snare", "hat_closed", "hat_open", "clap", "rimshot", "tom_h", "tom_m", "tom_l", "cymbal", "cowbell", "claves"];

function bankFromManifest(meta) {
  return {
    name: meta.name,
    keys: meta.keys.slice(),
    labels: { ...meta.labels },
    samples: {},
  };
}

export const DRUM_SOUND_BANKS = {
  Default: {
    name: 'Default',
    keys: DRUM_KEYS,
    labels: DRUM_LABELS,
    samples: {},
  },
};

export function syncDrumSoundBankManifest() {
  const manifest = window.DRUM_SOUND_BANK_MANIFEST || {};
  Object.keys(manifest).forEach(name => {
    if (!DRUM_SOUND_BANKS[name]) DRUM_SOUND_BANKS[name] = bankFromManifest(manifest[name]);
  });
  const existing = window.DRUM_SOUND_BANKS || {};
  Object.assign(DRUM_SOUND_BANKS, existing);
  window.DRUM_SOUND_BANKS = DRUM_SOUND_BANKS;
  return DRUM_SOUND_BANKS;
}

syncDrumSoundBankManifest();

export let activeDrumBank = 'Default';

export function activeBankDef()     { return DRUM_SOUND_BANKS[activeDrumBank]; }
export function activeBankAllKeys() { const b = activeBankDef(); return (b && b.keys) || DRUM_KEYS; }
export function activeBankLabels()  { const b = activeBankDef(); return (b && b.labels)  || DRUM_LABELS; }
export function activeBankSamples() { const b = activeBankDef(); return (b && b.samples) || DRUM_B64; }

export let activePads = activeBankAllKeys().slice(0, 8);

export function setActivePad(index, key) {
  activePads[index] = key;
  drumsReady = false;
  drumsLoading = false;
  invalidateBankKeys();
}

export function activeBankKeys() { return activePads; }
export const WORLD_RHYTHMS_DRUM = {
  'Clear': {},
  '4/4 Basic': {
    bassdrum:  [0, 8],
    snare:     [4, 12],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
  },
  'House': {
    bassdrum:  [0, 4, 8, 12],
    hat_closed:[2, 6, 10, 14],
    clap:      [4, 12],
  },
  'Hip-Hop': {
    bassdrum:  [0, 6, 10, 14],
    snare:     [4, 12],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    hat_open:  [3, 11],
  },
  'Funk': {
    bassdrum:  [0, 3, 8, 13],
    snare:     [4, 10, 12],
    hat_closed:[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    rimshot:   [6, 14],
  },
  'Afrobeat': {
    bassdrum:  [0, 3, 7, 10, 12],
    snare:     [4, 12],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    cowbell:   [2, 6, 10, 14],
    claves:    [0, 3, 6, 9, 12],
  },
  'Arabic Maqsum': {
    bassdrum:  [0, 6, 8],
    snare:     [4, 12],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    rimshot:   [2, 10],
  },
  'Sudanese (Dob)': {
    bassdrum:  [0, 5, 8, 13],
    snare:     [3, 11],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    cowbell:   [1, 4, 7, 10, 13],
  },
  'Indian Teentaal': {
    bassdrum:  [0, 4, 8, 12],
    snare:     [6, 14],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    rimshot:   [3, 7, 11, 15],
    claves:    [0, 2, 4, 6, 8, 10, 12, 14],
  },
  'Bossa Nova': {
    bassdrum:  [0, 6, 10],
    snare:     [3, 9, 13],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    rimshot:   [2, 5, 8, 11, 14],
  },
  'Reggae': {
    bassdrum:  [0, 9],
    snare:     [4, 12],
    hat_closed:[4, 12],
    rimshot:   [2, 6, 10, 14],
  },
  'Samba': {
    bassdrum:  [0, 4, 10, 12],
    snare:     [3, 7, 11, 15],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    rimshot:   [2, 6, 14],
    claves:    [0, 3, 6, 9, 12],
  },
  'Cumbia Colombiana': {
    bassdrum:  [0, 3, 8, 11],
    snare:     [4, 12],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    rimshot:   [2, 6, 10, 14],
    claves:    [0, 3, 6, 10, 13],
  },
  'Cumbia Sonidera': {
    bassdrum:  [0, 4, 8, 14],
    snare:     [3, 11],
    hat_closed:[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    rimshot:   [2, 5, 9, 13],
    claves:    [0, 3, 7, 10, 12],
    cowbell:   [0, 4, 8, 12],
  },
  'Cumbia Andina': {
    bassdrum:  [0, 6, 10, 12],
    snare:     [4, 10, 14],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    claves:    [0, 3, 6, 9, 12],
    cowbell:   [2, 5, 8, 11, 14],
  },
  'Salsa': {
    bassdrum:  [0, 3, 7, 10],
    snare:     [4, 12],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    claves:    [0, 3, 6, 10, 12],
    cowbell:   [0, 4, 8, 12],
    rimshot:   [2, 6, 9, 14],
  },
  'Reggaeton (Dembow)': {
    bassdrum:  [0, 4, 8, 12],
    snare:     [4, 10, 12],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    clap:      [4, 12],
    rimshot:   [6, 14],
  },
  'Vallenato': {
    bassdrum:  [0, 6, 10],
    snare:     [3, 9, 13],
    hat_closed:[0, 2, 4, 6, 8, 10, 12, 14],
    rimshot:   [1, 5, 9, 13],
    claves:    [0, 4, 8, 12],
  },
};


export const DRUM_GRID = {};
export let drumVelocity = 0.80;
export function setDrumVelocity(v) { drumVelocity = v; }
export const drumBuffers = {};
const bankBufferCache = new Map();
let loadCallbacks = [];
let activeLoadToken = 0;
let drumsReady = false;
let drumsLoading = false;

function requestDecodeSlot(fn) {
  const ric = window.requestIdleCallback || (cb => setTimeout(() => cb({ timeRemaining: () => 8 }), 1));
  ric(deadline => {
    if (deadline.timeRemaining && deadline.timeRemaining() < 4) {
      setTimeout(fn, 1);
    } else {
      fn();
    }
  });
}

function currentBankBufferCache() {
  if (!bankBufferCache.has(activeDrumBank)) bankBufferCache.set(activeDrumBank, new Map());
  return bankBufferCache.get(activeDrumBank);
}

function syncVisibleDrumBuffers(cache = currentBankBufferCache()) {
  Object.keys(drumBuffers).forEach(k => delete drumBuffers[k]);
  activeBankKeys().forEach(key => {
    const ab = cache.get(key);
    if (ab) drumBuffers[key] = ab;
  });
}

function finishDrumLoad(token, onDone) {
  if (token !== activeLoadToken) return;
  drumsReady = true;
  drumsLoading = false;
  syncVisibleDrumBuffers();
  if (onDone) onDone();
  const callbacks = loadCallbacks.splice(0);
  callbacks.forEach(fn => fn && fn());
}

function decodeBase64Sample(key, b64, token, cache) {
  return new Promise(resolve => {
    requestDecodeSlot(() => {
      if (token !== activeLoadToken) return resolve();
      try {
        const bin = atob(b64);
        const buf = new ArrayBuffer(bin.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
        audio.actx.decodeAudioData(buf).then(ab => {
          if (token === activeLoadToken) {
            cache.set(key, ab);
            if (activeBankKeys().includes(key)) drumBuffers[key] = ab;
          }
          resolve();
        }).catch(e => {
          console.warn('drum decode fail', key, e);
          resolve();
        });
      } catch (e) {
        console.warn('drum sample parse fail', key, e);
        resolve();
      }
    });
  });
}

function ensureActiveBankSamples() {
  syncDrumSoundBankManifest();
  const loadBankName = activeDrumBank === 'Default' && DRUM_SOUND_BANKS['Emu Drumulator']
    ? 'Emu Drumulator'
    : activeDrumBank;
  const canLoad = typeof window.loadDrumSoundBank === 'function' && DRUM_SOUND_BANKS[loadBankName];
  return canLoad
    ? window.loadDrumSoundBank(loadBankName).then(bank => {
        if (activeDrumBank === 'Default') {
          bank = { ...bank, name: 'Default', keys: DRUM_KEYS.slice(), labels: { ...DRUM_LABELS } };
        }
        Object.assign(DRUM_SOUND_BANKS[activeDrumBank], bank);
        return DRUM_SOUND_BANKS[activeDrumBank];
      })
    : Promise.resolve(activeBankDef());
}

export function loadDrumSamples(onDone) {
  if (drumsReady) { if (onDone) onDone(); return; }
  if (drumsLoading) { if (onDone) loadCallbacks.push(onDone); return; }
  drumsLoading = true;
  const token = ++activeLoadToken;
  audio._resume();
  ensureActiveBankSamples().then(() => {
    if (token !== activeLoadToken) return;
    const bankData = activeBankSamples();
    const bankKeys = activeBankKeys();
    const cache = currentBankBufferCache();
    syncVisibleDrumBuffers(cache);
    const missingKeys = bankKeys.filter(key => !cache.has(key));
    if (!missingKeys.length) { finishDrumLoad(token, onDone); return; }
    const priorityKeys = missingKeys.filter(key => /bass|kick|snare|hat|clap/i.test(key));
    const restKeys = missingKeys.filter(key => !priorityKeys.includes(key));
    priorityKeys.concat(restKeys)
      .reduce((chain, key) => chain.then(() => {
        const b64 = bankData[key] || DRUM_B64[key];
        return b64 ? decodeBase64Sample(key, b64, token, cache) : Promise.resolve();
      }), Promise.resolve())
      .then(() => finishDrumLoad(token, onDone));
  }).catch(e => {
    console.warn('drum bank load failed', activeDrumBank, e);
    if (token === activeLoadToken) {
      drumsLoading = false;
      if (onDone) onDone();
    }
  });
}


export function reloadDrumBank(bankName, onDone) {
  activeLoadToken++;
  Object.keys(drumBuffers).forEach(k => delete drumBuffers[k]);
  syncDrumSoundBankManifest();
  activeDrumBank = bankName;
  const allKeys = (DRUM_SOUND_BANKS[bankName] && DRUM_SOUND_BANKS[bankName].keys) || DRUM_KEYS;
  activePads = allKeys.slice(0, 8);
  invalidateBankKeys();
  drumsReady = false;
  drumsLoading = false;
  syncVisibleDrumBuffers(currentBankBufferCache());
  loadDrumSamples(onDone);
}


// Cached bank keys for the hot audio path — invalidated whenever the active
// bank or pad layout changes. Avoids repeated function calls inside _tick().
let _bankKeysCache  = null;
let _bankKeysDirty  = true;
export function invalidateBankKeys() { _bankKeysDirty = true; }
function _getBankKeys() {
  if (_bankKeysDirty) { _bankKeysCache = activeBankKeys(); _bankKeysDirty = false; }
  return _bankKeysCache;
}

function _drmCurrentLoopCount() {
  if (!seqEngine.playing) return 0;
  return seqEngine.getTransportSnapshot().drumLoopCount;
}

export function drumPlayStep(step, time, loopCount = 0) {
  if (!audio.enabled) return;
  const keys    = _getBankKeys();
  const actxNow = audio.actx.currentTime;
  for (let i = 0; i < keys.length; i++) {
    const key     = keys[i];
    const cellVal = DRUM_GRID[key + '_' + step];
    if (!cellVal) continue;
    const cellN = typeof cellVal === 'object' ? cellVal.n : 1;
    const cellO = typeof cellVal === 'object' ? cellVal.o : 0;
    if (cellN > 1 && loopCount % cellN !== cellO) continue;
    const ab = drumBuffers[key];
    if (!ab) continue;
    const src = audio.actx.createBufferSource();
    src.buffer = ab;
    const g = audio.actx.createGain();
    g.gain.value = drumVelocity;
    src.connect(g);
    g.connect(audio.drumBus);
    src.start(Math.max(time, actxNow + 0.001));
  }
}



const drumCanvas = document.getElementById('drum-canvas');
const drumCtx = drumCanvas.getContext('2d');

let _drmCacheW = 0, _drmCacheH = 0, _drmCacheDpr = 0;
new ResizeObserver(() => { _drmCacheW = 0; }).observe(drumCanvas.parentElement);

let _drmDrawPending = false;
export function scheduleDrmDraw() {
  if (_drmDrawPending) return;
  _drmDrawPending = true;
  requestAnimationFrame(() => { _drmDrawPending = false; drawDrumMachine(); });
}

export function drawDrumMachine() {
  const wrap = drumCanvas.parentElement;
  const DPR = window.devicePixelRatio || 1;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (W === 0 || H === 0) return;
  if (W !== _drmCacheW || H !== _drmCacheH || DPR !== _drmCacheDpr) {
    _drmCacheW = W; _drmCacheH = H; _drmCacheDpr = DPR;
    drumCanvas.width  = W * DPR; drumCanvas.height = H * DPR;
    drumCanvas.style.width = W + 'px'; drumCanvas.style.height = H + 'px';
  }
  drumCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const bankKeys   = activeBankKeys();
  const bankLabels = activeBankLabels();
  const n = bankKeys.length;
  const steps = seqSteps();
  const spb = seqR().spb;
  const LM = 48;
  const gW = (W - LM) / steps;
  const gH = H / n;

  drumCtx.fillStyle = '#060410';
  drumCtx.fillRect(0, 0, W, H);
  drumCtx.fillStyle = 'rgba(255,255,255,0.022)';
  drumCtx.fillRect(0, 0, LM, H);

  // Smooth loop phase for blink animation
  const drmLoop = Math.max(1, Math.min(drumLoopLen, steps));
  const transport = seqEngine.playing ? seqEngine.getTransportSnapshot() : null;
  const drmLoopPhase = transport?.drumLoopPhase ?? 0;
  const drmLoopCount = transport?.drumLoopCount ?? 0;

  bankKeys.forEach((key, row) => {
    const y = row * gH;
    const isKick  = key.startsWith('bassdrum');
    const isSnare = key.startsWith('snare');
    const labelColor = isKick ? '#fb923c' : isSnare ? '#a78bfa' : 'rgba(255,255,255,0.45)';

    const fs = Math.max(Math.min(Math.floor(gH * 0.48), 10), 7);
    drumCtx.font = `${fs}px system-ui`;
    drumCtx.textAlign = 'center'; drumCtx.textBaseline = 'middle';
    drumCtx.fillStyle = labelColor;
    drumCtx.fillText(bankLabels[key] || key, LM / 2, y + gH / 2);

    for (let st = 0; st < steps; st++) {
      const x        = LM + st * gW;
      const cellVal  = DRUM_GRID[key + '_' + st];
      const active   = !!cellVal;
      const cycleN   = typeof cellVal === 'object' ? cellVal.n : 1;
      const cellO    = typeof cellVal === 'object' ? cellVal.o : 0;
      const drumStep = seqEngine.drumDisplayStep ?? seqEngine.displayStep;
      const isCur    = st === drumStep && seqEngine.playing;
      const isBeat   = Number.isInteger(st / spb) || Math.abs(st % spb) < 0.001;
      const isBar    = Math.abs(st % (spb * 4)) < 0.001;

      // Base colours kept from original drum palette
      const brightCur  = isKick ? 'rgba(251,146,60,0.92)'  : isSnare ? 'rgba(167,139,250,0.92)' : 'rgba(96,165,250,0.92)';
      const brightBase = isKick ? '251,146,60' : isSnare ? '167,139,250' : '96,165,250';
      const brightFull = isKick ? 'rgba(251,146,60,0.78)'  : isSnare ? 'rgba(167,139,250,0.72)' : 'rgba(96,165,250,0.68)';

      let fill;
      if (active && cycleN > 1) {
        const numBlinks  = cycleN - 1;
        const isActiveLp = drmLoopCount % cycleN === cellO;
        if (isCur) {
          fill = brightCur;
        } else if (!seqEngine.playing) {
          fill = `rgba(${brightBase},0.55)`;
        } else if (isActiveLp) {
          const b = _drmBlinkValue(drmLoopPhase, numBlinks);
          fill = `rgba(${brightBase},${(0.30 + b * 0.48).toFixed(2)})`;
        } else {
          const b = _drmBlinkValue(drmLoopPhase, numBlinks);
          fill = `rgba(${brightBase},${(0.10 + b * 0.09).toFixed(2)})`;
        }
      } else if (active && isCur) {
        fill = brightCur;
      } else if (active) {
        fill = brightFull;
      } else if (isCur) {
        fill = 'rgba(255,255,255,0.14)';
      } else if (isBar) {
        fill = 'rgba(255,255,255,0.065)';
      } else if (isBeat) {
        fill = 'rgba(255,255,255,0.038)';
      } else {
        fill = 'rgba(255,255,255,0.016)';
      }

      drumCtx.fillStyle = fill;
      drumCtx.fillRect(x + 0.5, y + 0.5, gW - 1, gH - 1);
    }
  });

  // Vertical lines
  for (let st = 0; st <= steps; st++) {
    const x = LM + st * gW;
    const isBar  = Math.abs(st % (spb * 4)) < 0.001;
    const isBeat = Number.isInteger(st / spb) || Math.abs(st % spb) < 0.001;
    drumCtx.beginPath(); drumCtx.moveTo(x, 0); drumCtx.lineTo(x, H);
    drumCtx.strokeStyle = isBar ? 'rgba(255,255,255,0.24)' : isBeat ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
    drumCtx.lineWidth = 1; drumCtx.stroke();
  }
  // Horizontal lines
  for (let row = 0; row <= n; row++) {
    const y = row * gH;
    drumCtx.beginPath(); drumCtx.moveTo(LM, y); drumCtx.lineTo(W, y);
    drumCtx.strokeStyle = 'rgba(255,255,255,0.06)'; drumCtx.lineWidth = 1; drumCtx.stroke();
  }
  // Label separator
  drumCtx.beginPath(); drumCtx.moveTo(LM, 0); drumCtx.lineTo(LM, H);
  drumCtx.strokeStyle = 'rgba(255,255,255,0.12)'; drumCtx.lineWidth = 1; drumCtx.stroke();

  // Loop length overlay — dim steps outside active drum loop
  const loopEndX = LM + drmLoop * gW;
  if (drmLoop < steps) {
    drumCtx.fillStyle = 'rgba(0,0,0,0.45)';
    drumCtx.fillRect(loopEndX, 0, W - loopEndX, H);
    drumCtx.beginPath(); drumCtx.moveTo(loopEndX, 0); drumCtx.lineTo(loopEndX, H);
    drumCtx.strokeStyle = 'rgba(251,146,60,0.6)'; drumCtx.lineWidth = 2; drumCtx.stroke();
  }
  // Loop handle bar — always drawn at top of grid
  const DRM_BAR_H = 14;
  drumCtx.fillStyle = 'rgba(251,146,60,0.12)';
  drumCtx.fillRect(LM, 0, W - LM, DRM_BAR_H);
  drumCtx.fillStyle = 'rgba(251,146,60,0.58)';
  drumCtx.fillRect(LM, 0, drmLoop * gW, DRM_BAR_H);
  drumCtx.fillStyle = '#fb923c';
  drumCtx.fillRect(loopEndX - 6, 0, 12, DRM_BAR_H);
  drumCtx.fillStyle = 'rgba(0,0,0,0.80)';
  drumCtx.font = `bold 9px system-ui`;
  drumCtx.textAlign = 'center'; drumCtx.textBaseline = 'middle';
  drumCtx.fillText(drmLoop, loopEndX, DRM_BAR_H / 2);
}

// ── Drum tap / long-press handler ────────────────────────────────────
// 1 tap → toggle; 2/3/4 taps → cycle every 2/3/4 loops (phase-anchored)
// Long press (600 ms) → reset (turn off)

function _drmBlinkValue(loopPhase, numBlinks) {
  if (numBlinks <= 0) return 0;
  let v = 0;
  const hw = 0.38 / numBlinks;
  for (let b = 0; b < numBlinks; b++) {
    const center = (b + 0.5) / numBlinks;
    let dt = Math.abs(loopPhase - center);
    if (dt > 0.5) dt = 1 - dt;
    if (dt < hw) { const t = 1 - dt / hw; v = Math.max(v, t * t * (3 - 2 * t)); }
  }
  return v;
}

// ── Drum loop handle drag state ──────────────────────────────────────
let _drmLoopDragActive = false, _drmLoopDragPtrId = -1;

function _updateDrmLoopFromX(clientX) {
  const rect = drumCanvas.getBoundingClientRect();
  const W = drumCanvas.clientWidth;
  const steps = seqSteps();
  const LM = 48;
  const gW = (W - LM) / steps;
  const px = clientX - rect.left;
  const newLen = Math.max(1, Math.min(steps, Math.round((px - LM) / gW)));
  if (newLen !== drumLoopLen) {
    setDrumLoopLen(newLen);
    _syncSend({ type: 'SEQ_PARAM', drumLoopLen: newLen });
    scheduleDrmDraw();
  }
}

let _drmTapKey = null, _drmTapCount = 0, _drmTapTimer = null;
let _drmLpTimer = null, _drmLpStartX = 0, _drmLpStartY = 0;

function _drmCell(e) {
  const rect = drumCanvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const W = drumCanvas.clientWidth, H = drumCanvas.clientHeight;
  const bKeys = activeBankKeys();
  const n = bKeys.length;
  if (px < 48 || n === 0) return null;
  const gW = (W - 48) / seqSteps(), gH = H / n;
  const st  = Math.floor((px - 48) / gW);
  const row = Math.floor(py / gH);
  if (st < 0 || st >= seqSteps() || row < 0 || row >= n) return null;
  return bKeys[row] + '_' + st;
}

drumCanvas.addEventListener('contextmenu', e => e.preventDefault());

drumCanvas.addEventListener('pointerdown', e => {
  // Top 16px → drum loop handle drag zone
  const rect = drumCanvas.getBoundingClientRect();
  const py = e.clientY - rect.top;
  if (py < 16) {
    _drmLoopDragActive = true;
    _drmLoopDragPtrId = e.pointerId;
    drumCanvas.setPointerCapture(e.pointerId);
    _updateDrmLoopFromX(e.clientX);
    return;
  }

  const key = _drmCell(e);
  if (!key) return;
  _drmLpStartX = e.clientX; _drmLpStartY = e.clientY;
  clearTimeout(_drmLpTimer);
  _drmLpTimer = setTimeout(() => {
    _drmLpTimer = null;
    clearTimeout(_drmTapTimer); _drmTapKey = null; _drmTapCount = 0;
    if (DRUM_GRID[key]) {
      delete DRUM_GRID[key];
      _syncSend({ type: 'DRUM_SET', key, val: false });
      scheduleDrmDraw();
      if (_onGridMutate) _onGridMutate();
    }
  }, 600);
});

drumCanvas.addEventListener('pointermove', e => {
  if (_drmLoopDragActive && e.pointerId === _drmLoopDragPtrId) {
    _updateDrmLoopFromX(e.clientX);
    return;
  }
  if (_drmLpTimer && (Math.abs(e.clientX - _drmLpStartX) > 10 || Math.abs(e.clientY - _drmLpStartY) > 10)) {
    clearTimeout(_drmLpTimer); _drmLpTimer = null;
  }
});

drumCanvas.addEventListener('pointercancel', e => {
  if (e.pointerId === _drmLoopDragPtrId) _drmLoopDragActive = false;
});

drumCanvas.addEventListener('pointerup', e => {
  if (_drmLoopDragActive && e.pointerId === _drmLoopDragPtrId) {
    _drmLoopDragActive = false;
    return;
  }
  if (!_drmLpTimer) return;
  clearTimeout(_drmLpTimer); _drmLpTimer = null;
  const key = _drmCell(e);
  if (!key) return;

  clearTimeout(_drmTapTimer);

  if (_drmTapKey === key) {
    _drmTapCount = Math.min(_drmTapCount + 1, 4);
    const lc  = _drmCurrentLoopCount();
    const val = { n: _drmTapCount, o: lc % _drmTapCount };
    DRUM_GRID[key] = val;
    _syncSend({ type: 'DRUM_SET', key, val });
  } else {
    _drmTapKey = key; _drmTapCount = 1;
    if (DRUM_GRID[key]) { delete DRUM_GRID[key]; _syncSend({ type: 'DRUM_SET', key, val: false }); }
    else                { DRUM_GRID[key] = 1;    _syncSend({ type: 'DRUM_SET', key, val: 1    }); }
  }

  scheduleDrmDraw();
  if (_onGridMutate) _onGridMutate();
  if (_drmTapCount >= 4) { _drmTapKey = null; _drmTapCount = 0; return; }
  _drmTapTimer = setTimeout(() => { _drmTapKey = null; _drmTapCount = 0; }, 350);
});


export function loadWorldRhythm(name) {
  const pat = WORLD_RHYTHMS_DRUM[name];
  if (!pat) return;
  const steps = seqSteps();
  const keysToClear = [...new Set([...DRUM_KEYS, ...activePads])];
  keysToClear.forEach(key => {
    for (let st = 0; st < steps; st++) delete DRUM_GRID[key + '_' + st];
  });
  if (name === 'Clear') {
    setDrumLoopLen(steps);
    scheduleDrmDraw(); return;
  }
  Object.keys(pat).forEach(key => {
    const hits = pat[key];
    if (!hits) return;
    hits.forEach(h => {
      const mapped = Math.round(h * steps / 16);
      if (mapped < steps) DRUM_GRID[key + '_' + mapped] = true;
    });
  });
  setDrumLoopLen(steps);
  scheduleDrmDraw();
}

