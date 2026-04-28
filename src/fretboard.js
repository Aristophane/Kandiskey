// ═══════════════════════════════════════════════════════════════════
// GUITAR FRETBOARD
// ═══════════════════════════════════════════════════════════════════

import { GUITAR_TUNINGS, CHROMATIC, CHORDS } from './data.js';
import { S, getScaleNotes, midiActiveQuantizedMidi } from './state.js';
import { audio } from './audio.js';

// ── Injected refs ───────────────────────────────────────────────────

let _seqEngine         = { playing: false };
let _getSeqActiveFreqs = () => [];

export function setSeqEngineRef(ref)              { _seqEngine         = ref; }
export function setGetSeqActiveFreqsCallback(fn)  { _getSeqActiveFreqs = fn; }

// ── DOM ─────────────────────────────────────────────────────────────

const fbCanvas = document.getElementById('fb-canvas');
const fbCtx    = fbCanvas.getContext('2d');

// ── Constants ───────────────────────────────────────────────────────

const NUM_FRETS        = 14;

// ── Chord position voicing ──────────────────────────────────────────

let chordPositionBoxes = [];
let _chordPosCacheKey = '';
let _fbCacheW = 0, _fbCacheH = 0, _fbCacheDpr = 0;
new ResizeObserver(() => { _fbCacheW = 0; }).observe(fbCanvas.parentElement);

let _fbDrawPending = false;
export function scheduleDrawFretboard() {
  if (_fbDrawPending) return;
  _fbDrawPending = true;
  requestAnimationFrame(() => {
    _fbDrawPending = false;
    drawFretboard();
  });
}

function updateChordPositions() {
  const cacheKey = [S.chordRoot, S.chordName, S.tuning].join('|');
  if (cacheKey === _chordPosCacheKey) return;
  _chordPosCacheKey = cacheKey;

  if (S.chordName === '— None —' || !CHORDS[S.chordName]) {
    chordPositionBoxes = [];
    S.fbPosFilter = -1;
    return;
  }

  const root          = S.chordRoot;
  const chordNotesSet = new Set(CHORDS[S.chordName].map(d => (d + root) % 12));
  const openStrings   = [...GUITAR_TUNINGS[S.tuning]].reverse();

  const SPAN      = 3;
  const seenSigs  = new Set();
  const allVoicings = [];

  for (let wMin = 0; wMin <= NUM_FRETS - SPAN; wMin++) {
    const wMax     = wMin + SPAN;
    const allowOpen = wMin <= 2;

    const candidates = openStrings.map(oMidi => {
      const opts = [null];
      if (allowOpen && chordNotesSet.has(oMidi % 12)) opts.push(0);
      for (let f = Math.max(1, wMin); f <= wMax; f++) {
        if (chordNotesSet.has((oMidi + f) % 12)) opts.push(f);
      }
      return opts;
    });

    let windowBest      = null;
    let windowBestScore = -Infinity;

    const backtrack = (s, current, notes) => {
      if (s === 6) {
        if (notes.size < chordNotesSet.size) return;
        const played = current.filter(f => f !== null);
        if (played.length < 3) return;

        let loStr = -1, hiStr = -1;
        for (let i = 5; i >= 0; i--) { if (current[i] !== null && loStr === -1) loStr = i; }
        for (let i = 0; i < 6;  i++) { if (current[i] !== null && hiStr === -1) hiStr = i; }

        let innerMutes = 0;
        for (let i = hiStr; i <= loStr; i++) { if (current[i] === null) innerMutes++; }

        const bassNote = (openStrings[loStr] + current[loStr]) % 12;
        const fretted  = played.filter(f => f > 0);
        const span     = fretted.length > 0 ? Math.max(...fretted) - Math.min(...fretted) : 0;
        const score    = played.length * 10
          + (bassNote === root ? 50 : 0)
          - innerMutes * 20
          - span * 6;

        if (score > windowBestScore) {
          windowBestScore = score;
          windowBest = { frets: [...current], score, min: wMin, max: wMax };
        }
        return;
      }
      for (const f of candidates[s]) {
        current.push(f);
        const newNotes = new Set(notes);
        if (f !== null) newNotes.add((openStrings[s] + f) % 12);
        backtrack(s + 1, current, newNotes);
        current.pop();
      }
    };

    backtrack(0, [], new Set());

    if (windowBest) {
      const sig = windowBest.frets.join(',');
      if (!seenSigs.has(sig)) {
        seenSigs.add(sig);
        allVoicings.push(windowBest);
      }
    }
  }

  chordPositionBoxes = allVoicings.sort((a, b) => {
    const avg = v => v.frets.filter(f => f !== null).reduce((s, f) => s + f, 0) / v.frets.filter(f => f !== null).length;
    return avg(a) - avg(b);
  });
}

// ── Draw ────────────────────────────────────────────────────────────

export function drawFretboard() {
  updateChordPositions();
  const posCtrl = document.getElementById('fb-pos-controls');
  if (posCtrl) {
    const hasChord = S.chordName !== '— None —' && S.fbMode !== 'scale' && chordPositionBoxes.length > 0;
    posCtrl.style.display = 'flex';
    const lbl     = document.getElementById('fb-pos-lbl');
    const btnPrev = document.getElementById('btn-fb-pos-prev');
    const btnNext = document.getElementById('btn-fb-pos-next');
    if (!hasChord) {
      S.fbPosFilter = -1;
      if (lbl)     lbl.innerText      = '—';
      if (btnPrev) btnPrev.disabled   = true;
      if (btnNext) btnNext.disabled   = true;
    } else {
      if (S.fbPosFilter >= chordPositionBoxes.length) S.fbPosFilter = -1;
      if (lbl)     lbl.innerText      = S.fbPosFilter === -1 ? `All (${chordPositionBoxes.length})` : `${S.fbPosFilter + 1} / ${chordPositionBoxes.length}`;
      if (btnPrev) btnPrev.disabled   = false;
      if (btnNext) btnNext.disabled   = false;
    }
  }

  const wrap = fbCanvas.parentElement;
  const DPR  = Math.min(window.devicePixelRatio || 1, 2);
  const W    = wrap.clientWidth, H = wrap.clientHeight;
  if (W === 0 || H === 0) return;
  if (W !== _fbCacheW || H !== _fbCacheH || DPR !== _fbCacheDpr) {
    _fbCacheW = W; _fbCacheH = H; _fbCacheDpr = DPR;
    fbCanvas.width  = W * DPR; fbCanvas.height = H * DPR;
    fbCanvas.style.width = W + 'px'; fbCanvas.style.height = H + 'px';
  }
  fbCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fbCtx.clearRect(0, 0, W, H);

  const openStrings   = [...GUITAR_TUNINGS[S.tuning]].reverse();
  const margin        = { left: 28, right: 14, top: 16, bottom: 16 };
  const fretW         = (W - margin.left - margin.right) / NUM_FRETS;
  const totalStrings  = 6;
  const stringSpacing = (H - margin.top - margin.bottom) / (totalStrings - 1);

  const scaleNotes = getScaleNotes();
  const chord      = CHORDS[S.chordName];
  const chordNotes = chord ? chord.map(d => (d % 12 + S.chordRoot) % 12) : [];

  // Fretboard background
  const fbGrad = fbCtx.createLinearGradient(0, 0, 0, H);
  fbGrad.addColorStop(0,   '#2a1505');
  fbGrad.addColorStop(0.5, '#1e0e03');
  fbGrad.addColorStop(1,   '#160b02');
  fbCtx.fillStyle = fbGrad;
  fbCtx.fillRect(margin.left, margin.top - 6, W - margin.left - margin.right, H - margin.top - margin.bottom + 12);

  // Fret markers
  const dotFrets = [3,5,7,9,12];
  dotFrets.forEach(f => {
    if (f > NUM_FRETS) return;
    const xLeft = margin.left + (f - 1) * fretW;
    const xMid  = xLeft + fretW / 2;
    const yMid  = margin.top + (H - margin.top - margin.bottom) / 2;
    if (f === 12) {
      [-1, 1].forEach(dir => {
        fbCtx.beginPath(); fbCtx.arc(xMid, yMid + dir * stringSpacing, 4.5, 0, Math.PI * 2);
        fbCtx.fillStyle = 'rgba(255,255,255,0.08)'; fbCtx.fill();
      });
    } else {
      fbCtx.beginPath(); fbCtx.arc(xMid, yMid, 4.5, 0, Math.PI * 2);
      fbCtx.fillStyle = 'rgba(255,255,255,0.08)'; fbCtx.fill();
    }
  });

  // Fret lines
  for (let f = 0; f <= NUM_FRETS; f++) {
    const x = margin.left + f * fretW;
    fbCtx.beginPath();
    fbCtx.moveTo(x, margin.top - 4);
    fbCtx.lineTo(x, margin.top + stringSpacing * (totalStrings - 1) + 4);
    if (f === 0) {
      fbCtx.strokeStyle = 'rgba(220,210,190,0.7)'; fbCtx.lineWidth = 4;
    } else {
      fbCtx.strokeStyle = 'rgba(160,140,100,0.25)'; fbCtx.lineWidth = 1;
    }
    fbCtx.stroke();
  }

  // Strings
  for (let s = 0; s < totalStrings; s++) {
    const y         = margin.top + s * stringSpacing;
    const thickness = 0.8 + s * 0.28;
    fbCtx.beginPath();
    fbCtx.moveTo(margin.left, y);
    fbCtx.lineTo(margin.left + NUM_FRETS * fretW, y);
    fbCtx.strokeStyle = `rgba(210,195,160,${0.35 + s * 0.04})`;
    fbCtx.lineWidth = thickness; fbCtx.stroke();
  }

  // String name labels (derived from active tuning)
  openStrings.forEach((midi, s) => {
    const y = margin.top + s * stringSpacing;
    fbCtx.font = '9px system-ui'; fbCtx.textAlign = 'center'; fbCtx.textBaseline = 'middle';
    fbCtx.fillStyle = 'rgba(255,255,255,0.35)';
    fbCtx.fillText(CHROMATIC[midi % 12], margin.left - 14, y);
  });

  // Fret numbers
  for (let f = 1; f <= NUM_FRETS; f++) {
    const x = margin.left + (f - 0.5) * fretW;
    fbCtx.font = '8px system-ui'; fbCtx.textAlign = 'center'; fbCtx.textBaseline = 'middle';
    fbCtx.fillStyle = 'rgba(255,255,255,0.18)';
    fbCtx.fillText(String(f), x, margin.top - 8);
  }

  // Note dots
  for (let s = 0; s < totalStrings; s++) {
    const openMidi = openStrings[s];
    const sy       = margin.top + s * stringSpacing;

    for (let f = 0; f <= NUM_FRETS; f++) {
      const midi    = openMidi + f;
      const noteIdx = midi % 12;
      const inScale = scaleNotes.includes(noteIdx);
      const isRoot  = noteIdx === S.root;
      const inChord = chordNotes.includes(noteIdx);
      const isMidiActive = midiActiveQuantizedMidi !== null && midi === midiActiveQuantizedMidi;

      let drawScl = inScale, drawChd = inChord, drawRt = isRoot;
      if      (S.fbMode === 'scale') { drawChd = false; }
      else if (S.fbMode === 'chord') { drawScl = false; drawRt = false; }

      if (!drawScl && !drawChd && !isMidiActive && !drawRt) continue;

      const x = f === 0
        ? margin.left - fretW * 0.35
        : margin.left + (f - 0.5) * fretW;

      let alpha = 1.0;
      if (S.fbPosFilter !== -1 && chordPositionBoxes.length > 0 && S.chordName !== '— None —') {
        const activeBox = chordPositionBoxes[S.fbPosFilter];
        if (activeBox.frets[s] !== f) alpha = 0.15;
      }

      let dotColor, border;
      if (drawChd) {
        const interval = (noteIdx - S.chordRoot + 12) % 12;
        if (interval === 0)                    { dotColor = inScale ? '#ef4444' : 'rgba(239,68,68,0.65)';   border = 'rgba(239,68,68,0.5)'; }
        else if (interval === 3 || interval === 4)  { dotColor = inScale ? '#eab308' : 'rgba(234,179,8,0.65)';  border = 'rgba(234,179,8,0.5)'; }
        else if (interval === 6 || interval === 7 || interval === 8) { dotColor = inScale ? '#3b82f6' : 'rgba(59,130,246,0.65)'; border = 'rgba(59,130,246,0.5)'; }
        else if (interval === 10 || interval === 11) { dotColor = inScale ? '#10b981' : 'rgba(16,185,129,0.65)'; border = 'rgba(16,185,129,0.5)'; }
        else                                         { dotColor = inScale ? '#a855f7' : 'rgba(168,85,247,0.65)'; border = 'rgba(168,85,247,0.5)'; }
      } else if (drawRt) {
        dotColor = '#f59e0b'; border = 'rgba(245,158,11,0.6)';
      } else {
        dotColor = '#a78bfa'; border = 'rgba(167,139,250,0.4)';
      }

      fbCtx.globalAlpha = alpha;
      fbCtx.beginPath(); fbCtx.arc(x, sy, 7, 0, Math.PI * 2);
      fbCtx.fillStyle = dotColor; fbCtx.fill();
      fbCtx.strokeStyle = border; fbCtx.lineWidth = 1.5; fbCtx.stroke();

      fbCtx.font = 'bold 7px system-ui'; fbCtx.textAlign = 'center'; fbCtx.textBaseline = 'middle';
      fbCtx.fillStyle = drawRt ? '#1a0c00' : 'rgba(0,0,0,0.75)';
      fbCtx.fillText(CHROMATIC[noteIdx], x, sy);

      if (isMidiActive) {
        fbCtx.beginPath(); fbCtx.arc(x, sy, 11, 0, Math.PI * 2);
        fbCtx.strokeStyle = 'rgba(255,255,255,0.92)'; fbCtx.lineWidth = 2.5; fbCtx.stroke();
        const pg = fbCtx.createRadialGradient(x, sy, 0, x, sy, 16);
        pg.addColorStop(0, 'rgba(255,255,255,0.18)'); pg.addColorStop(1, 'transparent');
        fbCtx.beginPath(); fbCtx.arc(x, sy, 16, 0, Math.PI * 2); fbCtx.fillStyle = pg; fbCtx.fill();
      }

      fbCtx.globalAlpha = 1.0;
    }
  }

  // Sequencer active note highlights
  if (_seqEngine.playing) {
    const activeFreqs = _getSeqActiveFreqs();
    activeFreqs.forEach(targetFreq => {
      for (let s = 0; s < totalStrings; s++) {
        const openMidi = openStrings[s];
        const openFreq = 440 * Math.pow(2, (openMidi - 69) / 12);
        const vf       = 12 * Math.log2(targetFreq / openFreq);
        if (vf < -0.6 || vf > NUM_FRETS + 0.5) continue;

        const vfClamped = Math.max(0, vf);
        const x  = vfClamped < 0.5
          ? margin.left - fretW * 0.35
          : margin.left + (vfClamped - 0.5) * fretW;
        const sy = margin.top + s * stringSpacing;

        const isMicrotonal = Math.abs(vf - Math.round(vf)) > 0.08;
        const ringColor    = isMicrotonal ? 'rgba(245,158,11,0.95)' : 'rgba(52,211,153,0.95)';
        const glowColor    = isMicrotonal ? 'rgba(245,158,11,0.18)' : 'rgba(52,211,153,0.15)';

        const pg = fbCtx.createRadialGradient(x, sy, 0, x, sy, 18);
        pg.addColorStop(0, glowColor); pg.addColorStop(1, 'transparent');
        fbCtx.beginPath(); fbCtx.arc(x, sy, 18, 0, Math.PI * 2); fbCtx.fillStyle = pg; fbCtx.fill();

        fbCtx.beginPath(); fbCtx.arc(x, sy, 11, 0, Math.PI * 2);
        fbCtx.strokeStyle = ringColor; fbCtx.lineWidth = 2.5; fbCtx.stroke();

        if (isMicrotonal) {
          fbCtx.beginPath();
          fbCtx.moveTo(x, sy - 14); fbCtx.lineTo(x, sy + 14);
          fbCtx.strokeStyle = 'rgba(245,158,11,0.55)';
          fbCtx.lineWidth = 1; fbCtx.stroke();
        }
      }
    });
  }
}

// ── Click handler ───────────────────────────────────────────────────

fbCanvas.addEventListener('click', e => {
  const wrap  = fbCanvas.parentElement;
  const rect  = fbCanvas.getBoundingClientRect();
  const px    = e.clientX - rect.left;
  const py    = e.clientY - rect.top;
  const W     = wrap.clientWidth, H = wrap.clientHeight;

  const openStrings   = [...GUITAR_TUNINGS[S.tuning]].reverse();
  const margin        = { left: 28, right: 14, top: 16, bottom: 16 };
  const fretW         = (W - margin.left - margin.right) / NUM_FRETS;
  const stringSpacing = (H - margin.top - margin.bottom) / 5;

  let bestStr = -1, bestDist = 99;
  for (let s = 0; s < 6; s++) {
    const sy = margin.top + s * stringSpacing;
    const d  = Math.abs(py - sy);
    if (d < bestDist) { bestDist = d; bestStr = s; }
  }
  if (bestDist > stringSpacing * 0.55) return;

  let fret = -1;
  if (px < margin.left) { fret = 0; }
  else { fret = Math.floor((px - margin.left) / fretW) + 1; }
  if (fret < 0 || fret > NUM_FRETS) return;

  const midi = openStrings[bestStr] + fret;
  const freq = audio.midiFreq(midi, S.root, S.temp);
  if (!_seqEngine.playing) audio.playSingle(freq);

  const fx = fret === 0
    ? margin.left - fretW * 0.35
    : margin.left + (fret - 0.5) * fretW;
  const fy = margin.top + bestStr * stringSpacing;
  fbCtx.beginPath(); fbCtx.arc(fx, fy, 12, 0, Math.PI * 2);
  fbCtx.fillStyle = 'rgba(255,255,255,0.25)'; fbCtx.fill();
  setTimeout(drawFretboard, 120);
});
