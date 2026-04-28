// ═══════════════════════════════════════════════════════════════════
// SEQUENCER ENGINE
// ═══════════════════════════════════════════════════════════════════

import { audio } from './audio.js';
import {
  S, SEQ, getScale, seqR, seqStepDur, seqSteps,
  epochMs, peerEpochMs, masterBpm, syncTempoRatio, drumLoopLen,
  setEpochMs, setPeerEpochMs, setMasterBpm,
} from './state.js';
import { getGrooveEvent } from './groove.js';
import { CHROMATIC, MAQAM_CENTS } from './data.js';
import { drumPlayStep, drawDrumMachine, scheduleDrmDraw } from './drum.js';
import { sharedNow, sharedTimeToAudioTime } from './sync.js';

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

let _onGridMutate = null;
export function setSeqGridMutateCallback(fn) { _onGridMutate = fn; }

let _onPreMutate = null;
export function setSeqPreMutateCallback(fn) { _onPreMutate = fn; }

// ── Canvas ──────────────────────────────────────────────────────────

const seqCanvas = document.getElementById('seq-canvas');
const seqCtx    = seqCanvas.getContext('2d');

const SCHED_LOOK_AHEAD = 0.22;
const START_LEAD_MS = 180;
const SCHED_INTERVAL_MS = 12;
const STEP_EPS = 1e-4;

function _parseTransportAnchor(anchor) {
  if (anchor === null || anchor === undefined) return null;
  if (typeof anchor === 'number') {
    return { sharedMs: anchor, absStep: 0, revision: 0 };
  }
  if (typeof anchor !== 'object') return null;
  const sharedMs = anchor.sharedMs ?? anchor.epochMs ?? null;
  if (sharedMs === null) return null;
  return {
    sharedMs,
    absStep: Math.max(0, anchor.absStep ?? anchor.transportAbsStep ?? 0),
    revision: Math.max(0, anchor.revision ?? anchor.transportRevision ?? 0),
  };
}

function _isWholeStep(step) {
  return Math.abs(step - Math.round(step)) < STEP_EPS;
}

function _schedulerLastForStep(step) {
  const clamped = Math.max(0, step);
  return _isWholeStep(clamped) ? Math.round(clamped) - 1 : Math.floor(clamped);
}

// ── Sequencer engine ────────────────────────────────────────────────

export const seqEngine = {
  playing: false,
  paused: false,
  _pausedAbsStep: -1,
  step: 0,
  _absStep: 0,
  _anchorAbsStep: 0,
  _pendingPeerAnchor: null,
  _transportRevision: 0,
  displayStep: -1,
  drumDisplayStep: -1,
  _ivl: null,
  _raf: null,
  _worker: undefined,
  _corrTick: 0,

  _playStep(step, time, loopCount) {
    const scale = getScale();
    const n = scale.length;
    if (n === 0) return;
    const rootHz    = 261.62556 * Math.pow(2, S.root / 12) * Math.pow(2, S.octave - 4);
    const stepDur   = seqStepDur();
    const noteDur   = Math.max(stepDur * SEQ.gate, 0.04);
    const spb       = seqR().spb;
    const actxNow   = audio.actx.currentTime;

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
      const { offsetSec, velocity } = getGrooveEvent({
        step, spb, stepDurSec: stepDur, role: 'melody', baseVelocity: 0.72,
      });
      const eventTime = Math.max(actxNow + 0.001, time + offsetSec);
      audio._playHz(freq, Math.max(eventTime - actxNow, 0), noteDur, velocity);
    }
  },

  _ensureWorker() {
    if (this._worker !== undefined) return this._worker;
    try {
      this._worker = new Worker(new URL('./transport-worker.js', import.meta.url), { type: 'module' });
      this._worker.addEventListener('message', event => {
        if (event.data?.type !== 'TICK' || !this.playing) return;
        try { this._tick(); } catch (e) { console.error('[seq] _tick error:', e); }
      });
    } catch (e) {
      console.warn('[seq] transport worker unavailable, falling back to main-thread timer:', e);
      this._worker = null;
    }
    return this._worker;
  },

  _startScheduler() {
    clearInterval(this._ivl);
    const worker = this._ensureWorker();
    if (worker) {
      worker.postMessage({ type: 'START', intervalMs: SCHED_INTERVAL_MS });
      return;
    }
    this._ivl = setInterval(() => {
      if (!this.playing) return;
      try { this._tick(); } catch (e) { console.error('[seq] _tick error:', e); }
    }, SCHED_INTERVAL_MS);
  },

  _stopScheduler() {
    clearInterval(this._ivl);
    this._ivl = null;
    if (this._worker) {
      this._worker.postMessage({ type: 'STOP' });
    }
  },

  _setTransportAnchor(sharedMs, absStep, revision = this._transportRevision) {
    this._anchorAbsStep = Math.max(0, absStep);
    this._transportRevision = Math.max(this._transportRevision, revision);
    setEpochMs(sharedMs);
    this._lastSched = _schedulerLastForStep(this._anchorAbsStep);
    this._absStep = Math.max(0, Math.floor(this._anchorAbsStep + STEP_EPS));
    this.step = this._absStep;
  },

  _nextTransportRevision() {
    this._transportRevision += 1;
    return this._transportRevision;
  },

  transportStepFloatAt(sharedMs = sharedNow()) {
    const anchor = Math.max(0, this._anchorAbsStep || 0);
    if (epochMs === null) return anchor;
    const durMs = seqStepDur() * 1000;
    if (!(durMs > 0)) return anchor;
    const elapsedMs = sharedMs - epochMs;
    if (elapsedMs <= 0) return anchor;
    return anchor + elapsedMs / durMs;
  },

  transportStepAt(sharedMs = sharedNow()) {
    return Math.max(0, Math.floor(this.transportStepFloatAt(sharedMs) + STEP_EPS));
  },

  transportSharedMsForStep(absStep) {
    if (epochMs === null) return sharedNow();
    return epochMs + (absStep - this._anchorAbsStep) * seqStepDur() * 1000;
  },

  getTransportSnapshot(sharedMs = sharedNow()) {
    const melLoop = Math.max(1, Math.min(SEQ.loopLen, seqSteps()));
    const drmLoop = Math.max(1, Math.min(drumLoopLen, seqSteps()));
    const absStepFloat = this.transportStepFloatAt(sharedMs);
    const currentAbsStep = Math.max(0, Math.floor(absStepFloat + STEP_EPS));
    const stepPhase = Math.max(0, Math.min(0.9999, absStepFloat - currentAbsStep));
    const melLoopFloat = absStepFloat / melLoop;
    const drmLoopFloat = absStepFloat / drmLoop;
    return {
      playing: this.playing,
      absStepFloat,
      currentAbsStep,
      stepPhase,
      currentStep: currentAbsStep % melLoop,
      nextStep: (currentAbsStep + 1) % melLoop,
      currentDrumStep: currentAbsStep % drmLoop,
      nextDrumStep: (currentAbsStep + 1) % drmLoop,
      loopCount: Math.floor(Math.max(0, melLoopFloat)),
      drumLoopCount: Math.floor(Math.max(0, drmLoopFloat)),
      loopPhase: ((melLoopFloat % 1) + 1) % 1,
      drumLoopPhase: ((drmLoopFloat % 1) + 1) % 1,
    };
  },

  buildTransportMessage(type, extra = {}) {
    return {
      type,
      epochMs,
      transportAbsStep: this._anchorAbsStep,
      transportRevision: this._transportRevision,
      masterBpm,
      ..._syncGetFullState(),
      ...extra,
    };
  },

  setPendingPeerAnchor(anchor) {
    this._pendingPeerAnchor = _parseTransportAnchor(anchor);
  },

  syncToRemoteAnchor(anchor) {
    const parsed = _parseTransportAnchor(anchor);
    if (!parsed) return false;
    if (
      parsed.revision < this._transportRevision &&
      Math.abs(parsed.sharedMs - (epochMs ?? parsed.sharedMs)) < 1 &&
      Math.abs(parsed.absStep - this._anchorAbsStep) < STEP_EPS
    ) {
      return false;
    }
    this._setTransportAnchor(parsed.sharedMs, parsed.absStep, parsed.revision);
    this._barJoining = false;
    this._corrTick = 24;
    return true;
  },

  _tick() {
    if (epochMs === null) return;

    const melLoop = Math.max(1, Math.min(SEQ.loopLen, seqSteps()));
    const drmLoop = Math.max(1, Math.min(drumLoopLen, seqSteps()));
    const loopLen = Math.max(melLoop, drmLoop);
    const worldNow = sharedNow();
    const now = audio.actx.currentTime;
    const stepFloat = this.transportStepFloatAt(worldNow);
    const globalStep = Math.max(0, Math.floor(stepFloat + STEP_EPS));

    this.displayStep = globalStep % melLoop;
    this.drumDisplayStep = globalStep % drmLoop;
    this.step = globalStep % loopLen;

    // Fire pending clip swap at every loop boundary (quantised to loop start)
    const loopCount = Math.floor(globalStep / melLoop);
    if (loopCount !== this._lastLoopCount) {
      this._lastLoopCount = loopCount;
      if (this._pendingClipApply) {
        this._pendingClipApply();
        this._pendingClipApply = null;
      }
    }

    if (this._corrTick > 0) {
      this._corrTick--;
      const targetLast = _schedulerLastForStep(stepFloat);
      if (this._lastSched === undefined || this._lastSched > targetLast + 2) {
        this._lastSched = targetLast;
      }
    }

    if (this._barJoining) {
      const nextBarStep = Math.ceil((globalStep + 1) / loopLen) * loopLen;
      const nextBarAudioT = sharedTimeToAudioTime(audio.actx, this.transportSharedMsForStep(nextBarStep));
      if (nextBarAudioT <= now + SCHED_LOOK_AHEAD) {
        this._barJoining = false;
        this._lastSched = nextBarStep - 1;
      }
      return;
    }

    if (this._lastSched === undefined) this._lastSched = _schedulerLastForStep(stepFloat);

    for (let guard = 0; guard < 32; guard++) {
      const stepIdx = this._lastSched + 1;
      const audioT = sharedTimeToAudioTime(audio.actx, this.transportSharedMsForStep(stepIdx));
      if (audioT > now + SCHED_LOOK_AHEAD) break;
      if (audioT < now - 0.05) { this._lastSched = stepIdx; continue; }
      this._playStep(stepIdx % melLoop, audioT, Math.floor(stepIdx / melLoop));
      drumPlayStep(stepIdx % drmLoop, audioT, Math.floor(stepIdx / drmLoop));
      this._lastSched = stepIdx;
    }
  },

  play(remoteAnchor = null) {
    this._stopScheduler();
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    _stopMidiPlayer();
    audio._resume();
    this.playing = true;
    this.paused = false;

    const incoming = _parseTransportAnchor(remoteAnchor);
    if (incoming) {
      this._setTransportAnchor(incoming.sharedMs, incoming.absStep, incoming.revision);
      this._barJoining = false;
      this._pausedAbsStep = -1;
    } else if (this._pausedAbsStep >= 0) {
      const revision = this._nextTransportRevision();
      this._setTransportAnchor(sharedNow() + START_LEAD_MS, this._pausedAbsStep, revision);
      this._barJoining = false;
      this._pausedAbsStep = -1;
      _syncSend(this.buildTransportMessage('PLAY'));
    } else if (this._pendingPeerAnchor || peerEpochMs !== null) {
      const pending = this._pendingPeerAnchor || { sharedMs: peerEpochMs, absStep: 0, revision: this._transportRevision };
      this._setTransportAnchor(pending.sharedMs, pending.absStep, pending.revision);
      this._barJoining = true;
      _syncSend(this.buildTransportMessage('JOINED'));
      this._pendingPeerAnchor = null;
    } else {
      const revision = this._nextTransportRevision();
      setMasterBpm(SEQ.bpm);
      this._setTransportAnchor(sharedNow() + START_LEAD_MS, 0, revision);
      this._barJoining = false;
      _syncSend(this.buildTransportMessage('PLAY'));
    }

    this._startScheduler();
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

  pause(fromRemote = false, remoteAnchor = null) {
    if (!this.playing && !fromRemote) return;
    const parsed = _parseTransportAnchor(remoteAnchor);
    if (parsed) {
      this._setTransportAnchor(parsed.sharedMs, parsed.absStep, parsed.revision);
    } else if (epochMs !== null) {
      const pauseSharedMs = sharedNow();
      const pauseAbsStep = this.transportStepFloatAt(pauseSharedMs);
      const revision = fromRemote ? this._transportRevision : this._nextTransportRevision();
      this._setTransportAnchor(pauseSharedMs, pauseAbsStep, revision);
      if (!fromRemote) {
        _syncSend(this.buildTransportMessage('PAUSE'));
      }
    }

    this.playing = false;
    this.paused = true;
    this._pausedAbsStep = Math.max(0, this._anchorAbsStep);
    this._barJoining = false;
    this._stopScheduler();
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    _syncPlayUI('paused');
    scheduleDrawSequencer();
    scheduleDrmDraw();
  },

  stop(fromRemote = false) {
    this.playing = false;
    this.paused = false;
    this._pausedAbsStep = -1;
    this._barJoining = false;
    this._lastSched = undefined;
    this._pendingPeerAnchor = null;
    this._corrTick = 0;
    this._stopScheduler();
    if (this._raf) cancelAnimationFrame(this._raf);
    this.displayStep = -1;
    this.drumDisplayStep = -1;
    this._anchorAbsStep = 0;
    setEpochMs(null);
    setPeerEpochMs(null);
    if (!fromRemote) _syncSend({ type: 'STOP' });
    _syncPlayUI('stopped');
    scheduleDrawSequencer();
    scheduleDrmDraw();
  },

  rebase(fromRemote = false, remoteAnchor = null) {
    if (!this.playing) return;
    const parsed = _parseTransportAnchor(remoteAnchor);
    if (parsed) {
      this._setTransportAnchor(parsed.sharedMs, parsed.absStep, parsed.revision);
    } else {
      const anchorSharedMs = sharedNow();
      const anchorAbsStep = this.transportStepFloatAt(anchorSharedMs);
      const revision = fromRemote ? this._transportRevision : this._nextTransportRevision();
      this._setTransportAnchor(anchorSharedMs, anchorAbsStep, revision);
    }
    if (!fromRemote) {
      setMasterBpm(Math.round(SEQ.bpm / syncTempoRatio));
      _syncSend(this.buildTransportMessage('REBASE', {
        rhythmKey: SEQ.rhythmKey,
        loopLen: SEQ.loopLen,
      }));
    }
    this._corrTick = 12;
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
  const SEQ_BAR_H = 14;
  const gW    = (W - LM) / steps;
  const gH    = (H - SEQ_BAR_H) / Math.max(n, 1);

  seqCtx.fillStyle = '#070512';
  seqCtx.fillRect(0, 0, W, H);
  seqCtx.fillStyle = 'rgba(255,255,255,0.022)';
  seqCtx.fillRect(0, 0, LM, H);

  if (n === 0) return;

  // Smooth loop phase (0-1) and absolute loop count - used for blink animation
  const melLoop = Math.max(1, Math.min(SEQ.loopLen, steps));
  const transport = seqEngine.playing ? seqEngine.getTransportSnapshot() : null;
  const loopPhase = transport?.loopPhase ?? 0;
  const loopCount = transport?.loopCount ?? 0;

  for (let row = 0; row < n; row++) {
    const si      = n - 1 - row;
    const y       = SEQ_BAR_H + row * gH;
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
    seqCtx.beginPath(); seqCtx.moveTo(x, SEQ_BAR_H); seqCtx.lineTo(x, H);
    seqCtx.strokeStyle = isBar ? 'rgba(255,255,255,0.24)' : isBeat ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
    seqCtx.lineWidth = 1; seqCtx.stroke();
  }
  for (let row = 0; row <= n; row++) {
    const y = SEQ_BAR_H + row * gH;
    seqCtx.beginPath(); seqCtx.moveTo(LM, y); seqCtx.lineTo(W, y);
    seqCtx.strokeStyle = 'rgba(255,255,255,0.07)'; seqCtx.lineWidth = 1; seqCtx.stroke();
  }
  seqCtx.beginPath(); seqCtx.moveTo(LM, SEQ_BAR_H); seqCtx.lineTo(LM, H);
  seqCtx.strokeStyle = 'rgba(255,255,255,0.14)'; seqCtx.lineWidth = 1; seqCtx.stroke();

  const loopLen = Math.max(1, Math.min(SEQ.loopLen, steps));
  const loopEndX = LM + loopLen * gW;
  if (loopLen < steps) {
    seqCtx.fillStyle = 'rgba(0,0,0,0.45)';
    seqCtx.fillRect(loopEndX, SEQ_BAR_H, W - loopEndX, H - SEQ_BAR_H);
    seqCtx.beginPath(); seqCtx.moveTo(loopEndX, SEQ_BAR_H); seqCtx.lineTo(loopEndX, H);
    seqCtx.strokeStyle = 'rgba(167,139,250,0.6)'; seqCtx.lineWidth = 2; seqCtx.stroke();
  }
  // Loop handle bar — always drawn at top of grid, above notes
  seqCtx.fillStyle = 'rgba(245,158,11,0.12)';
  seqCtx.fillRect(LM, 0, W - LM, SEQ_BAR_H);
  seqCtx.fillStyle = 'rgba(245,158,11,0.58)';
  seqCtx.fillRect(LM, 0, loopLen * gW, SEQ_BAR_H);
  seqCtx.fillStyle = '#f59e0b';
  seqCtx.fillRect(loopEndX - 6, 0, 12, SEQ_BAR_H);
  seqCtx.fillStyle = 'rgba(0,0,0,0.80)';
  seqCtx.font = `bold 9px system-ui`;
  seqCtx.textAlign = 'center'; seqCtx.textBaseline = 'middle';
  seqCtx.fillText(loopLen, loopEndX, SEQ_BAR_H / 2);

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
  if (!seqEngine.playing) return 0;
  return seqEngine.getTransportSnapshot().loopCount;
}

// ── Tap / long-press handler ─────────────────────────────────────────
// 1 tap   → toggle on/off (cycle 1)
// 2 taps  → play every 2 loops
// 3 taps  → play every 3 loops
// 4 taps  → play every 4 loops
// Long press (600 ms) → reset (turn off)

// ── Loop handle drag state ───────────────────────────────────────────
let _seqLoopDragActive = false, _seqLoopDragPtrId = -1;

function _updateSeqLoopFromX(clientX) {
  const rect = seqCanvas.getBoundingClientRect();
  const W = seqCanvas.clientWidth;
  const steps = seqSteps();
  const LM = 30;
  const gW = (W - LM) / steps;
  const px = clientX - rect.left;
  const newLen = Math.max(1, Math.min(steps, Math.round((px - LM) / gW)));
  if (newLen !== SEQ.loopLen) {
    SEQ.loopLen = newLen;
    if (seqEngine.playing) seqEngine.rebase();
    else _syncSend({ type: 'SEQ_PARAM', loopLen: SEQ.loopLen });
    scheduleDrawSequencer();
  }
}

let _tapKey = null, _tapCount = 0, _tapTimer = null;
let _lpTimer = null, _lpStartX = 0, _lpStartY = 0;

function _seqCell(e) {
  const rect = seqCanvas.getBoundingClientRect();
  const px   = e.clientX - rect.left, py = e.clientY - rect.top;
  const W    = seqCanvas.clientWidth,  H  = seqCanvas.clientHeight;
  const scale = getScale(), n = scale.length;
  const BAR = 14;
  if (n === 0 || px < 30 || py < BAR) return null;
  const gW = (W - 30) / seqSteps(), gH = (H - BAR) / n;
  const st = Math.floor((px - 30) / gW), row = Math.floor((py - BAR) / gH);
  const si = n - 1 - row;
  if (st < 0 || st >= seqSteps() || si < 0 || si >= n) return null;
  return `${si}_${st}`;
}

seqCanvas.addEventListener('contextmenu', e => e.preventDefault());

seqCanvas.addEventListener('pointerdown', e => {
  // Top 16px → loop handle drag zone
  const rect = seqCanvas.getBoundingClientRect();
  const py = e.clientY - rect.top;
  if (py < 16) {
    if (_onPreMutate) _onPreMutate();
    _seqLoopDragActive = true;
    _seqLoopDragPtrId = e.pointerId;
    seqCanvas.setPointerCapture(e.pointerId);
    _updateSeqLoopFromX(e.clientX);
    return;
  }

  const key = _seqCell(e);
  if (!key) return;
  _lpStartX = e.clientX; _lpStartY = e.clientY;
  clearTimeout(_lpTimer);
  _lpTimer = setTimeout(() => {
    _lpTimer = null;
    clearTimeout(_tapTimer); _tapKey = null; _tapCount = 0;
    if (SEQ.grid[key]) {
      if (_onPreMutate) _onPreMutate();
      delete SEQ.grid[key];
      _syncSend({ type: 'GRID_SET', key, val: false });
      scheduleDrawSequencer();
      if (_onGridMutate) _onGridMutate();
    }
  }, 600);
});

seqCanvas.addEventListener('pointermove', e => {
  if (_seqLoopDragActive && e.pointerId === _seqLoopDragPtrId) {
    _updateSeqLoopFromX(e.clientX);
    return;
  }
  if (_lpTimer && (Math.abs(e.clientX - _lpStartX) > 10 || Math.abs(e.clientY - _lpStartY) > 10)) {
    clearTimeout(_lpTimer); _lpTimer = null;
  }
});

seqCanvas.addEventListener('pointercancel', e => {
  if (e.pointerId === _seqLoopDragPtrId) _seqLoopDragActive = false;
});

seqCanvas.addEventListener('pointerup', e => {
  if (_seqLoopDragActive && e.pointerId === _seqLoopDragPtrId) {
    _seqLoopDragActive = false;
    return;
  }
  if (!_lpTimer) return;
  clearTimeout(_lpTimer); _lpTimer = null;
  const key = _seqCell(e);
  if (!key) return;

  clearTimeout(_tapTimer);

  if (_tapKey === key) {
    // Additional tap — upgrade cycle, anchoring phase to the current loop
    if (_onPreMutate) _onPreMutate();
    _tapCount = Math.min(_tapCount + 1, 4);
    const lc  = seqCurrentLoopCount();
    const val = { n: _tapCount, o: lc % _tapCount };
    SEQ.grid[key] = val;
    _syncSend({ type: 'GRID_SET', key, val });
  } else {
    // First tap on this cell — toggle immediately (cycle 1 plays every loop)
    if (_onPreMutate) _onPreMutate();
    _tapKey = key; _tapCount = 1;
    if (SEQ.grid[key]) { delete SEQ.grid[key]; _syncSend({ type: 'GRID_SET', key, val: false }); }
    else               { SEQ.grid[key] = 1;    _syncSend({ type: 'GRID_SET', key, val: 1    }); }
  }

  scheduleDrawSequencer();
  if (_onGridMutate) _onGridMutate();

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
