// ═══════════════════════════════════════════════════════════════════
// TUNER — microphone pitch detection via autocorrelation
// ═══════════════════════════════════════════════════════════════════

import { TEMPERAMENTS } from './data.js';
import { S } from './state.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const C4_REF = 261.62556; // Hz

function freqToNote(freq) {
  const cents = (TEMPERAMENTS[S.temp] ?? TEMPERAMENTS.equal).cents;
  let bestNote = -1, bestCentsOff = Infinity;
  for (let oct = 1; oct <= 8; oct++) {
    for (let ni = 0; ni < 12; ni++) {
      const target = C4_REF * Math.pow(2, oct - 4 + cents[ni] / 1200);
      const co = 1200 * Math.log2(freq / target);
      if (Math.abs(co) < Math.abs(bestCentsOff)) { bestCentsOff = co; bestNote = ni; }
    }
  }
  return { noteIndex: bestNote, centsOff: bestCentsOff };
}

export const tunerState = {
  active:    false,
  noteIndex: -1,
  centsOff:  0,
  freq:      0,
  noteName:  '',
};

let _stream      = null;
let _actx        = null;
let _source      = null;
let _analyser    = null;
let _rafId       = null;
let _onUpdate    = () => {};
let _smoothFreq  = -1;   // EMA-smoothed frequency
let _silentFrames = 0;   // frames since last valid detection
const SMOOTH     = 0.15; // EMA weight for new readings (lower = smoother)
const HOLD_FRAMES = 12;  // frames of silence before blanking display

function autocorrelate(buf, sampleRate) {
  const SIZE  = buf.length;
  const MAX_S = Math.floor(sampleRate / 60);
  const MIN_S = Math.floor(sampleRate / 1400);

  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / SIZE) < 0.008) return -1;

  let bestOffset = -1, bestCorr = 0, lastCorr = 1, foundGo = false;

  for (let offset = MIN_S; offset < MAX_S; offset++) {
    let corr = 0;
    const len = SIZE - MAX_S;
    for (let i = 0; i < len; i++) corr += Math.abs(buf[i] - buf[i + offset]);
    corr = 1 - corr / len;
    if (corr > 0.9 && corr > lastCorr) foundGo = true;
    if (foundGo && corr < lastCorr) {
      if (corr > bestCorr) { bestCorr = corr; bestOffset = offset - 1; }
      foundGo = false;
    }
    lastCorr = corr;
  }

  if (bestOffset === -1 || bestCorr < 0.9) return -1;

  // Parabolic interpolation for sub-sample precision
  const len = SIZE - MAX_S;
  let y1 = 0, y2 = 0, y3 = 0;
  for (let i = 0; i < len; i++) {
    y1 += Math.abs(buf[i] - buf[i + bestOffset - 1]);
    y2 += Math.abs(buf[i] - buf[i + bestOffset]);
    y3 += Math.abs(buf[i] - buf[i + bestOffset + 1]);
  }
  y1 = 1 - y1/len; y2 = 1 - y2/len; y3 = 1 - y3/len;
  const shift = (y3 - y1) / (2 * (2*y2 - y1 - y3));
  return sampleRate / (bestOffset + shift);
}

function loop() {
  if (!_analyser) return;
  const buf = new Float32Array(_analyser.fftSize);
  _analyser.getFloatTimeDomainData(buf);
  const freq = autocorrelate(buf, _actx.sampleRate);

  if (freq > 0) {
    _silentFrames = 0;
    // EMA on frequency — reset if pitch jumps by more than a semitone to avoid lag on intentional note changes
    if (_smoothFreq < 0 || Math.abs(1200 * Math.log2(freq / _smoothFreq)) > 100) {
      _smoothFreq = freq;
    } else {
      _smoothFreq = _smoothFreq * (1 - SMOOTH) + freq * SMOOTH;
    }
    const { noteIndex, centsOff } = freqToNote(_smoothFreq);
    tunerState.freq      = _smoothFreq;
    tunerState.noteIndex = noteIndex;
    tunerState.centsOff  = centsOff;
    tunerState.noteName  = NOTE_NAMES[noteIndex];
  } else {
    _silentFrames++;
    if (_silentFrames >= HOLD_FRAMES) {
      tunerState.noteIndex = -1;
      tunerState.freq      = 0;
      tunerState.noteName  = '';
      tunerState.centsOff  = 0;
      _smoothFreq          = -1;
    }
  }

  _onUpdate();
  _rafId = requestAnimationFrame(loop);
}

export async function startTuner(onUpdate = () => {}) {
  _onUpdate = onUpdate;
  tunerState.active = true;
  try {
    _stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    _actx     = new AudioContext();
    _source   = _actx.createMediaStreamSource(_stream);
    _analyser = _actx.createAnalyser();
    _analyser.fftSize = 4096;
    _source.connect(_analyser);
    _rafId = requestAnimationFrame(loop);
  } catch (err) {
    tunerState.active = false;
    throw err;
  }
}

export function stopTuner() {
  tunerState.active    = false;
  tunerState.noteIndex = -1;
  tunerState.freq      = 0;
  tunerState.noteName  = '';
  tunerState.centsOff  = 0;
  _smoothFreq = -1; _silentFrames = 0;
  if (_rafId)    { cancelAnimationFrame(_rafId); _rafId = null; }
  if (_source)   { _source.disconnect(); _source = null; }
  _analyser = null;
  if (_actx)     { _actx.close(); _actx = null; }
  if (_stream)   { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
}
