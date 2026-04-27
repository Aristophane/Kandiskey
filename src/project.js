// ═══════════════════════════════════════════════════════════════════
// PROJECT — save / load / clip system
//
// captureState / applyState handle raw JS objects only (no DOM).
// DOM sync lives in main.js (applyProjectSnapshot).
// ═══════════════════════════════════════════════════════════════════

import { S, SEQ, SYNTH } from './state.js';
import { SOLO_SYNTH, soloMode, soloOctave } from './solo.js';

const VERSION = 1;

// Fields that cannot round-trip through JSON (AudioBuffer, PeriodicWave).
const SKIP_SYNTH_FIELDS = new Set(['sampleBuffer', 'customWave']);

function serializeSynth(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (!SKIP_SYNTH_FIELDS.has(k)) out[k] = obj[k];
  }
  return out;
}

// ── Capture ──────────────────────────────────────────────────────────
// Spread entire state objects so any new property is automatically
// included without touching this file.

export function captureState({ getMixerState, getDrumState, getWaveState }) {
  return {
    version: VERSION,
    meta: {
      name: 'Project',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    },
    scale:     { ...S },
    sequencer: { ...SEQ, grid: { ...SEQ.grid } },
    synth:     serializeSynth(SYNTH),
    soloSynth: { ...SOLO_SYNTH },
    solo:      { mode: soloMode, octave: soloOctave },
    drums:     getDrumState(),
    mixer:     getMixerState(),
    wave:      getWaveState ? getWaveState() : null,
  };
}

// ── File I/O ─────────────────────────────────────────────────────────

export function saveToFile(snap, name = 'project') {
  const json = JSON.stringify(snap, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = name.endsWith('.json') ? name : name + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function loadFromFile() {
  return new Promise((resolve, reject) => {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.json,application/json';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const snap = JSON.parse(text);
        resolve(snap);
      } catch (err) {
        reject(new Error('Invalid project file: ' + err.message));
      }
    };
    input.click();
  });
}

// ── Clips ────────────────────────────────────────────────────────────
// Lightweight per-grid snapshots stored in localStorage.
// type: 'seq' | 'drums'

const CLIPS_KEY = 'kdk_clips_v1';

function _persistClips(clips) {
  try { localStorage.setItem(CLIPS_KEY, JSON.stringify(clips)); } catch { /* quota */ }
}

function _loadClips() {
  try { return JSON.parse(localStorage.getItem(CLIPS_KEY) || '[]'); } catch { return []; }
}

export function saveClip(type, grid, loopLen, name = '') {
  const clips = _loadClips();
  const clip  = {
    type,
    name:    name || new Date().toLocaleTimeString(),
    grid:    { ...grid },
    loopLen,
    saved:   new Date().toISOString(),
  };
  clips.push(clip);
  _persistClips(clips);
  return clip;
}

export function getClips(type) {
  const all = _loadClips();
  return type ? all.filter(c => c.type === type) : all;
}

export function deleteClip(idx) {
  const clips = _loadClips();
  clips.splice(idx, 1);
  _persistClips(clips);
}

// ── Autosave ──────────────────────────────────────────────────────────
// Full-project snapshot persisted in localStorage (survives page close).

const AUTOSAVE_KEY = 'kdk_project_autosave_v1';

export function autosaveToCache(snap) {
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap)); } catch { /* quota */ }
}

export function autoloadFromCache() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
