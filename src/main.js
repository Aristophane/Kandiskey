import './style.css';
import * as Sync from './sync.js';
import { startTuner, stopTuner, tunerState } from './tuner.js';

import { S, seqSteps } from './state.js';
import { audio } from './audio.js';
import {
  DRUM_GRID, DRUM_SOUND_BANKS, drumVelocity, setDrumVelocity,
  activeBankKeys, activeBankLabels,
  activePads, setActivePad, activeDrumBank,
  loadDrumSamples, reloadDrumBank, scheduleDrmDraw, loadWorldRhythm,
  invalidateBankKeys, syncDrumSoundBankManifest,
  setSyncSend as drumSetSyncSend, setSeqEngineRef as drumSetSeqEngineRef,
  WORLD_RHYTHMS_DRUM,
} from './drum.js';
import {
  seqEngine, drawSequencer, scheduleDrawSequencer, getSeqActiveFreqs, seqLoadDemo,
  setDrawCallback, setSyncSend as seqSetSyncSend,
  setSyncGetFullState, setSyncPlayUI, setStopMidiPlayer,
  setDrawFretboardCallback as seqSetDrawFretboard,
} from './sequencer.js';
import { autoloadFromCache } from './project.js';

import {
  draw, canvas, vizPanel,
  setSeqEngineRef as vizSetSeqEngineRef,
  setDrawSequencerCallback,
  setCenterInteractionCallback,
  setRootSelectionCallback,
  setFilterChangeCallback,
} from './visualizer.js';
import {
  drawFretboard,
  scheduleDrawFretboard,
  setSeqEngineRef as fbSetSeqEngineRef,
  setGetSeqActiveFreqsCallback,
} from './fretboard.js';
import {
  MidiPlayer, MIDI_FILES, loadMidiFile, stopActiveMidiPlayer, wireMidiControls,
  setDrawCallback as midiSetDraw,
  setDrawFretboardCallback as midiSetDrawFretboard,
} from './midi.js';

// ── UI modules (side-effects: each registers its own event listeners) ─
import {
  applyRootSelection, updateInfo, refreshRootUi,
  buildNoteGrid, buildTemperamentSelect, buildFamilySelect, buildScaleSelect,
  buildChordTypeGrid, buildTuningSelect, drawTonnetz,
  isScaleSidebarHidden, callOpenScaleSettingsPicker,
} from './ui-scale.js';
import { scheduleWaveCanvasAnimation } from './ui-synth.js';
import './ui-sequencer.js';
import { drmUndoPush, startClipAnim, setTriggerSequencerPlay } from './ui-clips.js';
import { syncMixerUi } from './ui-mixer.js';
import { isMobileSlides, scrollToSlide } from './ui-mobile.js';
import { syncGetFullState, initSync } from './ui-sync.js';
import { applyProjectSnapshot } from './ui-project.js';

// ── Wire injected callbacks ───────────────────────────────────────────

setDrawCallback(draw);
seqSetSyncSend(msg => Sync.send(msg));
setSyncGetFullState(syncGetFullState);
setSyncPlayUI(syncPlayUI);
setStopMidiPlayer(stopActiveMidiPlayer);
seqSetDrawFretboard(scheduleDrawFretboard);

vizSetSeqEngineRef(seqEngine);
setDrawSequencerCallback(drawSequencer);
setRootSelectionCallback(noteIdx => applyRootSelection(noteIdx));
setCenterInteractionCallback(mode => {
  if (!isScaleSidebarHidden()) {
    return mode === 'label' ? '' : false;
  }
  if (mode === 'label') return 'Click - open scale settings';
  if (mode === 'available') return true;
  return callOpenScaleSettingsPicker();
});

fbSetSeqEngineRef(seqEngine);
setGetSeqActiveFreqsCallback(getSeqActiveFreqs);

drumSetSeqEngineRef(seqEngine);
drumSetSyncSend(msg => Sync.send(msg));

midiSetDraw(draw);
midiSetDrawFretboard(scheduleDrawFretboard);

setFilterChangeCallback(norm => {
  const slider = document.getElementById('mix-gflt-cut');
  const label  = document.getElementById('mix-gflt-val');
  const v = norm * 100;
  const hz = v >= 100 ? 20000 : Math.round(20 * Math.pow(1000, v / 100));
  if (slider) slider.value = v;
  if (label) label.textContent = v >= 100 ? 'Open' : (hz >= 1000 ? (hz / 1000).toFixed(1) + 'kHz' : hz + 'Hz');
  withAudio(() => { if (audio.globalFilter) audio.globalFilter.frequency.setTargetAtTime(hz, audio.actx.currentTime, 0.015); });
});

// Inject triggerSequencerPlay into ui-clips.js (avoids circular dependency)
setTriggerSequencerPlay(() => triggerSequencerPlay());

// ── Utilities ─────────────────────────────────────────────────────────

function withAudio(fn) { audio._resume(); setTimeout(fn, 0); }

// ── syncPlayUI ────────────────────────────────────────────────────────

function syncPlayUI(state) {
  ['btn-seq-play', 'mob-btn-play', 'btn-seq-panel-play', 'btn-drum-panel-play', 'btn-clips-panel-play', 'btn-mob-footer-play'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = state === 'playing' ? 'none' : '';
  });
  ['btn-seq-pause', 'mob-btn-pause', 'btn-seq-panel-pause', 'btn-drum-panel-pause', 'btn-clips-panel-pause', 'btn-mob-footer-pause'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = state === 'playing' ? '' : 'none';
  });
  ['btn-seq-stop', 'mob-btn-stop', 'btn-seq-panel-stop', 'btn-drum-panel-stop', 'btn-clips-panel-stop', 'btn-mob-footer-stop'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = state !== 'stopped' ? '' : 'none';
  });
  document.body.classList.toggle('seq-is-playing', state === 'playing');
  ['btn-seq-panel-mute', 'btn-drum-panel-mute'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = state === 'playing' ? 'none' : '';
  });
  if (state === 'playing') startClipAnim();
}

// ── triggerSequencerPlay ──────────────────────────────────────────────

let _tunerPausedSeq = false;

function triggerSequencerPlay() {
  if (tunerState.active) {
    stopTuner();
    document.getElementById('btn-tuner').classList.remove('active-tuner');
    _tunerPausedSeq = false;
  }
  seqEngine.play();
}

// ── RESIZE ────────────────────────────────────────────────────────────

function resize() {
  const w = vizPanel.clientWidth || window.innerWidth;
  const stripH = parseFloat(getComputedStyle(document.body).getPropertyValue('--strip-h')) || 0;
  const h = vizPanel.clientHeight || (window.innerHeight - 80 - stripH);
  const size = Math.max(60, Math.min(w - 40, h - 40, 640));
  canvas.width = size;
  canvas.height = size;
  draw();
  if (S.fretboardOpen) drawFretboard();
  drawTonnetz();
  if (isMobileSlides()) { scheduleDrawSequencer(); scheduleDrmDraw(); return; }
  if (document.getElementById('seq-wrap').classList.contains('open')) scheduleDrawSequencer();
  if (document.getElementById('drum-wrap').classList.contains('open')) scheduleDrmDraw();
}

const ro = new ResizeObserver(() => resize());
ro.observe(vizPanel);

// Let mobile slides trigger resize via event (avoids circular import)
window.addEventListener('app-resize', () => resize());

// ── HEADER BUTTONS ────────────────────────────────────────────────────

function syncAudioUi() {
  const hdrBtn = document.getElementById('btn-audio');
  if (hdrBtn) {
    hdrBtn.classList.toggle('active-audio', audio.enabled);
    hdrBtn.innerHTML = audio.enabled
      ? '<svg class="hdr-icon"><use href="#icon-audio"></use></svg><span class="btn-text"> Audio</span>'
      : '<svg class="hdr-icon"><use href="#icon-muted"></use></svg><span class="btn-text"> Muted</span>';
  }
  ['btn-viz-mute', 'btn-seq-panel-mute', 'btn-drum-panel-mute', 'btn-clips-panel-mute', 'btn-mob-footer-mute'].forEach(id => {
    const vizBtn = document.getElementById(id);
    if (!vizBtn) return;
    vizBtn.classList.toggle('active-audio', audio.enabled);
    vizBtn.classList.toggle('muted', !audio.enabled);
    vizBtn.title = audio.enabled ? 'Mute audio' : 'Unmute audio';
    vizBtn.setAttribute('aria-label', audio.enabled ? 'Mute audio' : 'Unmute audio');
    vizBtn.innerHTML = audio.enabled
      ? '<svg class="hdr-icon"><use href="#icon-audio"></use></svg>'
      : '<svg class="hdr-icon"><use href="#icon-muted"></use></svg>';
  });
}

function toggleAudioEnabled() {
  audio.enabled = !audio.enabled;
  syncAudioUi();
}

['btn-audio', 'btn-viz-mute', 'btn-seq-panel-mute', 'btn-drum-panel-mute', 'btn-clips-panel-mute', 'btn-mob-footer-mute'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => toggleAudioEnabled());
});

['btn-viz-mixer', 'btn-seq-panel-mixer', 'btn-drum-panel-mixer', 'btn-clips-panel-mixer', 'btn-mob-footer-mixer'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => document.getElementById('btn-mixer')?.click());
});

['btn-viz-bpm', 'btn-seq-panel-bpm', 'btn-drum-panel-bpm', 'btn-clips-panel-bpm', 'btn-mob-footer-bpm'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => document.getElementById('bpm-display-btn')?.click());
});

syncAudioUi();

function updateOctaveLabel() {
  document.getElementById('oct-lbl').textContent = 'Oct ' + S.octave;
}
document.getElementById('btn-oct-down')?.addEventListener('click', () => {
  if (S.octave > 0) { S.octave--; updateOctaveLabel(); }
});
document.getElementById('btn-oct-up')?.addEventListener('click', () => {
  if (S.octave < 6) { S.octave++; updateOctaveLabel(); }
});

document.getElementById('btn-guitar')?.addEventListener('click', function () {
  S.fretboardOpen = !S.fretboardOpen;
  const wrap = document.getElementById('fretboard-wrap');
  wrap.classList.toggle('open', S.fretboardOpen);
  this.classList.toggle('active-fb', S.fretboardOpen);
  if (S.fretboardOpen) setTimeout(drawFretboard, 320);
});

document.getElementById('btn-seq-synth')?.addEventListener('click', function () {
  const wrap = document.getElementById('synth-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-synth', open);
  this.innerHTML = `<svg class="hdr-icon" style="width:0.9em;height:0.9em"><use href="#icon-synth"></use></svg> Sound ${open ? '▴' : '▾'}`;
  if (open) scheduleWaveCanvasAnimation();
});

// ── PARAMS DRAWER TOGGLES ─────────────────────────────────────────────
(function () {
  function setupDrawer(btnId, drawerId) {
    const btn = document.getElementById(btnId);
    const drawer = document.getElementById(drawerId);
    if (!btn || !drawer) return;
    const isPhone = () => window.innerWidth <= 768;
    btn.addEventListener('click', () => {
      if (isPhone()) {
        const nowOpen = drawer.classList.toggle('open');
        btn.classList.toggle('open', nowOpen);
        btn.setAttribute('aria-expanded', nowOpen);
      } else {
        const nowClosed = drawer.classList.toggle('closed');
        btn.classList.toggle('open', !nowClosed);
        btn.setAttribute('aria-expanded', !nowClosed);
      }
    });
  }
  setupDrawer('btn-seq-params', 'seq-params-drawer');
  setupDrawer('btn-drum-params', 'drum-params-drawer');
})();

// ── PLAY / PAUSE / STOP buttons ───────────────────────────────────────

['btn-seq-play', 'mob-btn-play', 'btn-seq-panel-play', 'btn-drum-panel-play', 'btn-clips-panel-play', 'btn-mob-footer-play'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => triggerSequencerPlay());
});
['btn-seq-pause', 'mob-btn-pause', 'btn-seq-panel-pause', 'btn-drum-panel-pause', 'btn-clips-panel-pause', 'btn-mob-footer-pause'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => seqEngine.pause());
});
['btn-seq-stop', 'mob-btn-stop', 'btn-seq-panel-stop', 'btn-drum-panel-stop', 'btn-clips-panel-stop', 'btn-mob-footer-stop'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => seqEngine.stop());
});

// ── MIXER button ──────────────────────────────────────────────────────

document.getElementById('btn-mixer')?.addEventListener('click', function () {
  const wrap = document.getElementById('mixer-wrap');
  const open = wrap.classList.toggle('open');
  syncMixerUi(open);
  document.body.classList.toggle('mixer-open', open);
});

// ── TUNER ─────────────────────────────────────────────────────────────

document.getElementById('btn-tuner')?.addEventListener('click', async function () {
  if (tunerState.active) {
    stopTuner();
    this.classList.remove('active-tuner');
    draw();
    if (_tunerPausedSeq) { _tunerPausedSeq = false; seqEngine.play(); }
  } else {
    [
      { wrap: 'seq-wrap',       btn: 'btn-seq',       cls: 'active-seq'   },
      { wrap: 'drum-wrap',      btn: 'btn-drums',     cls: 'active-drums' },
      { wrap: 'fretboard-wrap', btn: 'btn-guitar',    cls: 'active-fb'    },
      { wrap: 'mixer-wrap',     btn: 'btn-mixer',     cls: 'active-mixer' },
      { wrap: 'synth-wrap',     btn: 'btn-seq-synth', cls: 'active-synth' },
    ].forEach(({ wrap, btn, cls }) => {
      document.getElementById(wrap)?.classList.remove('open');
      document.getElementById(btn)?.classList.remove(cls);
    });
    syncMixerUi(false);
    document.body.classList.remove('mixer-open');
    S.fretboardOpen = false;

    if (seqEngine.playing) { seqEngine.pause(); _tunerPausedSeq = true; }
    if (isMobileSlides()) scrollToSlide(0);

    try {
      await startTuner(draw);
      this.classList.add('active-tuner');
    } catch (err) {
      alert('Microphone access denied: ' + (err.message || err));
    }
  }
});

// ── MIDI FILE SELECT ──────────────────────────────────────────────────

(function () {
  const sel = document.getElementById('midi-file-sel');
  MIDI_FILES.forEach((f, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = f.title;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', function () { loadMidiFile(parseInt(this.value)); });
})();

wireMidiControls();

// ── DRUM MACHINE WIRING ───────────────────────────────────────────────

document.getElementById('btn-drums')?.addEventListener('click', function () {
  if (isMobileSlides()) { scrollToSlide(2); loadDrumSamples(() => scheduleDrmDraw()); return; }
  const wrap = document.getElementById('drum-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-drums', open);
  if (open) { loadDrumSamples(() => scheduleDrmDraw()); scheduleDrmDraw(); }
});

(function () {
  const bankSel = document.getElementById('drum-bank-sel');
  syncDrumSoundBankManifest();
  Object.keys(DRUM_SOUND_BANKS).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = (DRUM_SOUND_BANKS[key].name || key);
    if (key === activeDrumBank) opt.selected = true;
    bankSel.appendChild(opt);
  });
  bankSel.addEventListener('change', function () {
    reloadDrumBank(this.value, () => {
      invalidateBankKeys();
      scheduleDrmDraw();
      const cfg = document.getElementById('drum-pad-config');
      if (cfg && cfg.style.display !== 'none') renderDrumPadConfig();
    });
  });

  const sel = document.getElementById('drum-preset-sel');
  Object.keys(WORLD_RHYTHMS_DRUM).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', function () { drmUndoPush(true); loadWorldRhythm(this.value); });

  if (sel.value) loadWorldRhythm(sel.value);
})();

document.getElementById('drum-vel')?.addEventListener('input', function () {
  setDrumVelocity(parseInt(this.value) / 100);
  document.getElementById('drum-vel-val').textContent = parseInt(this.value) + '%';
});

document.getElementById('btn-drum-pads')?.addEventListener('click', function () {
  const cfg = document.getElementById('drum-pad-config');
  const open = cfg.style.display === 'none';
  cfg.style.display = open ? 'flex' : 'none';
  this.classList.toggle('active', open);
  if (open) renderDrumPadConfig();
});

function renderDrumPadConfig() {
  const cfg = document.getElementById('drum-pad-config');
  cfg.innerHTML = '';
  const labels = activeBankLabels();
  const allKeys = Object.keys(labels);
  activePads.forEach((padKey, i) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;';
    const lbl = document.createElement('span');
    lbl.textContent = 'Pad ' + (i + 1);
    lbl.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.45);font-family:monospace;';
    const sel = document.createElement('select');
    sel.className = 'sm';
    allKeys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = labels[k] || k;
      if (k === padKey) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      setActivePad(i, this.value);
      invalidateBankKeys();
      loadDrumSamples(() => scheduleDrmDraw());
    });
    wrap.appendChild(lbl);
    wrap.appendChild(sel);
    cfg.appendChild(wrap);
  });
}

function clearDrumGrid() {
  activeBankKeys().forEach(key => {
    for (let st = 0; st < seqSteps(); st++) delete DRUM_GRID[key + '_' + st];
  });
  document.getElementById('drum-preset-sel').value = 'Clear';
  scheduleDrmDraw();
}
document.getElementById('btn-drum-panel-clear')?.addEventListener('click', () => { drmUndoPush(true); clearDrumGrid(); });

// ── INIT ──────────────────────────────────────────────────────────────

buildNoteGrid('root-grid', 'root');
buildNoteGrid('chord-grid', 'chordRoot');
buildTemperamentSelect();
buildFamilySelect();
buildScaleSelect();
buildChordTypeGrid();
buildTuningSelect();
updateInfo();
seqLoadDemo();
requestAnimationFrame(() => requestAnimationFrame(resize));

const _restored = autoloadFromCache();
if (_restored) applyProjectSnapshot(_restored);

initSync();
