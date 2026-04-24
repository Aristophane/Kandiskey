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
  nextTime: 0,
  startTime: 0,
  displayStep: -1,
  drumDisplayStep: -1,
  _ivl: null,
  _raf: null,

  _playStep(step, time) {
    const scale = getScale();
    const n = scale.length;
    if (n === 0) return;
    const rootHz  = 261.62556 * Math.pow(2, S.root / 12) * Math.pow(2, S.octave - 4);
    const noteDur = Math.max(seqStepDur() * SEQ.gate, 0.04);

    for (let si = 0; si < n; si++) {
      if (!SEQ.grid[`${si}_${step}`]) continue;
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
        this._playStep(stepIdx % melLoop, audioT);
        drumPlayStep(stepIdx % drmLoop,   audioT);
        this._lastSched = stepIdx;
      }

    } else {
      const melDur = melLoop * dur;
      const drmDur = drmLoop * dur;
      while (this.nextTime < now + LOOK) {
        this._playStep(this.step % melLoop, this.nextTime);
        drumPlayStep(this.step % drmLoop,   this.nextTime);
        this.nextTime += dur;
        this.step = (this.step + 1) % loopLen;
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
    } else if (this._pausedStep >= 0) {
      // Resume from pause — rebuild epoch so playback continues from the frozen step
      setEpochMs(sharedNow() - this._pausedStep * seqStepDur() * 1000);
      this._lastSched  = this._pausedStep - 1;
      this._pausedStep = -1;
      _syncSend({ type: 'PLAY', epochMs, masterBpm, ..._syncGetFullState() });
    } else if (peerEpochMs !== null) {
      setEpochMs(peerEpochMs);
      this._barJoining = true;
      this._lastSched  = undefined;
      _syncSend({ type: 'JOINED', epochMs, masterBpm, ..._syncGetFullState() });
    } else {
      setEpochMs(sharedNow());
      setMasterBpm(SEQ.bpm);
      this._lastSched = -1;
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
      const x      = LM + st * gW;
      const active = !!SEQ.grid[`${si}_${st}`];
      const isCur  = st === seqEngine.displayStep && seqEngine.playing;
      const isBeat = Number.isInteger(st / spb) || Math.abs(st % spb) < 0.001;
      const isBar  = Math.abs(st % (spb * 4)) < 0.001;

      let fill;
      if      (active && isCur) fill = 'rgba(245,158,11,0.92)';
      else if (active)          fill = 'rgba(167,139,250,0.80)';
      else if (isCur)           fill = 'rgba(255,255,255,0.16)';
      else if (isBar)           fill = 'rgba(255,255,255,0.065)';
      else if (isBeat)          fill = 'rgba(255,255,255,0.038)';
      else                      fill = 'rgba(255,255,255,0.016)';

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

// ── Click handler ───────────────────────────────────────────────────

seqCanvas.addEventListener('click', e => {
  const rect = seqCanvas.getBoundingClientRect();
  const px   = e.clientX - rect.left, py = e.clientY - rect.top;
  const W    = seqCanvas.clientWidth,  H  = seqCanvas.clientHeight;
  const scale = getScale(), n = scale.length;
  if (n === 0 || px < 30) return;
  const gW = (W - 30) / seqSteps(), gH = H / n;
  const st = Math.floor((px - 30) / gW), row = Math.floor(py / gH);
  const si = n - 1 - row;
  if (st < 0 || st >= seqSteps() || si < 0 || si >= n) return;
  const key = `${si}_${st}`;
  if (SEQ.grid[key]) { delete SEQ.grid[key]; _syncSend({ type: 'GRID_SET', key, val: false }); }
  else               { SEQ.grid[key] = true;  _syncSend({ type: 'GRID_SET', key, val: true  }); }
  scheduleDrawSequencer(); // deferred — never blocks _tick()
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
