import * as Sync from './sync.js';
import { SEQ, seqSteps, masterBpm, setMasterBpm, setSyncTempoRatio, syncTempoRatio, S } from './state.js';
import { seqEngine, scheduleDrawSequencer, setSeqPreMutateCallback } from './sequencer.js';
import { RHYTHMS, TEMPERAMENTS, SCALE_FAMILIES, CHROMATIC } from './data.js';
import { GROOVE_TEMPLATES } from './groove.js';
import { stopActiveMidiPlayer } from './midi.js';
import {
  applyTemperamentSelection, applyScaleFamilySelection, applyScaleNameSelection,
  setSyncScalePickerUi, setOpenScaleSettingsPicker, isScaleSidebarHidden,
} from './ui-scale.js';
import { applyNoteLen } from './ui-synth.js';

// ── syncVizBpmUi ──────────────────────────────────────────────────────

export function syncVizBpmUi() {
  const bpmText = String(document.getElementById('seq-bpm-val')?.textContent || SEQ.bpm || 120).trim();
  ['viz-bpm-val', 'seq-panel-bpm-val', 'drum-panel-bpm-val', 'clips-panel-bpm-val', 'mob-footer-bpm-val'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = bpmText;
  });
  ['btn-viz-bpm', 'btn-seq-panel-bpm', 'btn-drum-panel-bpm', 'btn-clips-panel-bpm', 'btn-mob-footer-bpm'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.title = `Set tempo (${bpmText} BPM)`;
    btn.setAttribute('aria-label', `Set tempo ${bpmText} BPM`);
  });
}

// ── Groove UI ─────────────────────────────────────────────────────────

export function _syncGrooveUi(groove) {
  const pct = Math.round((groove.accent ?? 0) * 100);
  ['seq', 'drum'].forEach(prefix => {
    const sel = document.getElementById(`${prefix}-groove-template`);
    const sl  = document.getElementById(`${prefix}-groove-accent`);
    const vl  = document.getElementById(`${prefix}-groove-accent-val`);
    if (sel && groove.template !== undefined) sel.value = groove.template;
    if (sl)  sl.value       = pct;
    if (vl)  vl.textContent = pct;
  });
}

(function initGrooveUi() {
  function applyGroove(template, accentPct) {
    SEQ.groove.template = template;
    SEQ.groove.accent   = accentPct / 100;
    _syncGrooveUi(SEQ.groove);
    Sync.send({ type: 'SEQ_PARAM', groove: { ...SEQ.groove } });
  }

  ['seq-groove-template', 'drum-groove-template'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    GROOVE_TEMPLATES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      if (t === SEQ.groove.template) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      applyGroove(this.value, Math.round(SEQ.groove.accent * 100));
    });
  });

  ['seq-groove-accent', 'drum-groove-accent'].forEach(id => {
    const sl = document.getElementById(id);
    if (!sl) return;
    sl.value = Math.round(SEQ.groove.accent * 100);
    sl.addEventListener('input', function () {
      const vl = document.getElementById(id.replace('accent', 'accent-val'));
      if (vl) vl.textContent = this.value;
      applyGroove(SEQ.groove.template, parseInt(this.value));
    });
  });

  _syncGrooveUi(SEQ.groove);
})();

// ── Sequencer button + rhythm select ─────────────────────────────────

document.getElementById('btn-seq')?.addEventListener('click', function () {
  if (window.innerWidth <= 768) {
    const outer = document.getElementById('outer-wrap');
    const seqWrap = document.getElementById('seq-wrap');
    if (outer && seqWrap) outer.scrollTo({ left: seqWrap.offsetLeft, behavior: 'smooth' });
    return;
  }
  const wrap = document.getElementById('seq-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-seq', open);
  if (open) scheduleDrawSequencer();
});

(function () {
  const sel = document.getElementById('seq-rhythm');
  if (!sel) return;
  Object.keys(RHYTHMS).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = k;
    if (k === SEQ.rhythmKey) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', function () {
    seqUndoPush(true);
    SEQ.rhythmKey = this.value;
    SEQ.loopLen = seqSteps();
    if (seqEngine.playing) seqEngine.rebase();
    else Sync.send({ type: 'SEQ_PARAM', rhythmKey: SEQ.rhythmKey, loopLen: SEQ.loopLen });
    scheduleDrawSequencer();
  });
})();

// ── BPM cylinder picker ───────────────────────────────────────────────

(function () {
  const overlay  = document.getElementById('bpm-picker-overlay');
  const scroll   = document.getElementById('bpm-picker-scroll');
  const dispBtn  = document.getElementById('bpm-display-btn');
  const hidden   = document.getElementById('seq-bpm');
  const valSpan  = document.getElementById('seq-bpm-val');
  if (!overlay || !scroll || !dispBtn) return;

  const MIN = 40, MAX = 240, ITEM_H = 48;

  for (let bpm = MIN; bpm <= MAX; bpm++) {
    const item = document.createElement('div');
    item.className = 'bpm-picker-item';
    item.textContent = bpm;
    scroll.appendChild(item);
  }

  function applyBpm(bpm) {
    bpm = Math.max(MIN, Math.min(MAX, bpm));
    SEQ.bpm = bpm;
    setMasterBpm(Math.round(bpm / syncTempoRatio));
    if (hidden) hidden.value = bpm;
    if (valSpan) valSpan.textContent = bpm;
    if (seqEngine.playing) seqEngine.rebase();
    else Sync.send({ type: 'SEQ_PARAM', masterBpm });
  }

  function currentIdx() { return Math.round(scroll.scrollTop / ITEM_H); }

  function updateSelection() {
    const idx = currentIdx();
    scroll.querySelectorAll('.bpm-picker-item').forEach((item, i) => {
      item.classList.toggle('selected', i === idx);
    });
  }

  function openPicker() {
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      scroll.scrollTop = ((SEQ.bpm || 120) - MIN) * ITEM_H;
      updateSelection();
    });
  }

  function closePicker() {
    overlay.style.display = 'none';
    applyBpm(currentIdx() + MIN);
  }

  dispBtn.addEventListener('click', openPicker);
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.classList.contains('bpm-backdrop')) closePicker();
  });
  scroll.addEventListener('scroll', updateSelection);
})();

// ── Scale picker overlay ──────────────────────────────────────────────

(function () {
  const overlay = document.getElementById('scale-picker-overlay');
  const closeBtn = document.getElementById('scale-picker-close');
  const summary = document.getElementById('scale-picker-summary');
  const tempScroll = document.getElementById('scale-picker-temp');
  const familyScroll = document.getElementById('scale-picker-family');
  const scaleScroll = document.getElementById('scale-picker-scale');
  if (!overlay || !closeBtn || !summary || !tempScroll || !familyScroll || !scaleScroll) return;

  const ITEM_H = 54;
  const tempKeys = Object.keys(TEMPERAMENTS);
  const familyKeys = Object.keys(SCALE_FAMILIES);
  let scaleKeys = [];
  const timers = { temp: null, family: null, scale: null };

  const shortTemperamentName = key => TEMPERAMENTS[key]?.name
    ?.replace('Equal (12-TET)', 'Equal')
    .replace('Just Intonation (5-limit)', 'Just')
    .replace('Pythagorean', 'Pythag.')
    .replace('Quarter-comma ', '')
    .replace('Meantone', 'Meantone')
    .replace('Werckmeister III', 'Werk. III') || key;
  const shortFamilyName = key => SCALE_FAMILIES[key]?.name
    ?.replace('Western Modes', 'Western')
    .replace('Pentatonic & Blues', 'Penta.')
    .replace('Arabic Maqamat', 'Arabic')
    .replace('Indian Ragas', 'Indian') || key;
  const shortScaleName = key => key.replace(/\s*\(.*\)/, '').trim();

  function renderWheel(scrollEl, values, labelFn) {
    scrollEl.innerHTML = '';
    values.forEach(value => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'scale-picker-item';
      item.dataset.value = value;
      item.textContent = labelFn(value);
      scrollEl.appendChild(item);
    });
  }

  function currentWheelValue(scrollEl, values) {
    if (!values.length) return null;
    return values[Math.max(0, Math.min(values.length - 1, Math.round(scrollEl.scrollTop / ITEM_H)))];
  }

  function highlightWheel(scrollEl, value) {
    scrollEl.querySelectorAll('.scale-picker-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.value === value);
    });
  }

  function syncWheel(scrollEl, values, value) {
    const idx = Math.max(0, values.indexOf(value));
    scrollEl.scrollTop = idx * ITEM_H;
    highlightWheel(scrollEl, values[idx] ?? value);
  }

  function syncSummary() {
    const familyName = SCALE_FAMILIES[S.family]?.name || S.family;
    summary.innerHTML = `<strong>${CHROMATIC[S.root]} ${S.scaleName}</strong><br>${shortTemperamentName(S.temp)} - ${familyName}`;
  }

  function rebuildScaleWheel() {
    scaleKeys = Object.keys(SCALE_FAMILIES[S.family]?.scales || {});
    renderWheel(scaleScroll, scaleKeys, shortScaleName);
    syncWheel(scaleScroll, scaleKeys, S.scaleName);
  }

  function currentStateFor(kind) {
    if (kind === 'temp') return S.temp;
    if (kind === 'family') return S.family;
    return S.scaleName;
  }

  function commitWheel(kind, value) {
    if (!value || value === currentStateFor(kind)) return;
    if (kind === 'temp') applyTemperamentSelection(value);
    else if (kind === 'family') { applyScaleFamilySelection(value); rebuildScaleWheel(); }
    else applyScaleNameSelection(value);
    syncSummary();
  }

  function scheduleWheelCommit(kind, scrollEl, values) {
    const value = currentWheelValue(scrollEl, values);
    highlightWheel(scrollEl, value);
    clearTimeout(timers[kind]);
    timers[kind] = setTimeout(() => commitWheel(kind, value), 90);
  }

  function wireWheel(kind, scrollEl, valuesRef, labelFn) {
    scrollEl.addEventListener('scroll', () => scheduleWheelCommit(kind, scrollEl, valuesRef()));
    scrollEl.addEventListener('click', e => {
      const item = e.target.closest('.scale-picker-item');
      if (!item) return;
      syncWheel(scrollEl, valuesRef(), item.dataset.value);
      commitWheel(kind, item.dataset.value);
    });
    renderWheel(scrollEl, valuesRef(), labelFn);
  }

  wireWheel('temp', tempScroll, () => tempKeys, shortTemperamentName);
  wireWheel('family', familyScroll, () => familyKeys, shortFamilyName);
  wireWheel('scale', scaleScroll, () => scaleKeys, shortScaleName);

  function syncFromState() {
    syncWheel(tempScroll, tempKeys, S.temp);
    syncWheel(familyScroll, familyKeys, S.family);
    rebuildScaleWheel();
    syncSummary();
  }

  function closePicker() {
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }

  setOpenScaleSettingsPicker(() => {
    if (!isScaleSidebarHidden()) return false;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(syncFromState);
    return true;
  });
  setSyncScalePickerUi(() => {
    if (overlay.style.display !== 'none') requestAnimationFrame(syncFromState);
    else syncSummary();
  });

  closeBtn.addEventListener('click', closePicker);
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.classList.contains('scale-picker-backdrop')) closePicker();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closePicker();
  });
  syncFromState();
})();

// ── BPM / note-len listeners ──────────────────────────────────────────

document.getElementById('seq-bpm')?.addEventListener('input', function () {
  document.getElementById('seq-bpm-val').textContent = this.value;
});
document.getElementById('seq-bpm')?.addEventListener('change', function () {
  SEQ.bpm = parseInt(this.value);
  setMasterBpm(Math.round(SEQ.bpm / syncTempoRatio));
  document.getElementById('seq-bpm-val').textContent = SEQ.bpm;
  if (seqEngine.playing) seqEngine.rebase();
  else Sync.send({ type: 'SEQ_PARAM', masterBpm });
});

document.getElementById('seq-note-len')?.addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('seq-note-len-val').textContent = v;
  applyNoteLen(v);
  Sync.send({ type: 'SEQ_PARAM', noteLen: v, gate: SEQ.gate });
});

// ── Sequencer grid actions ────────────────────────────────────────────

document.getElementById('btn-seq-undo')?.addEventListener('click', () => _seqUndoPop());
document.getElementById('btn-seq-panel-clear')?.addEventListener('click', () => { seqUndoPush(true); SEQ.grid = {}; scheduleDrawSequencer(); });

document.getElementById('btn-seq-mirror')?.addEventListener('click', () => {
  seqUndoPush(true);
  const len = SEQ.loopLen;
  Object.keys(SEQ.grid).filter(k => SEQ.grid[k]).forEach(key => {
    const [siStr, stStr] = key.split('_');
    SEQ.grid[`${siStr}_${len - 1 - parseInt(stStr, 10)}`] = 1;
  });
  scheduleDrawSequencer();
});

// ── Tap tempo ─────────────────────────────────────────────────────────

(function () {
  let _taps = [], _tapTimer = null;
  document.getElementById('btn-tap-tempo')?.addEventListener('click', () => {
    const now = performance.now();
    clearTimeout(_tapTimer);
    _tapTimer = setTimeout(() => { _taps = []; }, 2000);
    _taps.push(now);
    if (_taps.length > 8) _taps.shift();
    if (_taps.length < 2) return;
    const intervals = [];
    for (let i = 1; i < _taps.length; i++) intervals.push(_taps[i] - _taps[i - 1]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.max(40, Math.min(240, Math.round(60000 / avg)));
    SEQ.bpm = bpm;
    setMasterBpm(Math.round(bpm / syncTempoRatio));
    const sl = document.getElementById('seq-bpm');
    const vl = document.getElementById('seq-bpm-val');
    if (sl) sl.value = bpm;
    if (vl) vl.textContent = bpm;
    if (seqEngine.playing) seqEngine.rebase();
    else Sync.send({ type: 'SEQ_PARAM', masterBpm });
  });
})();

// ── Spacebar ──────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  e.preventDefault();
  if (seqEngine.playing) seqEngine.pause();
  else if (seqEngine.paused) seqEngine.play();
  else stopActiveMidiPlayer();
});

// ── BPM observer ─────────────────────────────────────────────────────

const seqBpmValEl = document.getElementById('seq-bpm-val');
if (seqBpmValEl) {
  new MutationObserver(() => syncVizBpmUi()).observe(seqBpmValEl, { childList: true, characterData: true, subtree: true });
}
syncVizBpmUi();

// ── SEQ UNDO ──────────────────────────────────────────────────────────

const _seqUndoStack = [];
const _SEQ_UNDO_MAX = 40;
let _seqUndoDebounceT = 0;

function _seqUndoSnapshot() {
  return { grid: { ...SEQ.grid }, loopLen: SEQ.loopLen, rhythmKey: SEQ.rhythmKey };
}

export function seqUndoPush(force = false) {
  const now = Date.now();
  if (!force && now - _seqUndoDebounceT < 300) return;
  _seqUndoDebounceT = now;
  _seqUndoStack.push(_seqUndoSnapshot());
  if (_seqUndoStack.length > _SEQ_UNDO_MAX) _seqUndoStack.shift();
  _syncSeqUndoBtn();
}

function _seqUndoPop() {
  if (!_seqUndoStack.length) return;
  const snap = _seqUndoStack.pop();
  SEQ.grid = snap.grid;
  SEQ.loopLen = snap.loopLen;
  if (snap.rhythmKey !== SEQ.rhythmKey) {
    SEQ.rhythmKey = snap.rhythmKey;
    const sel = document.getElementById('seq-rhythm');
    if (sel) sel.value = snap.rhythmKey;
    if (seqEngine.playing) seqEngine.rebase();
  }
  scheduleDrawSequencer();
  _syncSeqUndoBtn();
}

function _syncSeqUndoBtn() {
  const btn = document.getElementById('btn-seq-undo');
  if (btn) btn.disabled = _seqUndoStack.length === 0;
}

setSeqPreMutateCallback(() => seqUndoPush());
