// ═══════════════════════════════════════════════════════════════════
// VISUALIZER — circle of fifths canvas + ripple animations
// ═══════════════════════════════════════════════════════════════════

import { TEMPERAMENTS, CHROMATIC, CHORDS, MAQAM_CENTS, neutralDegrees } from './data.js';
import { S, SEQ, getScale, getScaleNotes, midiActiveQuantizedMidi } from './state.js';
import { audio } from './audio.js';

// ── Injected refs ───────────────────────────────────────────────────

let _seqEngine       = { playing: false, displayStep: -1 };
let _drawSequencer   = () => {};

export function setSeqEngineRef(ref)          { _seqEngine     = ref; }
export function setDrawSequencerCallback(fn)  { _drawSequencer = fn; }

// ── DOM ─────────────────────────────────────────────────────────────

export const canvas   = document.getElementById('canvas');
export const ctx      = canvas.getContext('2d');
export const vizPanel = document.getElementById('viz-panel');

// ── Helpers ─────────────────────────────────────────────────────────

let chordPolyPx = [];
export const CHORD_ZONE = 0.58;

export function noteAngle(noteIndex, tempKey) {
  return (TEMPERAMENTS[tempKey].cents[noteIndex] / 1200) * 2 * Math.PI - Math.PI / 2;
}

export function canvasXY(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width  / r.width),
    y: (e.clientY - r.top)  * (canvas.height / r.height),
  };
}

export function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

function scaleNoteAngle(scaleIdx, noteIdx, tempKey) {
  if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) {
    const c = MAQAM_CENTS[S.scaleName][scaleIdx];
    return (c / 1200) * 2 * Math.PI - Math.PI / 2;
  }
  return noteAngle(noteIdx, tempKey);
}

// ── Ripple animations ───────────────────────────────────────────────

let ripples      = [];
let animRunning  = false;

export function addRipple(x, y, color, maxR) {
  ripples.push({ x, y, color, maxR, r: maxR * 0.1, progress: 0 });
  if (!animRunning) { animRunning = true; requestAnimationFrame(animStep); }
}

function animStep() {
  if (ripples.length === 0) { animRunning = false; draw(); return; }
  draw();
  ripples = ripples.filter(rp => {
    rp.progress += 0.045;
    if (rp.progress >= 1) return false;
    const ease  = 1 - Math.pow(1 - rp.progress, 3);
    const r     = rp.maxR * 0.1 + (rp.maxR * 0.9) * ease;
    const alpha = (1 - rp.progress) * 0.9;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, r, 0, Math.PI * 2);
    ctx.strokeStyle  = rp.color;
    ctx.globalAlpha  = alpha;
    ctx.lineWidth    = 2.5;
    ctx.stroke();
    ctx.globalAlpha  = 1;
    return true;
  });
  requestAnimationFrame(animStep);
}

// ── Main draw ───────────────────────────────────────────────────────

export function draw() {
  const W = canvas.width, H = canvas.height;
  if (W < 110 || H < 110) { ctx.clearRect(0, 0, W, H); return; }
  const cx = W / 2, cy = H / 2;
  const R      = Math.min(W, H) * 0.355;
  const labelR = R + 22;
  const centsR = R + 40;
  const temp     = S.temp;
  const tempData = TEMPERAMENTS[temp];
  const scale      = getScale();
  const scaleNotes = getScaleNotes();
  const chord      = CHORDS[S.chordName];
  const chordNotes = chord ? chord.map(d => (d % 12 + S.chordRoot) % 12) : [];

  ctx.clearRect(0, 0, W, H);

  // Background glow
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
  bg.addColorStop(0, 'rgba(55,25,110,0.13)');
  bg.addColorStop(0.6, 'rgba(20,10,50,0.06)');
  bg.addColorStop(1, 'transparent');
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = bg; ctx.fill();

  // Outer ring
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1.5; ctx.stroke();

  // Inner ring
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.1, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.stroke();

  // Chord click zone indicator
  if (chord) {
    ctx.beginPath(); ctx.arc(cx, cy, R * CHORD_ZONE, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(52,211,153,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
  }

  // Quarter-tone tick ring for Arabic family
  if (S.family === 'arabic') {
    for (let q = 0; q < 24; q++) {
      const a         = (q / 24) * 2 * Math.PI - Math.PI / 2;
      const isFullSemi = q % 2 === 0;
      const r0         = isFullSemi ? R * 0.95 : R * 0.975;
      ctx.beginPath();
      ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
      ctx.lineTo(cx + R  * Math.cos(a), cy + R  * Math.sin(a));
      ctx.strokeStyle = isFullSemi ? 'rgba(255,255,255,0.12)' : 'rgba(245,158,11,0.28)';
      ctx.lineWidth   = isFullSemi ? 1 : 0.8;
      ctx.stroke();
    }
  }

  // Spokes (12 semitones)
  for (let i = 0; i < 12; i++) {
    const a = noteAngle(i, temp);
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.11 * Math.cos(a), cy + R * 0.11 * Math.sin(a));
    ctx.lineTo(cx + R * (S.family === 'arabic' ? 0.94 : 1.0) * Math.cos(a),
               cy + R * (S.family === 'arabic' ? 0.94 : 1.0) * Math.sin(a));
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1; ctx.stroke();
  }

  const scaleAngles = scale.map((deg, si) => scaleNoteAngle(si, scaleNotes[si], temp));
  const neutralSet  = (S.family === 'arabic') ? neutralDegrees(S.scaleName) : new Set();

  // Scale polygon
  if (scaleNotes.length > 1) {
    ctx.beginPath();
    scaleNotes.forEach((n, i) => {
      const a = scaleAngles[i];
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(167,139,250,0.52)'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
    ctx.fillStyle   = 'rgba(167,139,250,0.055)'; ctx.fill();
  }

  // Chord polygon
  chordPolyPx = [];
  if (chord && chordNotes.length > 1) {
    const chordR = R * 0.83;
    chordNotes.forEach(n => {
      const a = noteAngle(n, temp);
      chordPolyPx.push({ x: cx + chordR * Math.cos(a), y: cy + chordR * Math.sin(a) });
    });
    ctx.beginPath();
    chordPolyPx.forEach(({ x, y }, i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(52,211,153,0.85)'; ctx.lineWidth = 2.2; ctx.setLineDash([]); ctx.stroke();
    ctx.fillStyle   = 'rgba(52,211,153,0.07)'; ctx.fill();

    chordPolyPx.forEach(({ x, y }) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, 'rgba(52,211,153,0.85)'); g.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = '#34d399'; ctx.fill();
    });
  }

  // Non-scale chromatic dots
  for (let i = 0; i < 12; i++) {
    if (scaleNotes.includes(i)) continue;
    const a       = noteAngle(i, temp);
    const x       = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    const inChord = chordNotes.includes(i);
    ctx.beginPath(); ctx.arc(x, y, inChord ? 5.5 : 4, 0, Math.PI * 2);
    let fillStyle = 'rgba(255,255,255,0.13)';
    if (inChord) {
      const interval = (i - S.chordRoot + 12) % 12;
      if      (interval === 0)                    fillStyle = 'rgba(239,68,68,0.7)';
      else if (interval === 3 || interval === 4)  fillStyle = 'rgba(234,179,8,0.7)';
      else if (interval === 6 || interval === 7 || interval === 8) fillStyle = 'rgba(59,130,246,0.7)';
      else if (interval === 10 || interval === 11) fillStyle = 'rgba(16,185,129,0.7)';
      else                                         fillStyle = 'rgba(168,85,247,0.7)';
    }
    ctx.fillStyle = fillStyle; ctx.fill();
    if (S.showLabels) {
      ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillText(CHROMATIC[i], cx + labelR * Math.cos(a), cy + labelR * Math.sin(a));
    }
  }

  // Scale notes at authentic positions
  scaleNotes.forEach((noteIdx, si) => {
    const a       = scaleAngles[si];
    const x       = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    const isRoot  = noteIdx === S.root;
    const inChord = chordNotes.includes(noteIdx);
    const isNeutral = neutralSet.has(si);
    const dotR    = isRoot ? 10 : 8;

    let col, glowCol, glowR;
    if (inChord) {
      const interval = (noteIdx - S.chordRoot + 12) % 12;
      if      (interval === 0)                    { col = '#ef4444'; glowCol = 'rgba(239,68,68,0.45)'; }
      else if (interval === 3 || interval === 4)  { col = '#eab308'; glowCol = 'rgba(234,179,8,0.45)'; }
      else if (interval === 6 || interval === 7 || interval === 8) { col = '#3b82f6'; glowCol = 'rgba(59,130,246,0.45)'; }
      else if (interval === 10 || interval === 11) { col = '#10b981'; glowCol = 'rgba(16,185,129,0.45)'; }
      else                                         { col = '#a855f7'; glowCol = 'rgba(168,85,247,0.45)'; }
      glowR = 13;
    } else if (isRoot) {
      col = '#f59e0b'; glowCol = 'rgba(245,158,11,0.45)'; glowR = 15;
    } else {
      col = '#a78bfa'; glowCol = 'rgba(167,139,250,0.32)'; glowR = 12;
    }

    const g = ctx.createRadialGradient(x, y, dotR, x, y, glowR);
    g.addColorStop(0, glowCol); g.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, dotR,  0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();

    if (isRoot) {
      ctx.beginPath(); ctx.arc(x, y, dotR + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245,158,11,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([3,2]); ctx.stroke(); ctx.setLineDash([]);
    }

    if (isNeutral) {
      ctx.beginPath(); ctx.arc(x, y, dotR + 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245,158,11,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([2,2]); ctx.stroke(); ctx.setLineDash([]);
    }

    if (S.showLabels) {
      const lx = cx + labelR * Math.cos(a), ly = cy + labelR * Math.sin(a);
      ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = isRoot ? '#f59e0b' : '#ddd8ff';
      ctx.fillText(CHROMATIC[noteIdx], lx, ly);
      if (isNeutral) {
        ctx.font = '8px system-ui'; ctx.fillStyle = 'rgba(245,158,11,0.75)';
        ctx.fillText('½♭', lx + 12, ly - 5);
      }
    }

    if (S.showCents) {
      const lx = cx + centsR * Math.cos(a), ly = cy + centsR * Math.sin(a);
      ctx.font = '8.5px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) {
        const mCents = MAQAM_CENTS[S.scaleName][si];
        ctx.fillStyle = isNeutral ? 'rgba(245,158,11,0.8)' : 'rgba(255,255,255,0.3)';
        ctx.fillText(mCents + '¢', lx, ly);
      } else if (temp !== 'equal') {
        const deg = scale[si];
        const dev = tempData.cents[deg] - deg * 100;
        if (Math.abs(dev) > 0.4) {
          ctx.fillStyle = dev > 0 ? 'rgba(96,165,250,0.75)' : 'rgba(252,165,165,0.75)';
          ctx.fillText((dev > 0 ? '+' : '') + dev.toFixed(1) + '¢', lx, ly);
        }
      }
    }
  });

  // MIDI active note ring
  if (midiActiveQuantizedMidi !== null) {
    const _mpc = (midiActiveQuantizedMidi % 12 + 12) % 12;
    scaleNotes.forEach((noteIdx, si) => {
      if (noteIdx !== _mpc) return;
      const a = scaleAngles[si];
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3; ctx.setLineDash([]); ctx.stroke();
      const pg = ctx.createRadialGradient(x, y, 0, x, y, 22);
      pg.addColorStop(0, 'rgba(255,255,255,0.15)'); pg.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
    });
  }

  // Sequencer active step ring
  if (_seqEngine.playing && _seqEngine.displayStep >= 0) {
    const step = _seqEngine.displayStep;
    for (let si = 0; si < scale.length; si++) {
      if (!SEQ.grid[`${si}_${step}`]) continue;
      if (si >= scaleAngles.length) continue;
      const a = scaleAngles[si];
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56,189,248,0.92)';
      ctx.lineWidth = 2.5; ctx.setLineDash([]); ctx.stroke();
      const pg = ctx.createRadialGradient(x, y, 0, x, y, 30);
      pg.addColorStop(0, 'rgba(56,189,248,0.32)'); pg.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
    }
  }

  // Center labels
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 19px system-ui'; ctx.fillStyle = '#f59e0b';
  ctx.fillText(CHROMATIC[S.root], cx, cy - 9);
  ctx.font = '9.5px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillText(S.scaleName.replace(/\s*\(.*\)/, '').trim(), cx, cy + 9);
  if (S.chordName !== '— None —') {
    ctx.font = '8.5px system-ui'; ctx.fillStyle = 'rgba(52,211,153,0.55)';
    ctx.fillText(CHROMATIC[S.chordRoot] + ' ' + S.chordName, cx, cy + 23);
  }
  if (document.getElementById('seq-wrap').classList.contains('open')) _drawSequencer();
}

// ── Canvas interaction ──────────────────────────────────────────────

function getScaleFreqs() {
  const C4     = 261.62556;
  const rootHz = C4 * Math.pow(2, S.root / 12);
  if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) {
    const cents = MAQAM_CENTS[S.scaleName];
    const freqs = cents.map(c => rootHz * Math.pow(2, c / 1200));
    freqs.push(rootHz * 2);
    return freqs;
  }
  const scale = getScale();
  const freqs = scale.map(d => audio.degreeFreq(S.root, d, S.temp, 4));
  freqs.push(audio.degreeFreq(S.root, 0, S.temp, 5));
  return freqs;
}

function getChordFreqs() {
  const chord = CHORDS[S.chordName];
  if (!chord || chord.length === 0) return [];
  return chord.map(d => audio.degreeFreq(S.chordRoot, d % 12, S.temp, 4 + Math.floor(d / 12)));
}

export function playChordNow() {
  if (_seqEngine.playing) return;
  const freqs = getChordFreqs();
  if (!freqs.length) return;
  audio.playChord(freqs);
  const W = canvas.width, H = canvas.height;
  addRipple(W / 2, H / 2, 'rgba(52,211,153,0.75)', Math.min(W, H) * 0.355 * 0.58);
}

canvas.addEventListener('click', e => {
  if (_seqEngine.playing) return;
  const { x, y } = canvasXY(e);
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R    = Math.min(W, H) * 0.355;
  const dist = Math.hypot(x - cx, y - cy);
  if (dist > R * 1.15) return;
  const chordActive = CHORDS[S.chordName] !== null;
  if (chordActive && dist < R * CHORD_ZONE) {
    playChordNow();
  } else {
    audio.playArpeggio(getScaleFreqs());
    addRipple(cx, cy, 'rgba(167,139,250,0.65)', R);
  }
});

canvas.addEventListener('mousemove', e => {
  const { x, y } = canvasXY(e);
  const cx   = canvas.width  / 2, cy = canvas.height / 2;
  const R    = Math.min(canvas.width, canvas.height) * 0.355;
  const dist = Math.hypot(x - cx, y - cy);
  const chordActive = CHORDS[S.chordName] !== null;
  if (dist > R * 1.15) { canvas.style.cursor = 'default'; canvas.title = ''; return; }
  canvas.style.cursor = 'pointer';
  canvas.title = (chordActive && dist < R * CHORD_ZONE) ? 'Click · play chord' : 'Click · play arpeggio';
});
