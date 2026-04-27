// ═══════════════════════════════════════════════════════════════════
// VISUALIZER — circle of fifths canvas + ripple animations
// ═══════════════════════════════════════════════════════════════════

import { TEMPERAMENTS, CHROMATIC, CHORDS, MAQAM_CENTS, neutralDegrees } from './data.js';
import { S, SEQ, getScale, getScaleNotes, midiActiveQuantizedMidi } from './state.js';
import { audio } from './audio.js';
import { tunerState } from './tuner.js';

// ── Injected refs ───────────────────────────────────────────────────

let _seqEngine       = { playing: false, displayStep: -1 };
let _drawSequencer   = () => {};
let _applyRootSelection = () => false;
let _handleCenterInteraction = () => false;
let _onFilterChange  = null;

export function setSeqEngineRef(ref)          { _seqEngine     = ref; }
export function setDrawSequencerCallback(fn)  { _drawSequencer = fn; }
export function setRootSelectionCallback(fn)  { _applyRootSelection = fn; }
export function setCenterInteractionCallback(fn) { _handleCenterInteraction = fn; }
export function setFilterChangeCallback(fn)   { _onFilterChange = fn; }

// ── Filter drag state ───────────────────────────────────────────────

let _filterNorm       = 1.0;  // 0 = fully closed, 1 = fully open
let _filterRotAngle   = -Math.PI / 2;
let _filterAnimRunning = false;
let _filterLastTs     = 0;
let _filterDragPtrId  = null;
let _filterDragStartY = 0;
let _filterDragStartNorm = 1.0;
let _filterDragActive = false;
let _filterWasDragging = false;

export function setFilterNorm(norm) {
  _filterNorm = Math.max(0, Math.min(1, norm));
  _startFilterAnim();
}

function _startFilterAnim() {
  if (_filterAnimRunning) return;
  _filterAnimRunning = true;
  _filterLastTs = 0;
  requestAnimationFrame(_filterAnimStep);
}

function _filterAnimStep(ts) {
  const dt = _filterLastTs ? (ts - _filterLastTs) / 1000 : 0;
  _filterLastTs = ts;
  // One full rotation per quarter-BPM beat: (BPM/4) rpm → (BPM/4)/60 rps → × 2π rad/s
  const rps = (SEQ.bpm / 12 / 60) * Math.PI * 2;
  _filterRotAngle += rps * dt;
  draw();
  if (_filterDragPtrId !== null || _filterNorm < 0.995) {
    requestAnimationFrame(_filterAnimStep);
  } else {
    _filterAnimRunning = false;
    _filterLastTs = 0;
  }
}

// ── DOM ─────────────────────────────────────────────────────────────

export const canvas   = document.getElementById('canvas');
export const ctx      = canvas.getContext('2d');
export const vizPanel = document.getElementById('viz-panel');

// ── Helpers ─────────────────────────────────────────────────────────

let chordPolyPx = [];
let noteHitZones = [];
let centerHitZone = null;
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

const _isTouch = () => window.matchMedia('(pointer: coarse)').matches;

function rememberNoteHitZone(noteIdx, x, y, dotR, kind) {
  noteHitZones.push({
    noteIdx,
    x,
    y,
    r: _isTouch() ? Math.max(dotR + 18, 26) : Math.max(dotR + 10, 14),
    kind,
  });
}

function findNoteHitZone(x, y) {
  let bestZone = null;
  let bestDistSq = Infinity;
  for (const zone of noteHitZones) {
    const dx = x - zone.x;
    const dy = y - zone.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > zone.r * zone.r || distSq >= bestDistSq) continue;
    bestZone = zone;
    bestDistSq = distSq;
  }
  return bestZone;
}

function pointInCircle(x, y, zone) {
  if (!zone) return false;
  return Math.hypot(x - zone.x, y - zone.y) <= zone.r;
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

// ── Filter arc visual ───────────────────────────────────────────────

function drawFilterArc(cx, cy, R) {
  if (_isTouch()) return;
  if (_filterNorm >= 0.995 && _filterDragPtrId === null) return;
  const sweepAngle = _filterNorm * Math.PI * 2;
  const innerR = R * 0.115;
  const outerR = R * 0.36;
  const midR = (innerR + outerR) / 2;
  const arcW = outerR - innerR;
  const N = 60;
  ctx.save();
  ctx.lineWidth = arcW;
  ctx.lineCap = 'butt';
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const a0 = _filterRotAngle + t * sweepAngle;
    const a1 = _filterRotAngle + (i + 1) / N * sweepAngle;
    // hue: 265 (violet) → 185 (cyan) → 38 (amber)
    const hue = t < 0.5 ? 265 - t * 2 * 80 : 185 - (t - 0.5) * 2 * 147;
    const alpha = (0.18 + 0.55 * Math.sin(t * Math.PI)) * (0.4 + 0.6 * _filterNorm);
    ctx.strokeStyle = `hsla(${hue},88%,65%,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, midR, a0, a1);
    ctx.stroke();
  }
  // Leading tip glow
  if (sweepAngle > 0.05) {
    const tipA = _filterRotAngle + sweepAngle;
    const tx = cx + midR * Math.cos(tipA);
    const ty = cy + midR * Math.sin(tipA);
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, arcW * 1.6);
    g.addColorStop(0, `rgba(251,191,36,${(0.5 + 0.4 * _filterNorm).toFixed(2)})`);
    g.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(tx, ty, arcW * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();
}

// ── Main draw ───────────────────────────────────────────────────────

export function draw() {
  const W = canvas.width, H = canvas.height;
  noteHitZones = [];
  centerHitZone = null;
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
  const transport = _seqEngine.getTransportSnapshot?.();

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

  // Global filter sweep arc
  drawFilterArc(cx, cy, R);

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
    rememberNoteHitZone(i, x, y, inChord ? 5.5 : 4, 'chromatic');
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
    rememberNoteHitZone(noteIdx, x, y, dotR, 'scale');

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

  // Sequencer active step ring + next-step ghost lighting
  if (transport?.playing && transport.currentStep >= 0) {
    const step = transport.currentStep;
    const nextStep = transport.nextStep;
    const phase = transport.stepPhase;
    for (let si = 0; si < scale.length; si++) {
      const isCurrent = !!SEQ.grid[`${si}_${step}`];
      const isNext = !!SEQ.grid[`${si}_${nextStep}`];
      if (!isCurrent && !isNext) continue;
      if (si >= scaleAngles.length) continue;
      const a = scaleAngles[si];
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      if (isCurrent) {
        ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56,189,248,${(0.45 + (1 - phase) * 0.47).toFixed(2)})`;
        ctx.lineWidth = 2.5; ctx.setLineDash([]); ctx.stroke();
        const pg = ctx.createRadialGradient(x, y, 0, x, y, 30);
        pg.addColorStop(0, `rgba(56,189,248,${(0.16 + (1 - phase) * 0.22).toFixed(2)})`);
        pg.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
      }
      if (isNext && phase > 0.02) {
        ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(245,158,11,${(phase * 0.32).toFixed(2)})`;
        ctx.lineWidth = 1.5; ctx.stroke();
        const ng = ctx.createRadialGradient(x, y, 0, x, y, 34);
        ng.addColorStop(0, `rgba(245,158,11,${(phase * 0.18).toFixed(2)})`);
        ng.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fillStyle = ng; ctx.fill();
      }
    }
  }

  // Tuner overlay
  if (tunerState.active) {
    const t = performance.now() / 600;
    if (tunerState.noteIndex >= 0) {
      const a = noteAngle(tunerState.noteIndex, temp);
      const nx = cx + R * Math.cos(a), ny = cy + R * Math.sin(a);
      const pulse = 0.75 + 0.25 * Math.sin(t * Math.PI * 2);
      const inTune = Math.abs(tunerState.centsOff) < 5;
      const nearTune = Math.abs(tunerState.centsOff) < 20;
      const noteCol = inTune ? '#34d399' : nearTune ? '#f59e0b' : '#ef4444';
      const gg = ctx.createRadialGradient(nx, ny, 5, nx, ny, 26 * pulse);
      gg.addColorStop(0, noteCol + 'dd'); gg.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(nx, ny, 26 * pulse, 0, Math.PI * 2); ctx.fillStyle = gg; ctx.fill();
      ctx.beginPath(); ctx.arc(nx, ny, 14, 0, Math.PI * 2);
      ctx.strokeStyle = noteCol; ctx.lineWidth = 2.5; ctx.setLineDash([]); ctx.stroke();

      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 34px system-ui'; ctx.fillStyle = noteCol;
      ctx.fillText(tunerState.noteName, cx, cy - 18);
      const sign = tunerState.centsOff >= 0 ? '+' : '';
      ctx.font = 'bold 14px system-ui'; ctx.fillStyle = noteCol;
      ctx.fillText(`${sign}${tunerState.centsOff.toFixed(1)}¢`, cx, cy + 8);

      // ── Cents gauge ──────────────────────────────────────────────
      const barW = R * 0.74, barH = 16, barY = cy + 28, barX = cx - barW / 2;

      // Track background
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 8); ctx.fill();

      // Green in-tune zone (±5¢)
      const zoneW = barW * (10 / 100);
      ctx.fillStyle = 'rgba(52,211,153,0.22)';
      ctx.fillRect(cx - zoneW / 2, barY, zoneW, barH);

      // Tick marks at ±50, ±25, 0
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      [-50, -25, 0, 25, 50].forEach(c => {
        const tx = cx + (c / 50) * (barW / 2);
        const isCenter = c === 0;
        const tickH = isCenter ? barH : barH * 0.55;
        ctx.fillStyle = isCenter ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)';
        ctx.fillRect(tx - (isCenter ? 1.5 : 1), barY + (barH - tickH) / 2, isCenter ? 3 : 2, tickH);
        if (c !== -25 && c !== 25) {
          ctx.font = '9px system-ui';
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillText(c === 0 ? '0' : (c > 0 ? `+${c}¢` : `${c}¢`), tx, barY + barH + 3);
        }
      });

      // Needle (glowing)
      const clampedCents = Math.max(-50, Math.min(50, tunerState.centsOff));
      const needleX = cx + (clampedCents / 50) * (barW / 2);
      ctx.shadowColor = noteCol; ctx.shadowBlur = 12;
      ctx.fillStyle = noteCol;
      ctx.beginPath(); ctx.roundRect(needleX - 5, barY - 6, 10, barH + 12, 4); ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI));
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.18, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(167,139,250,${0.35 * pulse})`; ctx.lineWidth = 2; ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '13px system-ui'; ctx.fillStyle = `rgba(167,139,250,${0.5 + 0.4 * pulse})`;
      ctx.fillText('🎙 listening…', cx, cy);
    }
  } else {
    // Center labels
    const rootFontSize = Math.round(Math.max(28, Math.min(46, R * 0.26)));
    const scaleFontSize = Math.round(Math.max(12, Math.min(18, R * 0.115)));
    const chordFontSize = Math.round(Math.max(10, Math.min(14, R * 0.08)));
    const scaleLabel = S.scaleName.replace(/\s*\(.*\)/, '').trim();
    const chordLabel = CHORDS[S.chordName] !== null ? `${CHROMATIC[S.chordRoot]} ${S.chordName}` : '';
    const centerActionAvailable = !!_handleCenterInteraction('available');
    centerHitZone = {
      x: cx,
      y: cy + (chordLabel ? 4 : 0),
      r: Math.max(R * (chordLabel ? 0.24 : 0.2), 32),
    };
    if (centerActionAvailable) {
      ctx.beginPath();
      ctx.arc(centerHitZone.x, centerHitZone.y, centerHitZone.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerHitZone.x, centerHitZone.y, centerHitZone.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245,158,11,0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${rootFontSize}px system-ui`; ctx.fillStyle = '#f59e0b';
    ctx.fillText(CHROMATIC[S.root], cx, cy - rootFontSize * 0.14);
    ctx.font = `${scaleFontSize}px system-ui`; ctx.fillStyle = 'rgba(255,255,255,0.46)';
    ctx.fillText(scaleLabel, cx, cy + scaleFontSize * 1.08);
    if (S.chordName !== '— None —') {
      ctx.font = `${chordFontSize}px system-ui`; ctx.fillStyle = 'rgba(52,211,153,0.62)';
      ctx.fillText(chordLabel, cx, cy + scaleFontSize * 2.1 + chordFontSize * 0.2);
    }
  }

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

// ── Filter drag ─────────────────────────────────────────────────────

canvas.addEventListener('pointerdown', e => {
  if (_isTouch()) return; // filter drag disabled on touch — notes use click instead
  const { x, y } = canvasXY(e);
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const R = Math.min(canvas.width, canvas.height) * 0.355;
  if (Math.hypot(x - cx, y - cy) > R * 1.15) return;
  if (findNoteHitZone(x, y)) return;
  if (pointInCircle(x, y, centerHitZone) && _handleCenterInteraction('available')) return;
  _filterDragPtrId   = e.pointerId;
  _filterDragStartY  = e.clientY;
  _filterDragStartNorm = _filterNorm;
  _filterDragActive  = false;
  _filterWasDragging = false;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== _filterDragPtrId) return;
  const dy = e.clientY - _filterDragStartY;
  if (!_filterDragActive && Math.abs(dy) < 8) return;
  _filterDragActive  = true;
  _filterWasDragging = true;
  _filterNorm = Math.max(0, Math.min(1, _filterDragStartNorm - dy / 220));
  if (_onFilterChange) _onFilterChange(_filterNorm);
  _startFilterAnim();
  canvas.style.cursor = 'ns-resize';
});

canvas.addEventListener('pointerup', e => {
  if (e.pointerId !== _filterDragPtrId) return;
  _filterDragPtrId = null;
  if (!_filterDragActive) return;
  canvas.style.cursor = '';
  // let the animation keep running until norm reaches 1
  _startFilterAnim();
});

canvas.addEventListener('lostpointercapture', e => {
  if (e.pointerId === _filterDragPtrId) _filterDragPtrId = null;
});

// Prevent long-press context menu from suspending audio on mobile
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ── Canvas click ─────────────────────────────────────────────────────

canvas.addEventListener('click', e => {
  if (_filterWasDragging) { _filterWasDragging = false; return; }
  const { x, y } = canvasXY(e);
  const noteZone = findNoteHitZone(x, y);
  if (noteZone) {
    if (_applyRootSelection(noteZone.noteIdx) !== false) {
      const rippleColor = noteZone.kind === 'scale' ? 'rgba(245,158,11,0.72)' : 'rgba(255,255,255,0.42)';
      addRipple(noteZone.x, noteZone.y, rippleColor, Math.max(noteZone.r * 1.85, 24));
    }
    return;
  }
  if (pointInCircle(x, y, centerHitZone) && _handleCenterInteraction('activate')) {
    addRipple(centerHitZone.x, centerHitZone.y, 'rgba(245,158,11,0.55)', Math.max(centerHitZone.r * 1.35, 36));
    return;
  }
  if (_seqEngine.playing) return;
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
  const noteZone = findNoteHitZone(x, y);
  if (noteZone) {
    canvas.style.cursor = 'pointer';
    canvas.title = `Click · set root to ${CHROMATIC[noteZone.noteIdx]}`;
    return;
  }
  if (pointInCircle(x, y, centerHitZone) && _handleCenterInteraction('available')) {
    canvas.style.cursor = 'pointer';
    canvas.title = _handleCenterInteraction('label') || 'Click - open scale settings';
    return;
  }
  const cx   = canvas.width  / 2, cy = canvas.height / 2;
  const R    = Math.min(canvas.width, canvas.height) * 0.355;
  const dist = Math.hypot(x - cx, y - cy);
  const chordActive = CHORDS[S.chordName] !== null;
  if (dist > R * 1.15) { canvas.style.cursor = 'default'; canvas.title = ''; return; }
  canvas.style.cursor = 'grab';
  const filterPct = Math.round(_filterNorm * 100);
  const filterLabel = _filterNorm >= 0.995 ? 'Open' : (Math.round(20 * Math.pow(1000, _filterNorm)) >= 1000
    ? (Math.round(20 * Math.pow(1000, _filterNorm)) / 1000).toFixed(1) + 'kHz'
    : Math.round(20 * Math.pow(1000, _filterNorm)) + 'Hz');
  if (_seqEngine.playing) {
    canvas.title = `Drag · filter cutoff (${filterLabel})`;
    return;
  }
  canvas.title = (chordActive && dist < R * CHORD_ZONE)
    ? `Click · play chord  |  Drag · filter cutoff (${filterLabel})`
    : `Click · play arpeggio  |  Drag · filter cutoff (${filterLabel})`;
});
