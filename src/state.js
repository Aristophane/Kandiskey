// ═══════════════════════════════════════════════════════════════════
// STATE — mutable runtime state + derived helpers
// ═══════════════════════════════════════════════════════════════════

import { SCALE_FAMILIES, RHYTHMS } from './data.js';

// ── Synth parameters (read live by AudioEngine._playHz)
const _SMOOTH_WAVES = ['sine', 'triangle'];

export const SYNTH = {
  waveform:     _SMOOTH_WAVES[Math.round(Math.random())],
  attack:       0.008,
  decay:        0.30,
  sustain:      0.62,
  detune:       0,
  numHarmonics: 6,
  filterFreq:   4000,
  filterQ:      1.0,
  vibratoRate:  5.5,
  vibratoDepth: 0,
  harmonics: [[1,1.0,1.0],[2,0.44,0.72],[3,0.22,0.50],[4,0.11,0.35],[5,0.055,0.22],[6,0.022,0.14],[7,0.011,0.1],[8,0.006,0.07]],
  sourceMode:     'synth',
  customWave:     null,
  sampleBuffer:   null,
  sampleBaseFreq: 440,
};

// ── UI / music state
export const S = {
  root: 0, octave: 4, temp: 'equal', family: 'western', scaleName: 'Major (Ionian)',
  chordRoot: 0, chordName: '— None —',
  showCents: true, showLabels: true,
  tuning: 'Standard (EADGBE)',
  fretboardOpen: false,
  fbMode: 'both',
};

// ── Step sequencer state
export const SEQ = {
  bpm:       120,
  rhythmKey: '16 steps',
  noteLen:   25,    // 0-100 combined length param → drives gate + SYNTH.decay + SYNTH.sustain
  gate:      0.30,  // derived from noteLen; read directly by sequencer engine
  grid:      {},
  loopLen:   16,
};

export let drumLoopLen = 16;
export function setDrumLoopLen(v) { drumLoopLen = v; }

// ── World beat clock
export let epochMs        = null;
export let peerEpochMs    = null;
export let masterBpm      = SEQ.bpm;
export let syncTempoRatio = 1;

export function setEpochMs(v)        { epochMs        = v; }
export function setPeerEpochMs(v)    { peerEpochMs    = v; }
export function setMasterBpm(v)      { masterBpm      = v; }
export function setSyncTempoRatio(v) { syncTempoRatio = v; }

// ── MIDI active note (written by midi.js, read by visualizer + fretboard)
export let midiActiveQuantizedMidi = null;
export function setMidiActiveQuantizedMidi(v) { midiActiveQuantizedMidi = v; }

// ── Derived helpers (read SEQ + RHYTHMS)
export function seqR()       { return RHYTHMS[SEQ.rhythmKey]; }
export function seqStepDur() { return 60 / SEQ.bpm / seqR().spb; }
export function seqSteps()   { return seqR().steps; }

// ── Scale helpers (read S + SCALE_FAMILIES)
export function getScale() {
  const f = SCALE_FAMILIES[S.family];
  return f ? (f.scales[S.scaleName] || []) : [];
}
export function getScaleNotes() { return getScale().map(d => (d + S.root) % 12); }
