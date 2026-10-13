import { S, SEQ, SYNTH, setDrumLoopLen, drumLoopLen } from './state.js';
import { TEMPERAMENTS, SCALE_FAMILIES } from './data.js';
import { audio } from './audio.js';
import { DRUM_GRID, activeDrumBank, activePads, setActivePad, invalidateBankKeys, reloadDrumBank, scheduleDrmDraw, drumVelocity, setDrumVelocity } from './drum.js';
import { scheduleDrawSequencer } from './sequencer.js';
import { SOLO_SYNTH, setSoloMode, setSoloOctave, soloMode } from './solo.js';
import { draw } from './visualizer.js';
import { scheduleDrawFretboard } from './fretboard.js';
import { captureState, saveToFile, loadFromFile, autosaveToCache, autoloadFromCache, saveClip, getClips, deleteClip } from './project.js';
import { applyNoteLen, _waveIO, fmtHz, fmtMs } from './ui-synth.js';
import { _syncGrooveUi, syncVizBpmUi } from './ui-sequencer.js';
import { getMixerState } from './ui-mixer.js';
import { updateInfo, refreshRootUi, buildScaleSelect, populateScaleSelect } from './ui-scale.js';
import { autoFillClipSlots } from './ui-clips.js';

// ── getDrumState ──────────────────────────────────────────────────────

export function getDrumState() {
  return {
    bank:       activeDrumBank,
    activePads: [...activePads],
    loopLen:    drumLoopLen,
    velocity:   drumVelocity,
    grid:       { ...DRUM_GRID },
  };
}

// ── _setSliderAndFire / _syncSynthUi ──────────────────────────────────

function _setSliderAndFire(id, val) {
  const el = document.getElementById(id);
  if (!el || val === undefined) return;
  el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function _syncSynthUi(p, prefix) {
  const set = (slId, lblId, slVal, lblText) => {
    const sl = document.getElementById(slId); if (sl) sl.value = slVal;
    const lb = document.getElementById(lblId); if (lb) lb.textContent = lblText;
  };
  set(prefix+'attack',    prefix+'atk-val', Math.round(p.attack * 1000),  fmtMs(Math.round(p.attack * 1000)));
  set(prefix+'decay',     prefix+'dec-val', Math.round(p.decay * 1000),   fmtMs(Math.round(p.decay * 1000)));
  set(prefix+'filter',    prefix+'flt-val', p.filterFreq,                 fmtHz(p.filterFreq));
  set(prefix+'res',       prefix+'res-val', p.filterQ,                    p.filterQ.toFixed(1));
  set(prefix+'vib-rate',  prefix+'vbr-val', p.vibratoRate,                p.vibratoRate.toFixed(1)+'Hz');
  set(prefix+'vib-depth', prefix+'vbd-val', p.vibratoDepth,               p.vibratoDepth+'¢');
  set(prefix+'sustain',   prefix+'sus-val', Math.round(p.sustain * 100),  Math.round(p.sustain * 100)+'%');
  set(prefix+'detune',    prefix+'det-val', p.detune ?? 0,                (p.detune ?? 0)+'¢');
}

function withAudio(fn) { audio._resume(); setTimeout(fn, 0); }

// ── applyProjectSnapshot ──────────────────────────────────────────────

export function applyProjectSnapshot(snap) {
  if (!snap || snap.version !== 1) {
    console.warn('[project] Unsupported version:', snap?.version);
    return;
  }

  if (snap.scale) {
    Object.assign(S, snap.scale);
    const el = id => document.getElementById(id);
    if (el('sel-family'))      el('sel-family').value      = S.family;
    if (el('mob-family-sel'))  el('mob-family-sel').value  = S.family;
    buildScaleSelect();
    populateScaleSelect('mob-scale-sel');
    if (el('sel-scale'))       el('sel-scale').value       = S.scaleName;
    if (el('mob-scale-sel'))   el('mob-scale-sel').value   = S.scaleName;
    if (el('sel-temperament')) el('sel-temperament').value = S.temp;
    if (el('mob-temp-sel'))    el('mob-temp-sel').value    = S.temp;
    if (el('temp-desc') && TEMPERAMENTS[S.temp]) el('temp-desc').textContent = TEMPERAMENTS[S.temp].desc;
    const octLbl = document.getElementById('oct-lbl');
    if (octLbl) octLbl.textContent = 'Oct ' + S.octave;
    refreshRootUi();
  }

  if (snap.sequencer) {
    const { grid, groove, ...seqMeta } = snap.sequencer;
    Object.assign(SEQ, seqMeta);
    SEQ.grid = grid ? { ...grid } : {};
    if (groove) Object.assign(SEQ.groove, groove);
    const bpmSl = document.getElementById('seq-bpm');
    const bpmVl = document.getElementById('seq-bpm-val');
    if (bpmSl) bpmSl.value = SEQ.bpm;
    if (bpmVl) bpmVl.textContent = SEQ.bpm;
    const lenSl = document.getElementById('seq-note-len');
    const lenVl = document.getElementById('seq-note-len-val');
    if (lenSl) lenSl.value = SEQ.noteLen;
    if (lenVl) lenVl.textContent = SEQ.noteLen;
    applyNoteLen(SEQ.noteLen);
    const rhythmSel = document.getElementById('seq-rhythm');
    if (rhythmSel) rhythmSel.value = SEQ.rhythmKey;
    _syncGrooveUi(SEQ.groove);
    syncVizBpmUi();
    scheduleDrawSequencer();
  }

  if (snap.synth) {
    const { sampleBuffer: _sb, customWave: _cw, ...synthData } = snap.synth;
    Object.assign(SYNTH, synthData);
    SYNTH.sampleBuffer = null;
    SYNTH.customWave   = null;
    _syncSynthUi(SYNTH, 'syn-');
    const harmSl = document.getElementById('syn-harmonics');
    const harmVl = document.getElementById('syn-harm-val');
    if (harmSl) harmSl.value = SYNTH.numHarmonics ?? 6;
    if (harmVl) harmVl.textContent = SYNTH.numHarmonics ?? 6;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    withAudio(() => audio.applyFilter());
  }

  if (snap.wave && _waveIO.applyState) {
    _waveIO.applyState(snap.wave);
  }

  if (_waveIO.setSourceMode) _waveIO.setSourceMode(SYNTH.sourceMode);

  if (snap.soloSynth) {
    Object.assign(SOLO_SYNTH, snap.soloSynth);
    _syncSynthUi(SOLO_SYNTH, 'solo-syn-');
  }
  if (snap.solo) {
    if (snap.solo.mode !== undefined) {
      setSoloMode(snap.solo.mode);
      document.getElementById('solo-mode-chords')?.classList.toggle('active', soloMode === 'chords');
      document.getElementById('solo-mode-notes')?.classList.toggle('active',  soloMode === 'notes');
    }
    if (snap.solo.octave !== undefined) setSoloOctave(snap.solo.octave);
  }

  if (snap.drums) {
    const d = snap.drums;
    for (const k of Object.keys(DRUM_GRID)) delete DRUM_GRID[k];
    if (d.grid) Object.assign(DRUM_GRID, d.grid);
    if (Array.isArray(d.activePads)) d.activePads.forEach((key, i) => setActivePad(i, key));
    if (d.velocity !== undefined) {
      setDrumVelocity(d.velocity);
      const velSl = document.getElementById('drum-vel');
      const velVl = document.getElementById('drum-vel-val');
      if (velSl) velSl.value = Math.round(d.velocity * 100);
      if (velVl) velVl.textContent = Math.round(d.velocity * 100) + '%';
    }
    if (d.loopLen !== undefined) setDrumLoopLen(d.loopLen);
    if (d.bank && d.bank !== activeDrumBank) {
      const bankSel = document.getElementById('drum-bank-sel');
      if (bankSel) bankSel.value = d.bank;
      reloadDrumBank(d.bank, () => { invalidateBankKeys(); scheduleDrmDraw(); });
    } else {
      invalidateBankKeys();
      scheduleDrmDraw();
    }
  }

  if (snap.mixer) {
    const mx = snap.mixer;
    _setSliderAndFire('mix-melody',     mx.melody);
    _setSliderAndFire('mix-drums',      mx.drums);
    _setSliderAndFire('mix-master',     mx.master);
    _setSliderAndFire('mix-reverb',     mx.reverb);
    _setSliderAndFire('mix-dist',       mx.dist);
    _setSliderAndFire('mix-delay-wet',  mx.delayWet);
    _setSliderAndFire('mix-delay-time', mx.delayTime);
    _setSliderAndFire('mix-delay-fb',   mx.delayFb);
    _setSliderAndFire('mix-gflt-cut',   mx.gfltCut);
    _setSliderAndFire('mix-gflt-res',   mx.gfltRes);
    if (mx.gfltType) {
      document.querySelectorAll('[data-type]').forEach(b =>
        b.classList.toggle('active', b.dataset.type === mx.gfltType));
      withAudio(() => { if (audio.globalFilter) audio.globalFilter.type = mx.gfltType; });
    }
  }

  updateInfo();
  draw();
  if (S.fretboardOpen) scheduleDrawFretboard();
}

// ── window.Project ────────────────────────────────────────────────────

window.Project = {
  save(name) {
    const snap = captureState({ getMixerState, getDrumState, getWaveState: () => _waveIO.getState?.() });
    if (name) snap.meta.name = name;
    saveToFile(snap, snap.meta.name);
  },
  async load() {
    const snap = await loadFromFile();
    applyProjectSnapshot(snap);
    return snap;
  },
  saveSeqClip(name) {
    return saveClip('seq', SEQ.grid, SEQ.loopLen, name);
  },
  saveDrumClip(name) {
    return saveClip('drums', DRUM_GRID, drumLoopLen, name);
  },
  applySeqClip(clip) {
    SEQ.grid = { ...clip.grid };
    if (clip.loopLen !== undefined) SEQ.loopLen = clip.loopLen;
    scheduleDrawSequencer();
  },
  applyDrumClip(clip) {
    for (const k of Object.keys(DRUM_GRID)) delete DRUM_GRID[k];
    Object.assign(DRUM_GRID, clip.grid);
    if (clip.loopLen !== undefined) setDrumLoopLen(clip.loopLen);
    scheduleDrmDraw();
  },
  getClips,
  deleteClip,
  autosave() {
    const snap = captureState({ getMixerState, getDrumState, getWaveState: () => _waveIO.getState?.() });
    autosaveToCache(snap);
    return snap;
  },
  restore() {
    const snap = autoloadFromCache();
    if (snap) applyProjectSnapshot(snap);
    return snap;
  },
};

// ── Save button ───────────────────────────────────────────────────────

(function initSaveBtn() {
  const btn = document.getElementById('btn-save');
  if (!btn) return;
  const useEl   = btn.querySelector('use');
  const textEl  = btn.querySelector('.btn-text');
  let clickTimer    = null;
  let longTimer     = null;
  let suppressClick = false;
  let importMode    = false;

  function flashSaved() {
    btn.classList.remove('save-flash');
    void btn.offsetWidth;
    btn.classList.add('save-flash');
    setTimeout(() => btn.classList.remove('save-flash'), 700);
  }

  function enterImportMode() {
    importMode = true;
    btn.classList.add('import-mode');
    if (useEl)  useEl.setAttribute('href', '#icon-import');
    if (textEl) textEl.textContent = ' Import';
    btn.title = 'Tap to import a project file';
  }

  function exitImportMode() {
    importMode = false;
    btn.classList.remove('import-mode');
    if (useEl)  useEl.setAttribute('href', '#icon-save');
    if (textEl) textEl.textContent = ' Save';
    btn.title = 'Save (double-tap to download)';
  }

  btn.addEventListener('pointerdown', () => {
    longTimer = setTimeout(() => {
      longTimer     = null;
      suppressClick = true;
      if (importMode) exitImportMode(); else enterImportMode();
    }, 600);
  });

  function cancelLong() {
    if (longTimer) { clearTimeout(longTimer); longTimer = null; }
  }
  btn.addEventListener('pointerup',    cancelLong);
  btn.addEventListener('pointerleave', cancelLong);

  btn.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }

    if (importMode) {
      exitImportMode();
      loadFromFile().then(snap => applyProjectSnapshot(snap)).catch(() => {});
      return;
    }

    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      const snap = captureState({ getMixerState, getDrumState, getWaveState: () => _waveIO.getState?.() });
      saveToFile(snap, snap.meta.name || 'project');
    } else {
      clickTimer = setTimeout(() => {
        clickTimer = null;
        autosaveToCache(captureState({ getMixerState, getDrumState, getWaveState: () => _waveIO.getState?.() }));
        autoFillClipSlots();
        flashSaved();
      }, 300);
    }
  });

  document.addEventListener('click', e => {
    if (importMode && !btn.contains(e.target)) exitImportMode();
  });
})();
