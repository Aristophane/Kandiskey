// ═══════════════════════════════════════════════════════════════════
// SOLO — live performance pad: chords or notes from current scale,
//        arranged so root(I) is flanked by IV (left) and V (right).
// ═══════════════════════════════════════════════════════════════════

import { CHROMATIC, TEMPERAMENTS } from './data.js';
import { S, getScale } from './state.js';
import { audio } from './audio.js';

// Separate synth state — independent of the sequencer's SYNTH
export const SOLO_SYNTH = {
  waveform:     'sine',
  attack:       0.010,
  decay:        0.50,
  sustain:      0.55,
  detune:       0,
  numHarmonics: 6,
  filterFreq:   3500,
  filterQ:      1.2,
  vibratoRate:  5.5,
  vibratoDepth: 0,
  harmonics: [[1,1.0,1.0],[2,0.44,0.72],[3,0.22,0.50],[4,0.11,0.35],[5,0.055,0.22],[6,0.022,0.14],[7,0.011,0.1],[8,0.006,0.07]],
};

export let soloMode   = 'chords';
export let soloOctave = 4;

export function setSoloMode(m) {
  soloMode = m;
  renderSoloPads();
}
export function setSoloOctave(o) {
  soloOctave = Math.max(2, Math.min(6, o));
  const el = document.getElementById('solo-oct-val');
  if (el) el.textContent = soloOctave;
  renderSoloPads();
}

// Circle-of-fifths rank per chromatic pitch class
// [C=0, C#=7, D=2, D#=9, E=4, F=11, F#=6, G=1, G#=8, A=3, A#=10, B=5]
const FIFTHS_RANK = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

// Sort scale-degree indices so the result reads: ...IV, I, V, II, VI, III, VII...
function getFifthsOrder() {
  const scale = getScale();
  return scale
    .map((_, i) => i)
    .sort((a, b) =>
      FIFTHS_RANK[(scale[a] + S.root) % 12] -
      FIFTHS_RANK[(scale[b] + S.root) % 12]
    );
}

function getTriadQuality(scale, i) {
  const len = scale.length;
  if (len < 3) return 'maj';
  const d0 = scale[i];
  const d2 = scale[(i + 2) % len];
  const d4 = scale[(i + 4) % len];
  const third = ((d2 - d0 + 12) % 12);
  let   fifth = ((d4 - d0 + 24) % 12);
  if (fifth < third) fifth += 12;
  if (third === 3 && fifth === 6) return 'dim';
  if (third === 4 && fifth === 8) return 'aug';
  return third === 3 ? 'min' : 'maj';
}

const Q_COL = {
  maj: { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.55)', text: '#fde68a' },
  min: { bg: 'rgba(59,130,246,0.18)', border: 'rgba(59,130,246,0.55)', text: '#93c5fd' },
  dim: { bg: 'rgba(239,68,68,0.18)',  border: 'rgba(239,68,68,0.55)',  text: '#fca5a5' },
  aug: { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.55)', text: '#6ee7b7' },
};
const Q_SFX = { maj: '', min: 'm', dim: '°', aug: '+' };

function _noteFreq(deg, oct) {
  const C4 = 261.62556;
  return C4 * Math.pow(2, S.root / 12)
           * Math.pow(2,
               TEMPERAMENTS[S.temp].cents[deg % 12] / 1200
               + Math.floor(deg / 12)
               + (oct - 4));
}

function _playFreqs(freqs) {
  if (!audio.enabled) return;
  audio._resume();
  const actx = audio.actx;
  if (!actx) return;

  const ss  = SOLO_SYNTH;
  const t   = actx.currentTime;
  const dur = Math.max(ss.attack + ss.decay + 0.2, 1.0);

  freqs.forEach((hz, fi) => {
    const off = fi * 0.016;
    const env = actx.createGain();
    env.connect(audio.melodyBus);

    const pk = 0.20;
    env.gain.setValueAtTime(0, t + off);
    env.gain.linearRampToValueAtTime(pk, t + off + ss.attack);
    env.gain.exponentialRampToValueAtTime(pk * Math.max(ss.sustain, 0.001), t + off + ss.attack + ss.decay);
    env.gain.setValueAtTime(pk * Math.max(ss.sustain, 0.001), t + off + dur - 0.12);
    env.gain.exponentialRampToValueAtTime(0.00015, t + off + dur + 0.1);

    const flt = actx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = ss.filterFreq;
    flt.Q.value = ss.filterQ;
    flt.connect(env);

    let lfo = null;
    if (ss.vibratoDepth > 0) {
      lfo = actx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = ss.vibratoRate;
      lfo.start(t + off + ss.attack * 0.6);
      lfo.stop(t + off + dur + 0.2);
    }

    if (ss.waveform !== 'sine') {
      const osc = actx.createOscillator();
      osc.type = ss.waveform;
      osc.frequency.value = hz;
      osc.detune.value = ss.detune;
      if (lfo) {
        const lg = actx.createGain();
        lg.gain.value = hz * (Math.pow(2, ss.vibratoDepth / 1200) - 1);
        lfo.connect(lg); lg.connect(osc.frequency);
      }
      osc.connect(flt); osc.start(t + off); osc.stop(t + off + dur + 0.2);
    } else {
      ss.harmonics.slice(0, ss.numHarmonics).forEach(([m, a, df]) => {
        const osc = actx.createOscillator();
        const g   = actx.createGain();
        osc.type = 'sine';
        osc.frequency.value = hz * m;
        osc.detune.value = ss.detune;
        if (lfo) {
          const lg = actx.createGain();
          lg.gain.value = hz * m * (Math.pow(2, ss.vibratoDepth / 1200) - 1);
          lfo.connect(lg); lg.connect(osc.frequency);
        }
        const hd = dur * df + 0.05;
        g.gain.setValueAtTime(a, t + off);
        g.gain.exponentialRampToValueAtTime(0.00015, t + off + hd);
        osc.connect(g); g.connect(flt); osc.start(t + off); osc.stop(t + off + hd + 0.1);
      });
    }

  });
}

export function renderSoloPads() {
  const container = document.getElementById('solo-pads');
  if (!container) return;
  container.innerHTML = '';

  const scale = getScale();
  if (!scale.length) return;

  const order = getFifthsOrder();
  const len   = scale.length;

  // Three octave rows: high → middle → low
  [soloOctave + 1, soloOctave, soloOctave - 1].forEach(oct => {
    const row = document.createElement('div');
    row.className = 'solo-row';

    order.forEach(di => {
      const deg      = scale[di];
      const noteName = CHROMATIC[(deg + S.root) % 12];
      const btn      = document.createElement('button');
      btn.className  = 'solo-pad';

      if (soloMode === 'chords') {
        const q   = getTriadQuality(scale, di);
        const col = Q_COL[q];
        btn.style.cssText = `background:${col.bg};border-color:${col.border};color:${col.text}`;
        btn.innerHTML = `<span class="solo-pad-name">${noteName}${Q_SFX[q]}</span><span class="solo-pad-oct">${oct}</span>`;

        const d2 = scale[(di + 2) % len];
        const d4 = scale[(di + 4) % len];
        const f0 = _noteFreq(deg, oct);
        const f2 = _noteFreq(d2, d2 < deg ? oct + 1 : oct);
        const f4 = _noteFreq(d4, d4 < deg ? oct + 1 : oct);
        const play = () => _playFreqs([f0, f2, f4]);
        btn.addEventListener('mousedown',  play);
        btn.addEventListener('touchstart', e => { e.preventDefault(); play(); }, { passive: false });
      } else {
        const isRoot = di === 0;
        const col    = isRoot
          ? { bg: 'rgba(245,158,11,0.22)', border: 'rgba(245,158,11,0.6)',  text: '#fde68a' }
          : { bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.4)', text: '#c4b5fd' };
        btn.style.cssText = `background:${col.bg};border-color:${col.border};color:${col.text}`;
        btn.innerHTML = `<span class="solo-pad-name">${noteName}</span><span class="solo-pad-oct">${oct}</span>`;

        const freq = _noteFreq(deg, oct);
        const play = () => _playFreqs([freq]);
        btn.addEventListener('mousedown',  play);
        btn.addEventListener('touchstart', e => { e.preventDefault(); play(); }, { passive: false });
      }

      row.appendChild(btn);
    });

    container.appendChild(row);
  });
}
