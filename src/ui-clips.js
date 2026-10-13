import { SEQ, drumLoopLen, setDrumLoopLen } from './state.js';
import {
  DRUM_GRID, scheduleDrmDraw, setDrumGridMutateCallback, setDrumPreMutateCallback,
} from './drum.js';
import { seqEngine, scheduleDrawSequencer, setSeqGridMutateCallback } from './sequencer.js';
import { seqUndoPush } from './ui-sequencer.js';

// Injected from main.js to avoid circular dependency
let _triggerSequencerPlay = () => {};
export function setTriggerSequencerPlay(fn) { _triggerSequencerPlay = fn; }

// ── Clip slot constants & state ───────────────────────────────────────

const SLOTS_KEY   = 'kdk_clip_slots_v1';
const SEQ_SLOTS   = 16;
const DRUM_SLOTS  = 16;
const ROWS        = 8;

let _seqSlots     = Array(SEQ_SLOTS).fill(null);
let _drumSlots    = Array(DRUM_SLOTS).fill(null);
let _activeSeqSlot  = -1;
let _activeDrumSlot = -1;
let _pendingSeqSlot  = -1;
let _pendingDrumSlot = -1;
let _autoSeqRing  = -1;
let _autoDrmRing  = -1;

let _persistTimer = null;
function _persistSlots() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify({ seq: _seqSlots, drum: _drumSlots })); } catch { /* quota */ }
  }, 0);
}
function _loadSlots() {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return;
    const { seq, drum } = JSON.parse(raw);
    if (Array.isArray(seq))  _seqSlots  = seq.slice(0, SEQ_SLOTS).concat(Array(SEQ_SLOTS).fill(null)).slice(0, SEQ_SLOTS);
    if (Array.isArray(drum)) _drumSlots = drum.slice(0, DRUM_SLOTS).concat(Array(DRUM_SLOTS).fill(null)).slice(0, DRUM_SLOTS);
  } catch { /* corrupt */ }
}

// ── Clip mini canvas drawing ──────────────────────────────────────────

function _drawClipMini(cvs, clip, isSeq) {
  const W = cvs.offsetWidth, H = cvs.offsetHeight;
  if (W === 0 || H === 0) return;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  cvs.width  = W * DPR;
  cvs.height = H * DPR;
  const ctx = cvs.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const clipGrid = clip.grid || {};
  const loopLen  = Math.max(clip.loopLen || 16, 1);
  const keys     = Object.keys(clipGrid).filter(k => !!clipGrid[k]);
  if (!keys.length) return;

  const gW = W / loopLen;

  if (isSeq) {
    let maxSi = 0;
    for (const k of keys) { const si = parseInt(k); if (si > maxSi) maxSi = si; }
    const rows = maxSi + 1;
    const gH   = H / rows;

    for (const k of keys) {
      const under = k.indexOf('_');
      const si = parseInt(k.substring(0, under));
      const st = parseInt(k.substring(under + 1));
      if (st >= loopLen) continue;
      const row = rows - 1 - si;
      ctx.fillStyle = 'rgba(167,139,250,0.82)';
      ctx.fillRect(st * gW + 0.5, row * gH + 0.5, Math.max(gW - 1, 1), Math.max(gH - 1, 1));
    }
  } else {
    const keyOrder = [], keySet = new Set();
    for (const k of keys) {
      const last = k.lastIndexOf('_');
      const dk   = k.substring(0, last);
      if (!keySet.has(dk)) { keySet.add(dk); keyOrder.push(dk); }
    }
    const rows = keyOrder.length;
    const gH   = H / rows;

    for (const k of keys) {
      const last = k.lastIndexOf('_');
      const dk   = k.substring(0, last);
      const st   = parseInt(k.substring(last + 1));
      if (st >= loopLen) continue;
      const row  = keyOrder.indexOf(dk);
      const kl   = dk.toLowerCase();
      let color;
      if (kl.includes('bassdrum') || kl.includes('kick')) color = 'rgba(251,146,60,0.82)';
      else if (kl.includes('snare'))                       color = 'rgba(167,139,250,0.75)';
      else if (kl.includes('clap'))                        color = 'rgba(244,114,182,0.75)';
      else if (kl.includes('hat') || kl.includes('hihat')) color = 'rgba(52,211,153,0.75)';
      else                                                  color = 'rgba(96,165,250,0.70)';
      ctx.fillStyle = color;
      ctx.fillRect(st * gW + 0.5, row * gH + 0.5, Math.max(gW - 1, 1), Math.max(gH - 1, 1));
    }
  }

  for (let st = 1; st < loopLen; st++) {
    const x = st * gW;
    ctx.strokeStyle = st % 4 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
}

// ── Clip cell playhead animation ──────────────────────────────────────

let _miniCanvasRefs = [];
let _clipAnimRaf    = null;

function _drawClipPlayheads() {
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  for (const item of _miniCanvasRefs) {
    const { cvs, clip, isSeq, slotIdx, baseImgData } = item;
    if (!baseImgData) continue;
    const isActive = isSeq ? _activeSeqSlot === slotIdx : _activeDrumSlot === slotIdx;
    if (!isActive) continue;

    const ctx = cvs.getContext('2d');
    ctx.putImageData(baseImgData, 0, 0);

    const loopLen = Math.max(clip.loopLen || 16, 1);
    const rawStep = isSeq
      ? seqEngine.displayStep
      : (seqEngine.drumDisplayStep ?? seqEngine.displayStep);
    const step = rawStep % loopLen;
    const W  = cvs.width / DPR;
    const H  = cvs.height / DPR;
    const gW = W / loopLen;
    const x  = (step + 0.5) * gW;

    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.80)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.restore();
  }
}

function _tickClipAnim() {
  if (!seqEngine.playing) {
    _clipAnimRaf = null;
    for (const { cvs, isSeq, slotIdx, baseImgData } of _miniCanvasRefs) {
      const wasActive = isSeq ? _activeSeqSlot === slotIdx : _activeDrumSlot === slotIdx;
      if (wasActive && baseImgData) cvs.getContext('2d').putImageData(baseImgData, 0, 0);
    }
    return;
  }
  _clipAnimRaf = requestAnimationFrame(_tickClipAnim);
  _drawClipPlayheads();
}

export function startClipAnim() {
  if (_clipAnimRaf) return;
  _tickClipAnim();
}

// ── Clip slot rendering ───────────────────────────────────────────────

export function renderClipSlots() {
  const grid = document.getElementById('clips-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const miniCanvases = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < 4; col++) {
      const isSeq   = col < 2;
      const slotIdx = isSeq ? row * 2 + col : (row * 2 + (col - 2));
      const slots   = isSeq ? _seqSlots : _drumSlots;
      const clip    = slots[slotIdx];
      const active  = isSeq ? _activeSeqSlot === slotIdx  : _activeDrumSlot  === slotIdx;
      const pending = isSeq ? _pendingSeqSlot === slotIdx : _pendingDrumSlot === slotIdx;

      const btn = document.createElement('button');
      btn.className    = 'clip-cell' + (clip ? ' filled' : '') + (active ? ' active' : '') + (pending ? ' pending' : '');
      btn.dataset.type = isSeq ? 'seq' : 'drum';
      btn.dataset.idx  = slotIdx;

      if (!clip) {
        const num = document.createElement('span');
        num.className   = 'clip-num';
        num.textContent = slotIdx + 1;
        btn.appendChild(num);
      }

      if (clip) {
        const cvs = document.createElement('canvas');
        cvs.className = 'clip-mini-canvas';
        btn.appendChild(cvs);
        const item = { cvs, clip, isSeq, slotIdx, baseImgData: null };
        miniCanvases.push(item);

        const icon = document.createElement('div');
        icon.className = 'clip-play-icon';
        icon.innerHTML = active
          ? `<svg viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1.5" width="3.5" height="11" rx=".6"/><rect x="8.5" y="1.5" width="3.5" height="11" rx=".6"/></svg>`
          : `<svg viewBox="0 0 14 14" fill="currentColor"><polygon points="2,1 2,13 12,7"/></svg>`;
        btn.appendChild(icon);
      }

      btn.addEventListener('click', () => activateClipSlot(isSeq ? 'seq' : 'drum', slotIdx));
      grid.appendChild(btn);
    }
  }

  requestAnimationFrame(() => {
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    for (const item of miniCanvases) {
      _drawClipMini(item.cvs, item.clip, item.isSeq);
      const W = item.cvs.offsetWidth, H = item.cvs.offsetHeight;
      if (W > 0 && H > 0) {
        item.baseImgData = item.cvs.getContext('2d').getImageData(0, 0, W * DPR, H * DPR);
      }
    }
    _miniCanvasRefs = miniCanvases;
    if (seqEngine.playing) startClipAnim();
  });
}

function activateClipSlot(type, idx) {
  const isSeq = type === 'seq';
  const clip  = (isSeq ? _seqSlots : _drumSlots)[idx];
  if (!clip) return;

  if ((isSeq ? _activeSeqSlot : _activeDrumSlot) === idx ||
      (isSeq ? _pendingSeqSlot : _pendingDrumSlot) === idx) {
    if (isSeq) { _activeSeqSlot = -1; _pendingSeqSlot = -1; }
    else       { _activeDrumSlot = -1; _pendingDrumSlot = -1; }
    seqEngine._pendingClipApply = null;
    renderClipSlots();
    return;
  }

  const apply = () => {
    clipsUndoPush();
    if (isSeq) {
      SEQ.grid = { ...clip.grid };
      if (clip.loopLen !== undefined) SEQ.loopLen = clip.loopLen;
      _activeSeqSlot  = idx;
      _pendingSeqSlot = -1;
      scheduleDrawSequencer();
    } else {
      for (const k of Object.keys(DRUM_GRID)) delete DRUM_GRID[k];
      Object.assign(DRUM_GRID, clip.grid);
      if (clip.loopLen !== undefined) setDrumLoopLen(clip.loopLen);
      _activeDrumSlot  = idx;
      _pendingDrumSlot = -1;
      scheduleDrmDraw();
    }
    renderClipSlots();
  };

  if (!seqEngine.playing) {
    apply();
    _triggerSequencerPlay();
  } else {
    if (isSeq) _pendingSeqSlot = idx; else _pendingDrumSlot = idx;
    const prev = seqEngine._pendingClipApply;
    seqEngine._pendingClipApply = prev ? () => { prev(); apply(); } : apply;
  }
  renderClipSlots();
}

export function autoFillClipSlots() {
  const label = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let si = _seqSlots.findIndex(s => s === null);
  if (si === -1) { _autoSeqRing = (_autoSeqRing + 1) % SEQ_SLOTS; si = _autoSeqRing; }
  _seqSlots[si] = { grid: { ...SEQ.grid }, loopLen: SEQ.loopLen, label };

  let di = _drumSlots.findIndex(s => s === null);
  if (di === -1) { _autoDrmRing = (_autoDrmRing + 1) % DRUM_SLOTS; di = _autoDrmRing; }
  _drumSlots[di] = { grid: { ...DRUM_GRID }, loopLen: drumLoopLen, label };

  _persistSlots();
  renderClipSlots();
}

document.getElementById('btn-clips')?.addEventListener('click', function () {
  if (window.innerWidth <= 768) {
    const outer = document.getElementById('outer-wrap');
    const clipsWrap = document.getElementById('clips-wrap');
    if (outer && clipsWrap) outer.scrollTo({ left: clipsWrap.offsetLeft, behavior: 'smooth' });
    return;
  }
  const wrap = document.getElementById('clips-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-clips', open);
});

_loadSlots();
renderClipSlots();

setSeqGridMutateCallback(() => {
  if (_activeSeqSlot >= 0 && _seqSlots[_activeSeqSlot]) {
    _seqSlots[_activeSeqSlot] = { ..._seqSlots[_activeSeqSlot], grid: { ...SEQ.grid }, loopLen: SEQ.loopLen };
    _persistSlots();
  }
});

setDrumGridMutateCallback(() => {
  if (_activeDrumSlot >= 0 && _drumSlots[_activeDrumSlot]) {
    _drumSlots[_activeDrumSlot] = { ..._drumSlots[_activeDrumSlot], grid: { ...DRUM_GRID }, loopLen: drumLoopLen };
    _persistSlots();
  }
});

// ── DRUM UNDO ─────────────────────────────────────────────────────────

const _drmUndoStack = [];
const _DRM_UNDO_MAX = 40;
let _drmUndoDebounceT = 0;

function _drmUndoSnapshot() {
  return { grid: { ...DRUM_GRID }, loopLen: drumLoopLen };
}

export function drmUndoPush(force = false) {
  const now = Date.now();
  if (!force && now - _drmUndoDebounceT < 300) return;
  _drmUndoDebounceT = now;
  _drmUndoStack.push(_drmUndoSnapshot());
  if (_drmUndoStack.length > _DRM_UNDO_MAX) _drmUndoStack.shift();
  _syncDrmUndoBtn();
}

function _drmUndoPop() {
  if (!_drmUndoStack.length) return;
  const snap = _drmUndoStack.pop();
  for (const k of Object.keys(DRUM_GRID)) delete DRUM_GRID[k];
  Object.assign(DRUM_GRID, snap.grid);
  setDrumLoopLen(snap.loopLen);
  scheduleDrmDraw();
  _syncDrmUndoBtn();
}

function _syncDrmUndoBtn() {
  const btn = document.getElementById('btn-drum-undo');
  if (btn) btn.disabled = _drmUndoStack.length === 0;
}

setDrumPreMutateCallback(() => drmUndoPush());
document.getElementById('btn-drum-undo')?.addEventListener('click', () => _drmUndoPop());

// ── CLIPS UNDO ────────────────────────────────────────────────────────

const _clipsUndoStack = [];
const _CLIPS_UNDO_MAX = 20;

function _clipsUndoSnapshot() {
  return {
    activeSeqSlot:  _activeSeqSlot,
    activeDrumSlot: _activeDrumSlot,
    seqGrid:    { ...SEQ.grid },
    seqLoopLen: SEQ.loopLen,
    drumGrid:   { ...DRUM_GRID },
    drumLoopLen: drumLoopLen,
  };
}

export function clipsUndoPush() {
  _clipsUndoStack.push(_clipsUndoSnapshot());
  if (_clipsUndoStack.length > _CLIPS_UNDO_MAX) _clipsUndoStack.shift();
  _syncClipsUndoBtn();
}

function _clipsUndoPop() {
  if (!_clipsUndoStack.length) return;
  const snap = _clipsUndoStack.pop();
  SEQ.grid    = snap.seqGrid;
  SEQ.loopLen = snap.seqLoopLen;
  for (const k of Object.keys(DRUM_GRID)) delete DRUM_GRID[k];
  Object.assign(DRUM_GRID, snap.drumGrid);
  setDrumLoopLen(snap.drumLoopLen);
  _activeSeqSlot  = snap.activeSeqSlot;
  _activeDrumSlot = snap.activeDrumSlot;
  _pendingSeqSlot  = -1;
  _pendingDrumSlot = -1;
  seqEngine._pendingClipApply = null;
  scheduleDrawSequencer();
  scheduleDrmDraw();
  renderClipSlots();
  _syncClipsUndoBtn();
}

function _syncClipsUndoBtn() {
  const btn = document.getElementById('btn-clips-undo');
  if (btn) btn.disabled = _clipsUndoStack.length === 0;
}

document.getElementById('btn-clips-undo')?.addEventListener('click', () => _clipsUndoPop());
