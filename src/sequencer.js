// ═══════════════════════════════════════════════════════════════════
// SEQUENCER ENGINE
// ═══════════════════════════════════════════════════════════════════

import { audio } from './audio.js';
import {
  S, SEQ, getScale, seqR, seqStepDur, seqSteps,
  epochMs, peerEpochMs, masterBpm, syncTempoRatio, drumLoopLen,
  setEpochMs, setPeerEpochMs, setMasterBpm,
} from './state.js';
import { CHROMATIC, MAQAM_CENTS } from './data.js';
import { drumPlayStep, drawDrumMachine, scheduleDrmDraw } from './drum.js';
import { sharedNow } from './sync.js';

// ── Injected callbacks ──────────────────────────────────────────────

let _draw            = () => {};
let _syncSend        = () => {};
let _syncGetFullState= () => ({});
let _syncPlayUI      = (state) => {
  const play  = document.getElementById('btn-seq-play');
  const pause = document.getElementById('btn-seq-pause');
  const stop  = document.getElementById('btn-seq-stop');
  if (play)  play.style.display  = state === 'playing' ? 'none' : '';
  if (pause) pause.style.display = state === 'playing' ? '' : 'none';
  if (stop)  stop.style.display  = state !== 'stopped' ? '' : 'none';
};
let _stopMidiPlayer  = () => {};
let _drawFretboard   = () => {};

export function setDrawCallback(fn)         { _draw             = fn; }
export function setSyncSend(fn)             { _syncSend         = fn; }
export function setSyncGetFullState(fn)     { _syncGetFullState = fn; }
export function setSyncPlayUI(fn)           { _syncPlayUI       = fn; }
export function setStopMidiPlayer(fn)       { _stopMidiPlayer   = fn; }
export function setDrawFretboardCallback(fn){ _drawFretboard    = fn; }

// ── Canvas ──────────────────────────────────────────────────────────

const seqCanvas = document.getElementById('seq-canvas');
const seqCtx    = seqCanvas.getContext('2d');

// ── Sequencer engine ────────────────────────────────────────────────

export const seqEngine = {
  playing: false,
  paused: false,
  _pausedStep: -1,
  step: 0,
  _absStep: 0,
  nextTime: 0,
  startTime: 0,
  displayStep: -1,
  drumDisplayStep: -1,
  _ivl: null,
  _raf: null,

  _playStep(step, time, loopCount) {
    const scale = getScale();
    const n = scale.length;
    if (n === 0) return;
    const rootHz  = 261.62556 * Math.pow(2, S.root / 12) * Math.pow(2, S.octave - 4);
    const noteDur = Math.max(seqStepDur() * SEQ.gate, 0.04);

    for (let si = 0; si < n; si++) {
      const cellVal = SEQ.grid[`${si}_${step}`];
      if (!cellVal) continue;
      const cellN = typeof cellVal === 'object' ? cellVal.n : 1;
      const cellO = typeof cellVal === 'object' ? cellVal.o : 0;
      if (cellN > 1 && loopCount % cellN !== cellO) continue;
      let freq;
      if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) {
        const cents = MAQAM_CENTS[S.scaleName][si] ?? 0;
        freq = rootHz * Math.pow(2, cents / 1200);
      } else {
        freq = audio.degreeFreq(S.root, scale[si], S.temp, S.octave);
      }
      audio._playHz(freq, Math.max(time - audio.actx.currentTime, 0), noteDur, 0.72);
    }
  },

  _tick() {
    const LOOK    = 0.15;
    const dur     = seqStepDur();
    const melLoop = Math.max(1, Math.min(SEQ.loopLen,  seqSteps()));
    const drmLoop = Math.max(1, Math.min(drumLoopLen,  seqSteps()));
    const loopLen = Math.max(melLoop, drmLoop);
    const now     = audio.actx.currentTime;

    if (epochMs !== null) {
      const worldNow  = sharedNow();
      const elapsed   = (worldNow - epochMs) / 1000;

      const globalStep     = Math.max(0, Math.floor(elapsed / dur));
      this.displayStep     = globalStep % melLoop;
      this.drumDisplayStep = globalStep % drmLoop;

      if (this._barJoining) {
        const nextBarStep   = Math.ceil((globalStep + 1) / loopLen) * loopLen;
        const nextBarAudioT = now + (epochMs + nextBarStep * dur * 1000 - worldNow) / 1000;
        if (nextBarAudioT <= now + LOOK) {
          this._barJoining = false;
          this._lastSched  = nextBarStep - 1;
        }
        return;
      }

      if (this._lastSched === undefined) this._lastSched = globalStep - 1;

      for (let guard = 0; guard < 32; guard++) {
        const stepIdx = this._lastSched + 1;
        const audioT  = now + (epochMs + stepIdx * dur * 1000 - worldNow) / 1000;
        if (audioT > now + LOOK) break;
        if (audioT < now - 0.05) { this._lastSched = stepIdx; continue; }
        this._playStep(stepIdx % melLoop, audioT, Math.floor(stepIdx / melLoop));
        drumPlayStep(stepIdx % drmLoop,   audioT, Math.floor(stepIdx / drmLoop));
        this._lastSched = stepIdx;
      }

    } else {
      const melDur = melLoop * dur;
      const drmDur = drmLoop * dur;
      while (this.nextTime < now + LOOK) {
        const abs = this._absStep;
        this._playStep(abs % melLoop, this.nextTime, Math.floor(abs / melLoop));
        drumPlayStep(abs % drmLoop,   this.nextTime, Math.floor(abs / drmLoop));
        this.nextTime += dur;
        this._absStep++;
        this.step = this._absStep % loopLen;
      }
      const e              = now - this.startTime;
      this.displayStep     = e < 0 ? 0 : Math.floor((e % melDur) / dur) % melLoop;
      this.drumDisplayStep = e < 0 ? 0 : Math.floor((e % drmDur) / dur) % drmLoop;
    }
  },

  play(remoteEpochMs = null) {
    clearInterval(this._ivl);
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    _stopMidiPlayer();
    audio._resume();
    this.playing = true;
    this.paused  = false;

    if (remoteEpochMs !== null) {
      setEpochMs(remoteEpochMs);
      this._lastSched  = undefined;
      this._pausedStep = -1;
      this._absStep    = 0;
    } else if (this._pausedStep >= 0) {
      // Resume from pause — rebuild epoch so playback continues from the frozen step
      setEpochMs(sharedNow() - this._pausedStep * seqStepDur() * 1000);
      this._lastSched  = this._pausedStep - 1;
      this._absStep    = this._pausedStep;
      this._pausedStep = -1;
      _syncSend({ type: 'PLAY', epochMs, masterBpm, ..._syncGetFullState() });
    } else if (peerEpochMs !== null) {
      setEpochMs(peerEpochMs);
      this._barJoining = true;
      this._lastSched  = undefined;
      this._absStep    = 0;
      _syncSend({ type: 'JOINED', epochMs, masterBpm, ..._syncGetFullState() });
    } else {
      setEpochMs(sharedNow());
      setMasterBpm(SEQ.bpm);
      this._lastSched = -1;
      this._absStep   = 0;
      _syncSend({ type: 'PLAY', epochMs, masterBpm, ..._syncGetFullState() });
    }

    this._ivl = setInterval(() => {
      if (this.playing) { try { this._tick(); } catch(e) { console.error('[seq] _tick error:', e); } }
    }, 20);
    const raf = () => {
      if (!this.playing) return;
      drawSequencer();
      drawDrumMachine();
      _draw();
      this._raf = requestAnimationFrame(raf);
    };
    this._raf = requestAnimationFrame(raf);
    _syncPlayUI('playing');
  },

  pause() {
    if (!this.playing) return;
    this.playing     = false;
    this.paused      = true;
    this._pausedStep = this.displayStep;
    clearInterval(this._ivl);
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    _syncPlayUI('paused');
    scheduleDrawSequencer();
    scheduleDrmDraw();
  },

  stop(fromRemote = false) {
    this.playing      = false;
    this.paused       = false;
    this._pausedStep  = -1;
    this._barJoining  = false;
    this._lastSched   = undefined;
    clearInterval(this._ivl);
    if (this._raf) cancelAnimationFrame(this._raf);
    this.displayStep      = -1;
    this.drumDisplayStep  = -1;
    setEpochMs(null);
    setPeerEpochMs(null);
    if (!fromRemote) _syncSend({ type: 'STOP' });
    _syncPlayUI('stopped');
    scheduleDrawSequencer();
    scheduleDrmDraw();
  },

  rebase(fromRemote = false) {
    if (!this.playing) return;
    if (!fromRemote) {
      setEpochMs(sharedNow() - this.displayStep * seqStepDur() * 1000);
      setMasterBpm(Math.round(SEQ.bpm / syncTempoRatio));
      _syncSend({ type: 'REBASE', epochMs, masterBpm, rhythmKey: SEQ.rhythmKey, loopLen: SEQ.loopLen });
    }
    const globalStep = Math.max(0, Math.floor((sharedNow() - epochMs) / 1000 / seqStepDur()));
    this._lastSched  = globalStep - 1;
  },
};

// ── Canvas draw ─────────────────────────────────────────────────────

let _seqFbLastStep = -1;

// Cached canvas dimensions — only reassign canvas.width/height on actual resize.
// Reassigning canvas.width resets all canvas state (transform, styles) and forces
// a full GPU texture realloc, which is expensive and unnecessary every frame.
let _seqCacheW = 0, _seqCacheH = 0, _seqCacheDpr = 0;
new ResizeObserver(() => { _seqCacheW = 0; }).observe(seqCanvas.parentElement);

// Deferred draw: coalesces multiple synchronous calls (e.g. from click handlers)
// into a single RAF callback so _tick() is never blocked by a redraw.
let _seqDrawPending = false;
export function scheduleDrawSequencer() {
  if (_seqDrawPending) return;
  _seqDrawPending = true;
  requestAnimationFrame(() => { _seqDrawPending = false; drawSequencer(); });
}

// Returns 0–1 brightness for a smooth multi-pulse blink at the given loop phase.
// numBlinks pulses are spread evenly across the loop; each is a quadratic ease bump.
function _blinkValue(loopPhase, numBlinks) {
  if (numBlinks <= 0) return 0;
  let v = 0;
  const hw = 0.38 / numBlinks; // half-width of each pulse
  for (let b = 0; b < numBlinks; b++) {
    const center = (b + 0.5) / numBlinks;
    let dt = Math.abs(loopPhase - center);
    if (dt > 0.5) dt = 1 - dt; // wrap around loop boundary
    if (dt < hw) {
      const t = 1 - dt / hw; // 1 at peak, 0 at edge
      v = Math.max(v, t * t * (3 - 2 * t)); // smoothstep
    }
  }
  return v;
}

const CYCLE_RGB = ['', '', '52,211,153', '251,146,60', '244,114,182'];

export function drawSequencer() {
  const wrap = seqCanvas.parentElement;
  const DPR  = window.devicePixelRatio || 1;
  const W    = wrap.clientWidth, H = wrap.clientHeight;
  if (W === 0 || H === 0) return;
  if (W !== _seqCacheW || H !== _seqCacheH || DPR !== _seqCacheDpr) {
    _seqCacheW = W; _seqCacheH = H; _seqCacheDpr = DPR;
    seqCanvas.width  = W * DPR; seqCanvas.height = H * DPR;
    seqCanvas.style.width = W + 'px'; seqCanvas.style.height = H + 'px';
  }
  seqCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const scale = getScale();
  const n     = scale.length;
  const steps = seqSteps();
  const spb   = seqR().spb;
  const LM    = 30;
  const gW    = (W - LM) / steps;
  const gH    = H / Math.max(n, 1);

  seqCtx.fillStyle = '#070512';
  seqCtx.fillRect(0, 0, W, H);
  seqCtx.fillStyle = 'rgba(255,255,255,0.022)';
  seqCtx.fillRect(0, 0, LM, H);

  if (n === 0) return;

  // Smooth loop phase (0–1) and absolute loop count — used for blink animation
  const melLoop = Math.max(1, Math.min(SEQ.loopLen, steps));
  let loopPhase = 0, loopCount = 0;
  if (seqEngine.playing && epochMs !== null) {
    const loopDurMs = melLoop * seqStepDur() * 1000;
    const elapsed   = sharedNow() - epochMs;
    const absLoop   = Math.max(0, elapsed) / loopDurMs;
    loopCount = Math.floor(absLoop);
    loopPhase = absLoop % 1;
  }

  for (let row = 0; row < n; row++) {
    const si      = n - 1 - row;
    const y       = row * gH;
    const noteIdx = (scale[si] + S.root) % 12;
    const isRoot  = si === 0;

    if (isRoot) { seqCtx.fillStyle = 'rgba(245,158,11,0.05)'; seqCtx.fillRect(LM, y, W - LM, gH); }

    const fs = Math.max(Math.min(Math.floor(gH * 0.52), 11), 7);
    seqCtx.font = `bold ${fs}px system-ui`;
    seqCtx.textAlign = 'center'; seqCtx.textBaseline = 'middle';
    seqCtx.fillStyle = isRoot ? '#f59e0b' : 'rgba(167,139,250,0.7)';
    seqCtx.fillText(CHROMATIC[noteIdx], LM / 2, y + gH / 2);

    for (let st = 0; st < steps; st++) {
      const x       = LM + st * gW;
      const cellVal = SEQ.grid[`${si}_${st}`];
      const active  = !!cellVal;
      const cycleN  = typeof cellVal === 'object' ? cellVal.n : 1;
      const isCur   = st === seqEngine.displayStep && seqEngine.playing;
      const isBeat  = Number.isInteger(st / spb) || Math.abs(st % spb) < 0.001;
      const isBar   = Math.abs(st % (spb * 4)) < 0.001;

      const cellO   = typeof cellVal === 'object' ? cellVal.o : 0;

      let fill;
      if (active && cycleN > 1) {
        const rgb         = CYCLE_RGB[Math.min(cycleN, 4)];
        const numBlinks   = cycleN - 1;
        const isActiveLp  = loopCount % cycleN === cellO;
        if (isCur) {
          fill = 'rgba(245,158,11,0.92)';
        } else if (!seqEngine.playing) {
          fill = `rgba(${rgb},0.55)`;
        } else if (isActiveLp) {
          // Playing loop: blink numBlinks times, alpha sweeps 0.35 → 0.82
          const b = _blinkValue(loopPhase, numBlinks);
          fill = `rgba(${rgb},${(0.35 + b * 0.47).toFixed(2)})`;
        } else {
          // Skip loop: darkened with very subtle blink rhythm
          const b = _blinkValue(loopPhase, numBlinks);
          fill = `rgba(${rgb},${(0.12 + b * 0.09).toFixed(2)})`;
        }
      } else if (active && isCur) {
        fill = 'rgba(245,158,11,0.92)';
      } else if (active) {
        fill = 'rgba(167,139,250,0.80)';
      } else if (isCur) {
        fill = 'rgba(255,255,255,0.16)';
      } else if (isBar) {
        fill = 'rgba(255,255,255,0.065)';
      } else if (isBeat) {
        fill = 'rgba(255,255,255,0.038)';
      } else {
        fill = 'rgba(255,255,255,0.016)';
      }

      seqCtx.fillStyle = fill;
      seqCtx.fillRect(x + 0.5, y + 0.5, gW - 1, gH - 1);
    }
  }

  for (let st = 0; st <= steps; st++) {
    const x      = LM + st * gW;
    const isBar  = Math.abs(st % (spb * 4)) < 0.001;
    const isBeat = Number.isInteger(st / spb) || Math.abs(st % spb) < 0.001;
    seqCtx.beginPath(); seqCtx.moveTo(x, 0); seqCtx.lineTo(x, H);
    seqCtx.strokeStyle = isBar ? 'rgba(255,255,255,0.24)' : isBeat ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
    seqCtx.lineWidth = 1; seqCtx.stroke();
  }
  for (let row = 0; row <= n; row++) {
    const y = row * gH;
    seqCtx.beginPath(); seqCtx.moveTo(LM, y); seqCtx.lineTo(W, y);
    seqCtx.strokeStyle = 'rgba(255,255,255,0.07)'; seqCtx.lineWidth = 1; seqCtx.stroke();
  }
  seqCtx.beginPath(); seqCtx.moveTo(LM, 0); seqCtx.lineTo(LM, H);
  seqCtx.strokeStyle = 'rgba(255,255,255,0.14)'; seqCtx.lineWidth = 1; seqCtx.stroke();

  const loopLen = Math.max(1, Math.min(SEQ.loopLen, steps));
  if (loopLen < steps) {
    const loopEndX = LM + loopLen * gW;
    seqCtx.fillStyle = 'rgba(0,0,0,0.45)';
    seqCtx.fillRect(loopEndX, 0, W - loopEndX, H);
    seqCtx.beginPath(); seqCtx.moveTo(loopEndX, 0); seqCtx.lineTo(loopEndX, H);
    seqCtx.strokeStyle = 'rgba(167,139,250,0.6)'; seqCtx.lineWidth = 2; seqCtx.stroke();
    seqCtx.fillStyle = 'rgba(167,139,250,0.55)';
    seqCtx.fillRect(LM, 0, loopLen * gW, 2);
  }

  if (seqEngine.playing && S.fretboardOpen && seqEngine.displayStep !== _seqFbLastStep) {
    _seqFbLastStep = seqEngine.displayStep;
    _drawFretboard();
  }
  if (!seqEngine.playing && _seqFbLastStep !== -1) {
    _seqFbLastStep = -1;
    if (S.fretboardOpen) _drawFretboard();
  }
}

// ── Loop-count helper (used by tap handlers) ────────────────────────

function seqCurrentLoopCount() {
  if (!seqEngine.playing || epochMs === null) return 0;
  const melLoop = Math.max(1, Math.min(SEQ.loopLen, seqSteps()));
  return Math.floor(Math.max(0, sharedNow() - epochMs) / (melLoop * seqStepDur() * 1000));
}

// ── Tap / long-press handler ─────────────────────────────────────────
// 1 tap   → toggle on/off (cycle 1)
// 2 taps  → play every 2 loops
// 3 taps  → play every 3 loops
// 4 taps  → play every 4 loops
// Long press (600 ms) → reset (turn off)

let _tapKey = null, _tapCount = 0, _tapTimer = null;
let _lpTimer = null, _lpStartX = 0, _lpStartY = 0;

function _seqCell(e) {
  const rect = seqCanvas.getBoundingClientRect();
  const px   = e.clientX - rect.left, py = e.clientY - rect.top;
  const W    = seqCanvas.clientWidth,  H  = seqCanvas.clientHeight;
  const scale = getScale(), n = scale.length;
  if (n === 0 || px < 30) return null;
  const gW = (W - 30) / seqSteps(), gH = H / n;
  const st = Math.floor((px - 30) / gW), row = Math.floor(py / gH);
  const si = n - 1 - row;
  if (st < 0 || st >= seqSteps() || si < 0 || si >= n) return null;
  return `${si}_${st}`;
}

seqCanvas.addEventListener('contextmenu', e => e.preventDefault());

seqCanvas.addEventListener('pointerdown', e => {
  const key = _seqCell(e);
  if (!key) return;
  _lpStartX = e.clientX; _lpStartY = e.clientY;
  clearTimeout(_lpTimer);
  _lpTimer = setTimeout(() => {
    _lpTimer = null;
    clearTimeout(_tapTimer); _tapKey = null; _tapCount = 0;
    if (SEQ.grid[key]) {
      delete SEQ.grid[key];
      _syncSend({ type: 'GRID_SET', key, val: false });
      scheduleDrawSequencer();
    }
  }, 600);
});

seqCanvas.addEventListener('pointermove', e => {
  if (_lpTimer && (Math.abs(e.clientX - _lpStartX) > 10 || Math.abs(e.clientY - _lpStartY) > 10)) {
    clearTimeout(_lpTimer); _lpTimer = null;
  }
});

seqCanvas.addEventListener('pointerup', e => {
  if (!_lpTimer) return;
  clearTimeout(_lpTimer); _lpTimer = null;
  const key = _seqCell(e);
  if (!key) return;

  clearTimeout(_tapTimer);

  if (_tapKey === key) {
    // Additional tap — upgrade cycle, anchoring phase to the current loop
    _tapCount = Math.min(_tapCount + 1, 4);
    const lc  = seqCurrentLoopCount();
    const val = { n: _tapCount, o: lc % _tapCount };
    SEQ.grid[key] = val;
    _syncSend({ type: 'GRID_SET', key, val });
  } else {
    // First tap on this cell — toggle immediately (cycle 1 plays every loop)
    _tapKey = key; _tapCount = 1;
    if (SEQ.grid[key]) { delete SEQ.grid[key]; _syncSend({ type: 'GRID_SET', key, val: false }); }
    else               { SEQ.grid[key] = 1;    _syncSend({ type: 'GRID_SET', key, val: 1    }); }
  }

  scheduleDrawSequencer();

  if (_tapCount >= 4) { _tapKey = null; _tapCount = 0; return; }

  _tapTimer = setTimeout(() => { _tapKey = null; _tapCount = 0; }, 350);
});

// ── Helpers ─────────────────────────────────────────────────────────

export function getSeqActiveFreqs() {
  if (!seqEngine.playing || seqEngine.displayStep < 0) return [];
  const step   = seqEngine.displayStep;
  const scale  = getScale();
  const n      = scale.length;
  const rootHz = 261.62556 * Math.pow(2, S.root / 12);
  const freqs  = [];
  for (let si = 0; si < n; si++) {
    if (!SEQ.grid[`${si}_${step}`]) continue;
    if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) {
      freqs.push(rootHz * Math.pow(2, (MAQAM_CENTS[S.scaleName][si] ?? 0) / 1200));
    } else {
      freqs.push(audio.degreeFreq(S.root, scale[si], S.temp, 4));
    }
  }
  return freqs;
}

export function seqLoadDemo() {
  SEQ.grid = {};
  const n = getScale().length;
  if (n === 0) return;
  const pat = [
    [0,0],[2,1],[4,2],[2,3],  [3,4],[2,5],[1,6],[0,7],
    [0,8],[4,9],[6,10],[4,11],[5,12],[3,13],[1,14],[0,15],
  ];
  const steps = seqSteps();
  pat.forEach(([si, st]) => {
    if (st < steps) SEQ.grid[`${Math.min(si, n - 1)}_${st}`] = true;
  });
  drawSequencer();
}
