import './style.css';
import * as Sync from './sync.js';
import { startTuner, stopTuner, tunerState } from './tuner.js';

import { CHROMATIC, TEMPERAMENTS, SCALE_FAMILIES, CHORDS, GUITAR_TUNINGS, RHYTHMS, PRESETS, DEGREE_NAMES } from './data.js';
import {
  S, SEQ, SYNTH, getScale, getScaleNotes, seqSteps, seqR, seqStepDur,
  epochMs, peerEpochMs, masterBpm, syncTempoRatio, drumLoopLen,
  setEpochMs, setPeerEpochMs, setMasterBpm, setSyncTempoRatio, setDrumLoopLen,
} from './state.js';
import { audio } from './audio.js';
import {
  DRUM_GRID, drumVelocity, setDrumVelocity, drumBuffers,
  activeBankKeys, activeBankLabels,
  activePads, setActivePad,
  loadDrumSamples, reloadDrumBank, drawDrumMachine, scheduleDrmDraw, loadWorldRhythm,
  invalidateBankKeys,
  setSyncSend as drumSetSyncSend, setSeqEngineRef as drumSetSeqEngineRef,
  WORLD_RHYTHMS_DRUM,
} from './drum.js';
import {
  seqEngine, drawSequencer, scheduleDrawSequencer, getSeqActiveFreqs, seqLoadDemo,
  setDrawCallback, setSyncSend as seqSetSyncSend,
  setSyncGetFullState, setSyncPlayUI, setStopMidiPlayer,
  setDrawFretboardCallback as seqSetDrawFretboard,
} from './sequencer.js';
import { SOLO_SYNTH, soloMode, soloOctave, setSoloMode, setSoloOctave, renderSoloPads, playTonnetzNote, playTonnetzChord } from './solo.js';

import {
  draw, addRipple, canvas, ctx, vizPanel, playChordNow,
  setSeqEngineRef as vizSetSeqEngineRef,
  setDrawSequencerCallback,
  noteAngle, canvasXY, pointInPoly, CHORD_ZONE,
} from './visualizer.js';
import {
  drawFretboard,
  setSeqEngineRef as fbSetSeqEngineRef,
  setGetSeqActiveFreqsCallback,
} from './fretboard.js';
import {
  MidiPlayer, MIDI_FILES, loadMidiFile, stopActiveMidiPlayer, wireMidiControls,
  setDrawCallback as midiSetDraw,
  setDrawFretboardCallback as midiSetDrawFretboard,
} from './midi.js';

// ── Wire injected callbacks ─────────────────────────────────────────

setDrawCallback(draw);
seqSetSyncSend(msg => Sync.send(msg));
setSyncGetFullState(syncGetFullState);
setSyncPlayUI(syncPlayUI);
setStopMidiPlayer(stopActiveMidiPlayer);
seqSetDrawFretboard(drawFretboard);

vizSetSeqEngineRef(seqEngine);
setDrawSequencerCallback(drawSequencer);

fbSetSeqEngineRef(seqEngine);
setGetSeqActiveFreqsCallback(getSeqActiveFreqs);

drumSetSeqEngineRef(seqEngine);
drumSetSyncSend(msg => Sync.send(msg));

midiSetDraw(draw);
midiSetDrawFretboard(drawFretboard);

// ── applyPeerBpm ────────────────────────────────────────────────────

function applyPeerBpm(bpm) {
  setMasterBpm(bpm);
  SEQ.bpm = Math.max(20, Math.round(bpm * syncTempoRatio));
  const sl = document.getElementById('seq-bpm');
  const vl = document.getElementById('seq-bpm-val');
  if (sl) sl.value = SEQ.bpm;
  if (vl) vl.textContent = SEQ.bpm;
  if (seqEngine.playing) seqEngine.rebase(true);
}

// ── syncPlayUI (full version, overrides sequencer's stub) ───────────

function syncPlayUI(state) {
  ['btn-seq-play', 'mob-btn-play'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = state === 'playing' ? 'none' : '';
  });
  ['btn-seq-pause', 'mob-btn-pause'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = state === 'playing' ? '' : 'none';
  });
  ['btn-seq-stop', 'mob-btn-stop'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = state !== 'stopped' ? '' : 'none';
  });
}

// ── UI BUILDING ─────────────────────────────────────────────────────

function buildNoteGrid(id, stateKey) {
  const el = document.getElementById(id);
  CHROMATIC.forEach((n, i) => {
    const btn = document.createElement('button');
    btn.className = 'note-btn';
    btn.textContent = n;
    btn.addEventListener('click', () => {
      S[stateKey] = i;
      refreshNoteGrid(id, stateKey);
      updateInfo(); draw(); drawFretboard();
      if (!seqEngine.playing) {
        if (stateKey === 'chordRoot' && CHORDS[S.chordName]) playChordNow();
        if (stateKey === 'root') {
          const C4 = 261.62556, rootHz = C4 * Math.pow(2, S.root / 12);
          const freqs = getScaleFreqs();
          audio.playArpeggio(freqs);
        }
      }
    });
    el.appendChild(btn);
  });
  refreshNoteGrid(id, stateKey);
}

function refreshNoteGrid(id, stateKey) {
  const cls = stateKey === 'chordRoot' ? 'active-chord' : 'active';
  document.querySelectorAll(`#${id} .note-btn`).forEach((btn, i) => {
    btn.classList.remove('active', 'active-chord');
    if (S[stateKey] === i) btn.classList.add(cls);
  });
}

function buildTemperamentSelect() {
  const sel = document.getElementById('sel-temperament');
  Object.entries(TEMPERAMENTS).forEach(([k, v]) => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = v.name;
    if (k === S.temp) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    S.temp = sel.value;
    document.getElementById('temp-desc').textContent = TEMPERAMENTS[S.temp].desc;
    const ms = document.getElementById('mob-temp-sel');
    if (ms) ms.value = S.temp;
    updateInfo(); draw(); drawFretboard();
  });
  document.getElementById('temp-desc').textContent = TEMPERAMENTS[S.temp].desc;
}

function buildFamilySelect() {
  const sel = document.getElementById('sel-family');
  Object.entries(SCALE_FAMILIES).forEach(([k, v]) => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = v.name;
    if (k === S.family) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    S.family = sel.value;
    buildScaleSelect();
    updateInfo(); draw(); drawFretboard();
  });
}

function buildScaleSelect() {
  const sel = document.getElementById('sel-scale');
  sel.innerHTML = '';
  const f = SCALE_FAMILIES[S.family];
  if (!f) return;
  Object.keys(f.scales).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    if (name === S.scaleName) opt.selected = true;
    sel.appendChild(opt);
  });
  if (!f.scales[S.scaleName]) {
    S.scaleName = Object.keys(f.scales)[0];
    sel.value = S.scaleName;
  }
}

function buildChordTypeGrid() {
  const el = document.getElementById('chord-type-grid');
  Object.keys(CHORDS).forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'chord-btn' + (name === '— None —' ? ' none-btn' : '');
    btn.textContent = name;
    if (name === S.chordName) btn.classList.add('active');
    btn.addEventListener('click', () => {
      S.chordName = name;
      document.querySelectorAll('.chord-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateInfo(); draw(); drawFretboard();
      if (CHORDS[name] && !seqEngine.playing) playChordNow();
    });
    el.appendChild(btn);
  });
}

function buildTuningSelect() {
  const sel = document.getElementById('sel-tuning');
  Object.keys(GUITAR_TUNINGS).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    if (name === S.tuning) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => { S.tuning = sel.value; drawFretboard(); });

  const fbModeSel = document.getElementById('sel-fb-mode');
  if (fbModeSel) fbModeSel.addEventListener('change', () => { S.fbMode = fbModeSel.value; drawFretboard(); });

  const btnFbPrev = document.getElementById('btn-fb-pos-prev');
  if (btnFbPrev) btnFbPrev.addEventListener('click', () => {
    const boxes = getChordPositionBoxesLen();
    if (boxes === 0) return;
    S.fbPosFilter = S.fbPosFilter > -1 ? S.fbPosFilter - 1 : boxes - 1;
    drawFretboard();
  });

  const btnFbNext = document.getElementById('btn-fb-pos-next');
  if (btnFbNext) btnFbNext.addEventListener('click', () => {
    const boxes = getChordPositionBoxesLen();
    if (boxes === 0) return;
    S.fbPosFilter = S.fbPosFilter < boxes - 1 ? S.fbPosFilter + 1 : -1;
    drawFretboard();
  });
}

// fretboard.js has private chordPositionBoxes — we redraw to let it re-derive
function getChordPositionBoxesLen() {
  const lbl = document.getElementById('fb-pos-lbl');
  if (!lbl) return 0;
  const text = lbl.innerText;
  // "All (3)"  →  group 1
  const mAll = text.match(/\((\d+)\)/);
  if (mAll) return parseInt(mAll[1]);
  // "1 / 3"   →  group 1
  const mPos = text.match(/\/\s*(\d+)/);
  if (mPos) return parseInt(mPos[1]);
  return text === '—' ? 0 : 1;
}

function getScaleFreqs() {
  const C4 = 261.62556, rootHz = C4 * Math.pow(2, S.root / 12);
  const { MAQAM_CENTS } = await_import_maqam_cents();
  if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) {
    const freqs = MAQAM_CENTS[S.scaleName].map(c => rootHz * Math.pow(2, c / 1200));
    freqs.push(rootHz * 2);
    return freqs;
  }
  const scale = getScale();
  const freqs = scale.map(d => audio.degreeFreq(S.root, d, S.temp, 4));
  freqs.push(audio.degreeFreq(S.root, 0, S.temp, 5));
  return freqs;
}

// Avoid re-importing MAQAM_CENTS — already in visualizer.js. Use a closure.
import { MAQAM_CENTS } from './data.js';
function _getScaleFreqs() {
  const C4 = 261.62556, rootHz = C4 * Math.pow(2, S.root / 12);
  if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) {
    const freqs = MAQAM_CENTS[S.scaleName].map(c => rootHz * Math.pow(2, c / 1200));
    freqs.push(rootHz * 2);
    return freqs;
  }
  const scale = getScale();
  const freqs = scale.map(d => audio.degreeFreq(S.root, d, S.temp, 4));
  freqs.push(audio.degreeFreq(S.root, 0, S.temp, 5));
  return freqs;
}

function updateInfo() {
  const scale = getScale();
  const scaleNotes = getScaleNotes();
  const tempData = TEMPERAMENTS[S.temp];

  const chips = document.getElementById('scale-chips');
  chips.innerHTML = '';
  scaleNotes.forEach((n, i) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.textContent = CHROMATIC[n];
    if (i === 0) { c.style.cssText = 'background:rgba(245,158,11,0.15);color:#f59e0b;border-color:rgba(245,158,11,0.3)'; }
    else { c.style.cssText = 'background:rgba(167,139,250,0.1);color:#a78bfa;border-color:rgba(167,139,250,0.22)'; }
    chips.appendChild(c);
  });

  const tbody = document.getElementById('info-body');
  tbody.innerHTML = '';
  scale.forEach((deg, i) => {
    const note = (deg + S.root) % 12;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="color:${i === 0 ? '#f59e0b' : '#a78bfa'};font-weight:${i === 0 ? '600' : '400'}">${CHROMATIC[note]}</td>
      <td style="color:rgba(255,255,255,0.38)">${DEGREE_NAMES[deg]}</td>
      <td style="color:#60a5fa">${tempData.cents[deg].toFixed(1)}</td>
      <td style="color:#34d399;font-size:0.63rem;font-family:monospace">${tempData.ratios[deg]}</td>
    `;
    tbody.appendChild(row);
  });
  drawTonnetz();
}

// ── TONNETZ VISUALIZATION ────────────────────────────────────────────

function _findLatticeCoords(pitch) {
  let best = [0, 0], bestDist = Infinity;
  for (let a = -6; a <= 6; a++) {
    for (let b = -6; b <= 6; b++) {
      if (((a * 7 + b * 4) % 12 + 12) % 12 === pitch) {
        const d = Math.abs(a) + Math.abs(b);
        if (d < bestDist) { bestDist = d; best = [a, b]; }
      }
    }
  }
  return best;
}

let _tonnetzNodes = [];
let _tonnetzTriangles = [];
let _tonnetzFlash = null; // { pitch, until }

function _pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function drawTonnetz() {
  const cvs = document.getElementById('tonnetz-canvas');
  if (!cvs) return;
  const W = cvs.offsetWidth || 300;
  const H = cvs.offsetHeight || 300;
  if (!W || !H) return;
  if (cvs.width !== W) cvs.width = W;
  if (cvs.height !== H) cvs.height = H;

  const ctx2 = cvs.getContext('2d');
  ctx2.clearRect(0, 0, W, H);

  const scaleNotes = getScaleNotes();
  const chordIntervals = CHORDS[S.chordName];
  const chordNotes = chordIntervals ? chordIntervals.map(i => (S.chordRoot + i) % 12) : [];
  const flashNow = _tonnetzFlash && Date.now() < _tonnetzFlash.until;

  const sx = W / 8;
  const sy = H / 4.5;
  const cx = W / 2;
  const cy = H / 2;

  // Build lattice nodes
  const nodes = [];
  for (let a = -4; a <= 4; a++) {
    for (let b = -2; b <= 2; b++) {
      const pitch = ((a * 7 + b * 4) % 12 + 12) % 12;
      const x = cx + a * sx + b * sx * 0.5;
      const y = cy - b * sy;
      nodes.push({ a, b, pitch, x, y });
    }
  }
  _tonnetzNodes = nodes;

  const findNode = (a, b) => nodes.find(n => n.a === a && n.b === b);

  // Build triangle list for hit-testing
  const triangles = [];
  for (let a = -4; a <= 3; a++) {
    for (let b = -2; b <= 2; b++) {
      const n0 = findNode(a, b), n1 = findNode(a + 1, b);
      const n2 = findNode(a, b + 1), n3 = findNode(a + 1, b - 1);
      if (n0 && n1 && n2) triangles.push({ root: n0.pitch, quality: 'maj', verts: [n0, n1, n2] });
      if (n0 && n1 && n3) triangles.push({ root: n0.pitch, quality: 'min', verts: [n0, n1, n3] });
    }
  }
  _tonnetzTriangles = triangles;

  // Draw edges
  ctx2.save();
  ctx2.lineWidth = 0.8;
  nodes.forEach(n => {
    [findNode(n.a + 1, n.b), findNode(n.a, n.b + 1), findNode(n.a + 1, n.b - 1)].forEach(m => {
      if (!m) return;
      const bothScale = scaleNotes.includes(n.pitch) && scaleNotes.includes(m.pitch);
      ctx2.strokeStyle = bothScale ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.06)';
      ctx2.beginPath(); ctx2.moveTo(n.x, n.y); ctx2.lineTo(m.x, m.y); ctx2.stroke();
    });
  });
  ctx2.restore();

  // Chord triangle
  if (chordIntervals && chordIntervals.includes(7)) {
    const [a0, b0] = _findLatticeCoords(S.chordRoot);
    const isMinor = chordIntervals[1] === 3;
    const triNodes = isMinor
      ? [findNode(a0, b0), findNode(a0 + 1, b0 - 1), findNode(a0 + 1, b0)]
      : [findNode(a0, b0), findNode(a0, b0 + 1), findNode(a0 + 1, b0)];
    if (triNodes.every(Boolean)) {
      ctx2.save();
      ctx2.beginPath();
      ctx2.moveTo(triNodes[0].x, triNodes[0].y);
      ctx2.lineTo(triNodes[1].x, triNodes[1].y);
      ctx2.lineTo(triNodes[2].x, triNodes[2].y);
      ctx2.closePath();
      ctx2.fillStyle = isMinor ? 'rgba(96,165,250,0.15)' : 'rgba(52,211,153,0.15)';
      ctx2.fill();
      ctx2.strokeStyle = isMinor ? 'rgba(96,165,250,0.6)' : 'rgba(52,211,153,0.6)';
      ctx2.lineWidth = 1.5; ctx2.stroke();
      ctx2.restore();
    }
  }

  // Flash triangle highlight
  if (flashNow && _tonnetzFlash.verts) {
    const [fv0, fv1, fv2] = _tonnetzFlash.verts;
    ctx2.save();
    ctx2.beginPath();
    ctx2.moveTo(fv0.x, fv0.y);
    ctx2.lineTo(fv1.x, fv1.y);
    ctx2.lineTo(fv2.x, fv2.y);
    ctx2.closePath();
    ctx2.fillStyle = 'rgba(255,255,255,0.22)';
    ctx2.fill();
    ctx2.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx2.lineWidth = 2;
    ctx2.stroke();
    ctx2.restore();
  }

  // Draw nodes
  nodes.forEach(n => {
    const isScale  = scaleNotes.includes(n.pitch);
    const isChord  = chordNotes.includes(n.pitch);
    const isRoot   = isChord && n.pitch === S.chordRoot;
    const isFlash  = flashNow && n.pitch === _tonnetzFlash.pitch;
    const r = isRoot ? 9 : isChord ? 8 : isScale ? 5.5 : 3.5;
    const rr = isFlash ? r * 1.5 : r;

    ctx2.beginPath(); ctx2.arc(n.x, n.y, rr, 0, Math.PI * 2);
    ctx2.fillStyle = isFlash ? '#fff'
      : isRoot  ? '#ef4444'
      : isChord ? '#60a5fa'
      : isScale ? 'rgba(167,139,250,0.6)'
      : 'rgba(255,255,255,0.07)';
    ctx2.fill();

    if (isScale || isChord || isFlash) {
      ctx2.strokeStyle = isFlash ? 'rgba(255,255,255,0.8)'
        : isRoot  ? '#fca5a5'
        : isChord ? '#93c5fd'
        : 'rgba(167,139,250,0.45)';
      ctx2.lineWidth = 1; ctx2.stroke();
      ctx2.fillStyle = isFlash ? '#111' : '#fff';
      ctx2.font = `${(isChord || isFlash) ? '600 ' : ''}${Math.max(7, Math.round(rr * 1.3))}px sans-serif`;
      ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
      ctx2.fillText(CHROMATIC[n.pitch], n.x, n.y);
    }
  });

  // Schedule next frame if flash is active
  if (flashNow) requestAnimationFrame(drawTonnetz);
}

// ── Tonnetz interaction ──────────────────────────────────────────────
(function wireTonnetz() {
  const cvs = document.getElementById('tonnetz-canvas');
  if (!cvs) return;

  function canvasXY(clientX, clientY) {
    const rect = cvs.getBoundingClientRect();
    return {
      mx: (clientX - rect.left) * (cvs.width / rect.width),
      my: (clientY - rect.top)  * (cvs.height / rect.height),
    };
  }

  function onTonnetzTrigger(clientX, clientY) {
    const { mx, my } = canvasXY(clientX, clientY);

    // Find closest node
    let closest = null, closestD = Infinity;
    _tonnetzNodes.forEach(n => {
      const d = Math.hypot(n.x - mx, n.y - my);
      if (d < closestD) { closestD = d; closest = n; }
    });

    if (soloMode === 'notes') {
      if (!closest) return;
      _tonnetzFlash = { pitch: closest.pitch, until: Date.now() + 300, verts: null };
      drawTonnetz();
      playTonnetzNote(closest.pitch);
      return;
    }

    // Chords mode: node wins if close, else check triangle interior
    let rootPitch = null;
    let flashVerts = null;

    if (closestD < 15 && closest) {
      rootPitch = closest.pitch;
      // Find matching triangle for this root based on current chord quality
      const isMinorChord = CHORDS[S.chordName] && CHORDS[S.chordName][1] === 3;
      const wantQ = isMinorChord ? 'min' : 'maj';
      const match = _tonnetzTriangles.find(t => t.root === rootPitch && t.quality === wantQ);
      if (match) flashVerts = match.verts;
    } else {
      for (const tri of _tonnetzTriangles) {
        const [ta, tb, tc] = tri.verts;
        if (_pointInTriangle(mx, my, ta.x, ta.y, tb.x, tb.y, tc.x, tc.y)) {
          rootPitch = tri.root;
          flashVerts = tri.verts;
          break;
        }
      }
    }
    if (rootPitch === null) return;

    _tonnetzFlash = { pitch: rootPitch, until: Date.now() + 350, verts: flashVerts };
    S.chordRoot = rootPitch;
    refreshNoteGrid('chord-grid', 'chordRoot');
    updateInfo(); draw(); drawFretboard();
    playTonnetzChord(rootPitch, CHORDS[S.chordName]);
  }

  cvs.addEventListener('mousedown', e => { e.preventDefault(); onTonnetzTrigger(e.clientX, e.clientY); });
  cvs.addEventListener('touchstart', e => { e.preventDefault(); onTonnetzTrigger(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
})();

// ── RESIZE ──────────────────────────────────────────────────────────

function resize() {
  const w = vizPanel.clientWidth || window.innerWidth;
  const stripH = isMobileSlides() ? 52 : 0;
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
const roTonnetz = new ResizeObserver(() => drawTonnetz());
roTonnetz.observe(document.getElementById('solo-wrap'));

// ── HEADER BUTTONS ───────────────────────────────────────────────────

document.getElementById('btn-audio').addEventListener('click', function () {
  audio.enabled = !audio.enabled;
  this.classList.toggle('active-audio', audio.enabled);
  this.innerHTML = audio.enabled
    ? '<span class="hdr-icon">🎧</span><span class="btn-text"> Audio</span>'
    : '<span class="hdr-icon">🔇</span><span class="btn-text"> Muted</span>';
});

document.getElementById('btn-guitar').addEventListener('click', function () {
  S.fretboardOpen = !S.fretboardOpen;
  const wrap = document.getElementById('fretboard-wrap');
  wrap.classList.toggle('open', S.fretboardOpen);
  this.classList.toggle('active-fb', S.fretboardOpen);
  if (S.fretboardOpen) setTimeout(drawFretboard, 320);
});

document.getElementById('btn-seq-synth').addEventListener('click', function () {
  const wrap = document.getElementById('synth-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-synth', open);
  this.innerHTML = `<svg class="hdr-icon" style="width:0.9em;height:0.9em"><use href="simple-white-icons.svg#icon-synth"></use></svg> Sound ${open ? '▴' : '▾'}`;
});

document.getElementById('sel-scale').addEventListener('change', function () {
  S.scaleName = this.value;
  updateInfo(); draw(); drawFretboard();
});

['tog-cents', 'tog-labels'].forEach(id => {
  const btn = document.getElementById(id);
  const key = id === 'tog-cents' ? 'showCents' : 'showLabels';
  btn.addEventListener('click', () => {
    S[key] = !S[key];
    btn.classList.toggle('active', S[key]);
    draw();
  });
});

// ── SYNTH PANEL ───────────────────────────────────────────────────────

function fmtHz(v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'kHz' : v + 'Hz'; }
function fmtMs(v) { return v >= 1000 ? (v / 1000).toFixed(2) + 's' : v + 'ms'; }

function applySynthPreset(name) {
  const p = PRESETS[name];
  Object.assign(SYNTH, p);
  document.getElementById('syn-attack').value = Math.round(p.attack * 1000);
  document.getElementById('syn-decay').value = Math.round(p.decay * 1000);
  document.getElementById('syn-filter').value = p.filterFreq;
  document.getElementById('syn-res').value = p.filterQ;
  document.getElementById('syn-vib-rate').value = p.vibratoRate;
  document.getElementById('syn-vib-depth').value = p.vibratoDepth;
  document.getElementById('syn-sustain').value = Math.round(p.sustain * 100);
  document.getElementById('syn-detune').value = p.detune ?? 0;
  document.getElementById('syn-harmonics').value = p.numHarmonics ?? 6;
  document.getElementById('syn-atk-val').textContent = fmtMs(Math.round(p.attack * 1000));
  document.getElementById('syn-dec-val').textContent = fmtMs(Math.round(p.decay * 1000));
  document.getElementById('syn-flt-val').textContent = fmtHz(p.filterFreq);
  document.getElementById('syn-res-val').textContent = p.filterQ.toFixed(1);
  document.getElementById('syn-vbr-val').textContent = p.vibratoRate.toFixed(1) + 'Hz';
  document.getElementById('syn-vbd-val').textContent = p.vibratoDepth + '¢';
  document.getElementById('syn-sus-val').textContent = Math.round(p.sustain * 100) + '%';
  document.getElementById('syn-det-val').textContent = (p.detune ?? 0) + '¢';
  document.getElementById('syn-harm-val').textContent = p.numHarmonics ?? 6;
  if (p.waveform && p.waveform !== 'custom') {
    document.querySelectorAll('.wave-cvs').forEach(c =>
      c.classList.toggle('active', c.dataset.wave === p.waveform));
  }
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('preset-' + name).classList.add('active');
  audio.applyFilter();
}

document.getElementById('preset-piano').addEventListener('click', () => applySynthPreset('piano'));
document.getElementById('preset-cello').addEventListener('click', () => applySynthPreset('cello'));

document.getElementById('syn-attack').addEventListener('input', function () {
  SYNTH.attack = parseInt(this.value) / 1000;
  document.getElementById('syn-atk-val').textContent = fmtMs(parseInt(this.value));
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-decay').addEventListener('input', function () {
  SYNTH.decay = parseInt(this.value) / 1000;
  document.getElementById('syn-dec-val').textContent = fmtMs(parseInt(this.value));
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-filter').addEventListener('input', function () {
  SYNTH.filterFreq = parseInt(this.value);
  document.getElementById('syn-flt-val').textContent = fmtHz(SYNTH.filterFreq);
  audio.applyFilter();
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-res').addEventListener('input', function () {
  SYNTH.filterQ = parseFloat(this.value);
  document.getElementById('syn-res-val').textContent = SYNTH.filterQ.toFixed(1);
  audio.applyFilter();
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-vib-rate').addEventListener('input', function () {
  SYNTH.vibratoRate = parseFloat(this.value);
  document.getElementById('syn-vbr-val').textContent = SYNTH.vibratoRate.toFixed(1) + 'Hz';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-vib-depth').addEventListener('input', function () {
  SYNTH.vibratoDepth = parseInt(this.value);
  document.getElementById('syn-vbd-val').textContent = SYNTH.vibratoDepth + '¢';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-sustain').addEventListener('input', function () {
  SYNTH.sustain = parseInt(this.value) / 100;
  document.getElementById('syn-sus-val').textContent = this.value + '%';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-detune').addEventListener('input', function () {
  SYNTH.detune = parseInt(this.value);
  document.getElementById('syn-det-val').textContent = this.value + '¢';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-harmonics').addEventListener('input', function () {
  SYNTH.numHarmonics = parseInt(this.value);
  document.getElementById('syn-harm-val').textContent = this.value;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});

// ── SEQUENCER SOURCE MODE ─────────────────────────────────────────────

(function initSeqSource() {
  function setSourceMode(mode) {
    SYNTH.sourceMode = mode;
    document.querySelectorAll('.seq-src-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('seq-src-' + mode).classList.add('active');
    document.getElementById('seq-wave-bar').style.display = mode === 'wave' ? 'flex' : 'none';
    document.getElementById('seq-sample-bar').style.display = mode === 'sample' ? 'flex' : 'none';
    if (mode === 'wave') requestAnimationFrame(renderWaveDraw);
  }

  ['synth', 'wave', 'sample'].forEach(m =>
    document.getElementById('seq-src-' + m).addEventListener('click', () => setSourceMode(m))
  );

  const WN = 512;
  let waveSamples = new Float32Array(WN);
  let waveApplyTimer = null;

  function renderWaveDraw() {
    const cvs = document.getElementById('wave-draw-cvs');
    if (!cvs) return;
    const w = cvs.offsetWidth || 300;
    cvs.width = w; cvs.height = 52;
    const wctx = cvs.getContext('2d');
    wctx.clearRect(0, 0, w, 52);
    wctx.strokeStyle = 'rgba(167,139,250,0.1)'; wctx.lineWidth = 1;
    wctx.beginPath(); wctx.moveTo(0, 26); wctx.lineTo(w, 26); wctx.stroke();
    [13, 39].forEach(y => {
      wctx.beginPath(); wctx.moveTo(0, y); wctx.lineTo(w, y); wctx.stroke();
    });
    wctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const si = Math.min(WN - 1, Math.floor((x / w) * WN));
      const y = 26 - waveSamples[si] * 22;
      x === 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
    }
    wctx.strokeStyle = '#a78bfa'; wctx.lineWidth = 2; wctx.stroke();
  }

  function scheduleApply() {
    clearTimeout(waveApplyTimer);
    waveApplyTimer = setTimeout(() => {
      audio._resume();
      if (!audio.actx) return;
      const np = 64;
      const real = new Float32Array(np + 1), imag = new Float32Array(np + 1);
      for (let k = 1; k <= np; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < WN; n++) {
          const a = (2 * Math.PI * k * n) / WN;
          re += waveSamples[n] * Math.cos(a);
          im -= waveSamples[n] * Math.sin(a);
        }
        real[k] = (2 * re) / WN; imag[k] = (2 * im) / WN;
      }
      SYNTH.customWave = audio.actx.createPeriodicWave(real, imag);
      SYNTH.waveform = 'custom';
      document.querySelectorAll('.wave-cvs').forEach(c => c.classList.remove('active'));
    }, 250);
  }

  function drawAt(cvs, clientX, clientY) {
    const rect = cvs.getBoundingClientRect();
    const xr = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const yr = Math.max(-1, Math.min(1, (rect.top + 26 - clientY) / 22));
    const si = Math.floor(xr * WN);
    if (drawAt._lastSi !== undefined) {
      const d = si - drawAt._lastSi;
      if (Math.abs(d) > 1) {
        for (let i = 1; i < Math.abs(d); i++) {
          const s = drawAt._lastSi + Math.sign(d) * i;
          if (s >= 0 && s < WN)
            waveSamples[s] = drawAt._lastYr + (yr - drawAt._lastYr) * (i / Math.abs(d));
        }
      }
    }
    waveSamples[si] = yr; drawAt._lastSi = si; drawAt._lastYr = yr;
    renderWaveDraw(); scheduleApply();
  }

  let wdDrawing = false;
  const wdCvs = document.getElementById('wave-draw-cvs');
  wdCvs.addEventListener('mousedown', e => { wdDrawing = true; drawAt._lastSi = undefined; drawAt(wdCvs, e.clientX, e.clientY); e.preventDefault(); });
  wdCvs.addEventListener('mousemove', e => { if (wdDrawing) drawAt(wdCvs, e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => { wdDrawing = false; drawAt._lastSi = undefined; });
  wdCvs.addEventListener('touchstart', e => { wdDrawing = true; drawAt._lastSi = undefined; drawAt(wdCvs, e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
  wdCvs.addEventListener('touchmove', e => { if (wdDrawing) drawAt(wdCvs, e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend', () => { wdDrawing = false; drawAt._lastSi = undefined; });

  document.getElementById('wave-draw-reset').addEventListener('click', () => {
    waveSamples.fill(0); SYNTH.customWave = null; SYNTH.waveform = 'sine'; renderWaveDraw();
  });

  document.getElementById('wave-draw-roughness').addEventListener('input', function () {
    document.getElementById('wave-draw-rough-val').textContent = this.value + '%';
  });

  document.getElementById('wave-draw-random').addEventListener('click', () => {
    const roughness = parseFloat(document.getElementById('wave-draw-roughness').value) / 100;
    const numH = Math.round(3 + roughness * 29);
    const falloff = 2.0 - roughness * 1.7;
    const amps = [], phases = [];
    for (let k = 0; k < numH; k++) {
      amps.push((1 / Math.pow(k + 1, falloff)) * (0.5 + 0.5 * Math.random()));
      phases.push(Math.random() * Math.PI * 2);
    }
    let maxAbs = 0;
    for (let i = 0; i < WN; i++) {
      let v = 0;
      for (let k = 0; k < numH; k++) v += amps[k] * Math.sin((k + 1) * 2 * Math.PI * i / WN + phases[k]);
      waveSamples[i] = v;
      maxAbs = Math.max(maxAbs, Math.abs(v));
    }
    if (maxAbs > 0) for (let i = 0; i < WN; i++) waveSamples[i] /= maxAbs;
    SYNTH.sourceMode = 'wave';
    document.querySelectorAll('.seq-src-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('seq-src-wave').classList.add('active');
    document.getElementById('seq-wave-bar').style.display = 'flex';
    document.getElementById('seq-sample-bar').style.display = 'none';
    renderWaveDraw(); scheduleApply();
  });

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const sampleRootSel = document.getElementById('sample-root-note');
  for (let oct = 0; oct <= 8; oct++) {
    NOTE_NAMES.forEach((n, i) => {
      const midi = (oct + 1) * 12 + i;
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      const opt = document.createElement('option');
      opt.value = hz.toFixed(3); opt.textContent = n + oct;
      if (n === 'A' && oct === 4) opt.selected = true;
      sampleRootSel.appendChild(opt);
    });
  }
  sampleRootSel.addEventListener('change', function () { SYNTH.sampleBaseFreq = parseFloat(this.value); });

  document.getElementById('sample-load-btn').addEventListener('click', () =>
    document.getElementById('sample-file-in').click());
  document.getElementById('sample-file-in').addEventListener('change', function () {
    const file = this.files[0]; if (!file) return;
    document.getElementById('sample-name-lbl').textContent = file.name;
    const reader = new FileReader();
    reader.onload = async e => {
      audio._resume();
      try { SYNTH.sampleBuffer = await audio.actx.decodeAudioData(e.target.result.slice(0)); }
      catch (err) { console.error('Sample decode failed:', err); }
    };
    reader.readAsArrayBuffer(file);
  });
})();

// ── SEQUENCER WIRING ─────────────────────────────────────────────────

document.getElementById('btn-seq').addEventListener('click', function () {
  if (isMobileSlides()) { scrollToSlide(1); return; }
  const wrap = document.getElementById('seq-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-seq', open);
  if (open) scheduleDrawSequencer();
});

(function () {
  const sel = document.getElementById('seq-rhythm');
  Object.keys(RHYTHMS).forEach(k => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = k;
    if (k === SEQ.rhythmKey) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', function () {
    SEQ.rhythmKey = this.value;
    const newSteps = seqSteps();
    SEQ.loopLen = newSteps;
    const loopSl = document.getElementById('seq-loop-len');
    loopSl.max = newSteps; loopSl.value = newSteps;
    document.getElementById('seq-loop-val').textContent = newSteps;
    if (seqEngine.playing) seqEngine.rebase();
    else Sync.send({ type: 'SEQ_PARAM', rhythmKey: SEQ.rhythmKey, loopLen: SEQ.loopLen });
    scheduleDrawSequencer();
  });
})();

document.getElementById('seq-loop-len').addEventListener('input', function () {
  SEQ.loopLen = parseInt(this.value);
  document.getElementById('seq-loop-val').textContent = SEQ.loopLen;
  if (seqEngine.playing) seqEngine.rebase();
  else Sync.send({ type: 'SEQ_PARAM', loopLen: SEQ.loopLen });
  scheduleDrawSequencer();
});

document.getElementById('drum-loop-len').addEventListener('input', function () {
  setDrumLoopLen(parseInt(this.value));
  document.getElementById('drum-loop-val').textContent = drumLoopLen;
  Sync.send({ type: 'SEQ_PARAM', drumLoopLen });
  scheduleDrmDraw();
});

// ── BPM CYLINDER PICKER ─────────────────────────────────────────────
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
    const cur = SEQ.bpm || 120;
    // Small delay so the element is painted before we scroll
    requestAnimationFrame(() => {
      scroll.scrollTop = (cur - MIN) * ITEM_H;
      updateSelection();
    });
  }

  function closePicker() {
    const bpm = currentIdx() + MIN;
    overlay.style.display = 'none';
    applyBpm(bpm);
  }

  dispBtn.addEventListener('click', openPicker);
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.classList.contains('bpm-backdrop')) closePicker();
  });
  scroll.addEventListener('scroll', updateSelection);
})();

document.getElementById('seq-bpm').addEventListener('input', function () {
  document.getElementById('seq-bpm-val').textContent = this.value;
});
document.getElementById('seq-bpm').addEventListener('change', function () {
  SEQ.bpm = parseInt(this.value);
  setMasterBpm(Math.round(SEQ.bpm / syncTempoRatio));
  document.getElementById('seq-bpm-val').textContent = SEQ.bpm;
  if (seqEngine.playing) seqEngine.rebase();
  else Sync.send({ type: 'SEQ_PARAM', masterBpm });
});

document.getElementById('seq-gate').addEventListener('input', function () {
  SEQ.gate = parseInt(this.value) / 100;
  document.getElementById('seq-gate-val').textContent = parseInt(this.value) + '%';
  Sync.send({ type: 'SEQ_PARAM', gate: SEQ.gate });
});

document.getElementById('btn-seq-demo').addEventListener('click', () => seqLoadDemo());
document.getElementById('btn-seq-clear').addEventListener('click', () => { SEQ.grid = {}; scheduleDrawSequencer(); });
document.getElementById('btn-seq-play').addEventListener('click', () => {
  if (tunerState.active) {
    stopTuner();
    document.getElementById('btn-tuner').classList.remove('active-tuner');
    _tunerPausedSeq = false;
  }
  seqEngine.play();
});
document.getElementById('btn-seq-pause').addEventListener('click', () => seqEngine.pause());
document.getElementById('btn-seq-stop').addEventListener('click', () => seqEngine.stop());
document.getElementById('mob-btn-pause').addEventListener('click', () => seqEngine.pause());

// Tap tempo
(function () {
  let _taps = [], _tapTimer = null;
  document.getElementById('btn-tap-tempo').addEventListener('click', () => {
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

document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  e.preventDefault();
  if (seqEngine.playing) {
    seqEngine.pause();
  } else if (seqEngine.paused) {
    seqEngine.play();
  } else {
    stopActiveMidiPlayer();
    audio.stopAll();
  }
});

// ── WAVEFORM SELECTOR ─────────────────────────────────────────────────

const WAVE_TYPES = ['sine', 'triangle', 'square', 'sawtooth'];
let _waveT = 0;

function drawWaveCanvas(cvs, type, t) {
  const wctx = cvs.getContext('2d');
  const W = cvs.offsetWidth || 52, H = cvs.offsetHeight || 22;
  const DPR = window.devicePixelRatio || 1;
  if (cvs.width !== W * DPR) { cvs.width = W * DPR; cvs.height = H * DPR; wctx.scale(DPR, DPR); }
  wctx.clearRect(0, 0, W, H);
  const sel = cvs.classList.contains('active');
  wctx.fillStyle = sel ? 'rgba(245,158,11,0.10)' : 'rgba(255,255,255,0.03)';
  wctx.fillRect(0, 0, W, H);
  wctx.beginPath();
  wctx.strokeStyle = sel ? '#f59e0b' : 'rgba(255,255,255,0.38)';
  wctx.lineWidth = 1.5;
  const cycles = 1.5, speed = 0.8, phase = t * speed;
  for (let px = 0; px < W; px++) {
    const angle = (px / W) * cycles * Math.PI * 2 + phase;
    let y;
    switch (type) {
      case 'sine': y = Math.sin(angle); break;
      case 'triangle': y = (2 / Math.PI) * Math.asin(Math.sin(angle)); break;
      case 'square': y = Math.sin(angle) >= 0 ? 0.85 : -0.85; break;
      case 'sawtooth': { const a = angle % (Math.PI * 2); y = (a / Math.PI) - 1; break; }
    }
    const py = H / 2 - y * (H * 0.34);
    if (px === 0) wctx.moveTo(px, py); else wctx.lineTo(px, py);
  }
  wctx.stroke();
}

(function waveAnimLoop() {
  _waveT += 0.025;
  WAVE_TYPES.forEach(type => {
    const cvs = document.getElementById('wave-' + type);
    if (cvs) drawWaveCanvas(cvs, type, _waveT);
    const scvs = document.getElementById('solo-wave-' + type);
    if (scvs) drawWaveCanvas(scvs, type, _waveT);
  });
  requestAnimationFrame(waveAnimLoop);
})();

document.querySelectorAll('.wave-cvs').forEach(cvs => {
  cvs.addEventListener('click', () => {
    SYNTH.waveform = cvs.dataset.wave; SYNTH.customWave = null; SYNTH.sourceMode = 'synth';
    document.querySelectorAll('.seq-src-btn').forEach(b => b.classList.remove('active'));
    const synthBtn = document.getElementById('seq-src-synth');
    if (synthBtn) synthBtn.classList.add('active');
    document.getElementById('seq-wave-bar').style.display = 'none';
    document.getElementById('seq-sample-bar').style.display = 'none';
    document.querySelectorAll('.wave-cvs').forEach(c => c.classList.remove('active'));
    cvs.classList.add('active');
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  });
});

document.querySelectorAll('.solo-wave-cvs').forEach(cvs => {
  cvs.addEventListener('click', () => {
    SOLO_SYNTH.waveform = cvs.dataset.wave;
    document.querySelectorAll('.solo-wave-cvs').forEach(c => c.classList.remove('active'));
    cvs.classList.add('active');
  });
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

document.getElementById('btn-drums').addEventListener('click', function () {
  if (isMobileSlides()) { scrollToSlide(2); loadDrumSamples(() => scheduleDrmDraw()); return; }
  const wrap = document.getElementById('drum-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-drums', open);
  if (open) { loadDrumSamples(() => scheduleDrmDraw()); scheduleDrmDraw(); }
});

// ── SOLO PANEL ────────────────────────────────────────────────────────

document.getElementById('btn-solo').addEventListener('click', function () {
  if (isMobileSlides()) { scrollToSlide(3); return; }
  const wrap = document.getElementById('solo-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-solo', open);
  if (open) setTimeout(drawTonnetz, 50);
});

document.getElementById('btn-solo-synth').addEventListener('click', () => {
  document.getElementById('solo-synth-wrap').classList.toggle('open');
});

document.getElementById('solo-mode-chords').addEventListener('click', function () {
  setSoloMode('chords');
  this.classList.add('active');
  document.getElementById('solo-mode-notes').classList.remove('active');
  drawTonnetz();
});
document.getElementById('solo-mode-notes').addEventListener('click', function () {
  setSoloMode('notes');
  this.classList.add('active');
  document.getElementById('solo-mode-chords').classList.remove('active');
  drawTonnetz();
});

document.getElementById('solo-oct-down').addEventListener('click', () => { setSoloOctave(soloOctave - 1); drawTonnetz(); });
document.getElementById('solo-oct-up').addEventListener('click', () => { setSoloOctave(soloOctave + 1); drawTonnetz(); });

{
  const fmtMs = v => v < 1000 ? Math.round(v) + 'ms' : (v / 1000).toFixed(2) + 's';
  const fmtHz = v => v >= 1000 ? (v / 1000).toFixed(1) + 'kHz' : Math.round(v) + 'Hz';
  const sl = (id, label, fmt, prop, scale) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () {
      const raw = parseFloat(this.value);
      const val = scale ? raw / scale : raw;
      SOLO_SYNTH[prop] = val;
      const lbl = document.getElementById(label);
      if (lbl) lbl.textContent = fmt(raw);
    });
  };
  sl('solo-syn-attack', 'solo-syn-atk-val', v => fmtMs(v), 'attack', 1000);
  sl('solo-syn-decay', 'solo-syn-dec-val', v => fmtMs(v), 'decay', 1000);
  sl('solo-syn-filter', 'solo-syn-flt-val', v => fmtHz(v), 'filterFreq', 0);
  sl('solo-syn-res', 'solo-syn-res-val', v => parseFloat(v).toFixed(1), 'filterQ', 0);
  sl('solo-syn-vib-rate', 'solo-syn-vbr-val', v => parseFloat(v).toFixed(1) + 'Hz', 'vibratoRate', 0);
  sl('solo-syn-vib-depth', 'solo-syn-vbd-val', v => Math.round(v) + '¢', 'vibratoDepth', 0);
  sl('solo-syn-sustain', 'solo-syn-sus-val', v => Math.round(v) + '%', 'sustain', 100);
  sl('solo-syn-detune', 'solo-syn-det-val', v => Math.round(v) + '¢', 'detune', 0);
  sl('solo-syn-harmonics', 'solo-syn-harm-val', v => Math.round(v), 'numHarmonics', 0);

  document.getElementById('solo-synth-wrap')?.addEventListener('transitionend', () => {
    if (document.getElementById('solo-synth-wrap').classList.contains('open')) {
      document.querySelectorAll('#solo-synth-wrap .syn-vis-ctrl').forEach(cvs => {
        const rect = cvs.getBoundingClientRect();
        if (rect.width > 0) cvs.width = Math.round(rect.width);
        const slider = cvs.nextElementSibling;
        if (slider) slider.dispatchEvent(new Event('input'));
      });
    }
  });
}

(function () {
  const bankSel = document.getElementById('drum-bank-sel');
  Object.keys(WORLD_RHYTHMS_DRUM).length; // side-effect-free reference (DRUM_SOUND_BANKS from drum.js)
  // populate bank selector using activeBankLabels/Keys indirection
  import('./drum.js').then(({ DRUM_SOUND_BANKS }) => {
    Object.keys(DRUM_SOUND_BANKS).forEach(key => {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = (DRUM_SOUND_BANKS[key].name || key);
      bankSel.appendChild(opt);
    });
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
  sel.addEventListener('change', function () { loadWorldRhythm(this.value); });
})();

const sel = document.getElementById('drum-preset-sel');



// charger directement le premier preset
if (sel.value) {
  loadWorldRhythm(sel.value);
}

sel.addEventListener('change', function () {
  loadWorldRhythm(this.value);
});

document.getElementById('drum-vel').addEventListener('input', function () {
  setDrumVelocity(parseInt(this.value) / 100);
  document.getElementById('drum-vel-val').textContent = parseInt(this.value) + '%';
});

document.getElementById('btn-drum-pads').addEventListener('click', function () {
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

document.getElementById('btn-drum-clear').addEventListener('click', () => {
  activeBankKeys().forEach(key => {
    for (let st = 0; st < seqSteps(); st++) delete DRUM_GRID[key + '_' + st];
  });
  document.getElementById('drum-preset-sel').value = 'Clear';
  scheduleDrmDraw();
});

// ── MIXER PANEL ───────────────────────────────────────────────────────

document.getElementById('btn-mixer').addEventListener('click', function () {
  const wrap = document.getElementById('mixer-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-mixer', open);
  document.body.classList.toggle('mixer-open', open);
});

// ── TUNER ─────────────────────────────────────────────────────────────

let _tunerPausedSeq = false;

document.getElementById('btn-tuner').addEventListener('click', async function () {
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

function withAudio(fn) { audio._resume(); setTimeout(fn, 0); }

document.getElementById('mix-melody').addEventListener('input', function () {
  const v = parseInt(this.value) / 100;
  document.getElementById('mix-mel-val').textContent = parseInt(this.value) + '%';
  withAudio(() => { if (audio.melodyBus) audio.melodyBus.gain.value = v; });
});
document.getElementById('mix-master').addEventListener('input', function () {
  const v = parseInt(this.value) / 100;
  document.getElementById('mix-master-val').textContent = parseInt(this.value) + '%';
  withAudio(() => { if (audio.master) audio.master.gain.setTargetAtTime(v, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-drums').addEventListener('input', function () {
  const v = parseInt(this.value) / 100;
  document.getElementById('mix-drm-val').textContent = parseInt(this.value) + '%';
  withAudio(() => { if (audio.drumBus) audio.drumBus.gain.value = v; });
});
document.getElementById('mix-reverb').addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-rev-val').textContent = v + '%';
  withAudio(() => { if (audio.revSend) audio.revSend.gain.setTargetAtTime(v / 100 * 0.8, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-dist').addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-dist-val').textContent = v + '%';
  withAudio(() => {
    if (!audio.distNode) return;
    audio.applyDistortion(v / 100);
    audio.distWet.gain.setTargetAtTime(v / 100 * 0.7, audio.actx.currentTime, 0.02);
  });
});
document.getElementById('mix-delay-wet').addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-dly-val').textContent = v + '%';
  withAudio(() => { if (audio.delayWet) audio.delayWet.gain.setTargetAtTime(v / 100 * 0.8, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-delay-time').addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-dlt-val').textContent = v + 'ms';
  withAudio(() => { if (audio.delayNode) audio.delayNode.delayTime.setTargetAtTime(v / 1000, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-delay-fb').addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-dfb-val').textContent = v + '%';
  withAudio(() => { if (audio.delayFeedback) audio.delayFeedback.gain.setTargetAtTime(v / 100, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-gflt-cut').addEventListener('input', function () {
  const v = parseFloat(this.value);
  const hz = v >= 100 ? 20000 : Math.round(20 * Math.pow(1000, v / 100));
  const label = v >= 100 ? 'Open' : (hz >= 1000 ? (hz / 1000).toFixed(1) + 'kHz' : hz + 'Hz');
  document.getElementById('mix-gflt-val').textContent = label;
  withAudio(() => { if (audio.globalFilter) audio.globalFilter.frequency.setTargetAtTime(hz, audio.actx.currentTime, 0.015); });
});
document.getElementById('mix-gflt-res').addEventListener('input', function () {
  const v = parseFloat(this.value);
  document.getElementById('mix-gflt-res-val').textContent = v.toFixed(1);
  withAudio(() => { if (audio.globalFilter) audio.globalFilter.Q.setTargetAtTime(v, audio.actx.currentTime, 0.015); });
});
document.querySelectorAll('[data-type]').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    withAudio(() => { if (audio.globalFilter) audio.globalFilter.type = this.dataset.type; });
  });
});

// ── MIXER VISUAL CONTROLS ─────────────────────────────────────────────

(function initMixerVisuals() {
  const COL4 = '#60a5fa', COL2 = '#34d399', COLF = '#fb923c', COLR = '#f87171';

  function valLabelMix(ctx, text, w, h, color) {
    ctx.fillStyle = color || 'rgba(148,163,184,0.82)';
    ctx.font = `bold ${Math.round(h * 0.24)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(text, w / 2, h - 2);
  }
  function drawFader(ctx, w, h, t, color, unityT) {
    const cx = w / 2, trackW = 4, trackTop = h * 0.05, trackBot = h * 0.88;
    const trackH = trackBot - trackTop, thumbY = trackBot - t * trackH;
    const thumbW = Math.floor(w * 0.70), thumbH = 11;
    const zeroY = trackBot - (unityT ?? (100 / 150)) * trackH;
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(cx - trackW / 2, trackTop, trackW, trackH);
    if (trackBot - thumbY > 1) { ctx.fillStyle = color + '3a'; ctx.fillRect(cx - trackW / 2, thumbY, trackW, trackBot - thumbY); }
    ctx.beginPath(); ctx.moveTo(cx - thumbW / 2 - 3, zeroY); ctx.lineTo(cx + thumbW / 2 + 3, zeroY);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(cx - thumbW / 2, thumbY - thumbH / 2, thumbW, thumbH);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(cx - thumbW / 2 + 3, thumbY - thumbH / 2 + 2, thumbW - 6, 2);
    ctx.beginPath(); ctx.moveTo(cx - thumbW / 2 + 4, thumbY); ctx.lineTo(cx + thumbW / 2 - 4, thumbY);
    ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function drawMixReverb(ctx, w, h, t) {
    const n = Math.max(4, Math.round(4 + t * 14));
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w, bw = (w / n) * 0.55, decay = Math.exp(-i * 2.2 / n), bh = h * 0.76 * decay;
      ctx.fillStyle = `rgba(96,165,250,${(0.1 + decay * 0.6).toFixed(2)})`; ctx.fillRect(x + bw * 0.1, (h - bh) / 2, bw, bh);
    }
  }
  function drawMixDrive(ctx, w, h, t) {
    const mid = h * 0.5, amp = h * 0.38, clip = Math.max(0.04, 1 - t * 0.94);
    ctx.beginPath();
    for (let x = 0; x <= w; x++) { const s = Math.max(-clip, Math.min(clip, Math.sin((x / w) * 2.5 * Math.PI * 2))) / clip; x === 0 ? ctx.moveTo(x, mid - s * amp) : ctx.lineTo(x, mid - s * amp); }
    ctx.strokeStyle = t > 0.05 ? COLR : 'rgba(248,113,113,0.28)'; ctx.lineWidth = 2; ctx.stroke();
  }
  function drawMixDelayWet(ctx, w, h, t) {
    const mid = h * 0.5, amp = h * 0.38, echoes = Math.round(t * 3);
    for (let e = 0; e <= echoes; e++) { const x = (e / (echoes + 1.5)) * w * 0.9, a = e === 0 ? 0.8 : Math.pow(t, e * 0.7) * 0.72; ctx.fillStyle = `rgba(96,165,250,${(a * 0.65).toFixed(2)})`; ctx.fillRect(x + 2, mid - a * amp, w / (echoes + 2.5) * 0.5, a * amp * 2); }
  }
  function drawMixDelayTime(ctx, w, h, t) {
    const mid = h * 0.5, mx = w * 0.07 + t * w * 0.85;
    ctx.beginPath(); ctx.moveTo(4, mid); ctx.lineTo(w - 4, mid); ctx.strokeStyle = 'rgba(96,165,250,0.12)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(96,165,250,0.75)'; ctx.fillRect(4, mid - h * 0.3, 3, h * 0.6);
    ctx.fillStyle = 'rgba(96,165,250,0.38)'; ctx.fillRect(mx, mid - h * 0.22, 3, h * 0.44);
    ctx.beginPath(); ctx.moveTo(7, mid); ctx.lineTo(mx, mid); ctx.strokeStyle = 'rgba(96,165,250,0.22)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawMixDelayFB(ctx, w, h, t) {
    const mid = h * 0.5, reps = Math.max(2, Math.round(2 + t * 7));
    for (let i = 0; i < reps; i++) { const x = (i / reps) * w, a = Math.min(0.84, Math.pow(t + 0.08, i * 0.55) * 0.82), bh = Math.max(2, a * h * 0.72); ctx.fillStyle = `rgba(96,165,250,${a.toFixed(2)})`; ctx.fillRect(x + 1, mid - bh / 2, (w / reps) * 0.48, bh); }
  }
  function drawMixFilterCut(ctx, w, h, t) {
    const cutX = w * 0.06 + t * w * 0.82, topY = h * 0.14, botY = h * 0.82;
    ctx.beginPath(); ctx.moveTo(0, topY); ctx.lineTo(cutX, topY); ctx.bezierCurveTo(cutX + w * 0.09, topY, cutX + w * 0.09, botY, cutX + w * 0.2, botY); ctx.lineTo(w, botY); ctx.strokeStyle = COLF; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cutX, topY - 3); ctx.lineTo(cutX, botY + 3); ctx.strokeStyle = 'rgba(251,146,60,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawMixFilterReso(ctx, w, h, t) {
    const baseY = h * 0.76, cx = w * 0.5, ph = t * h * 0.6, spread = Math.max(10, w * 0.28 * (1 - t * 0.75));
    ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(w, baseY); ctx.strokeStyle = 'rgba(251,146,60,0.22)'; ctx.lineWidth = 1; ctx.stroke();
    if (ph > 1) { ctx.beginPath(); ctx.moveTo(0, baseY); ctx.bezierCurveTo(cx - spread, baseY, cx - spread / 3, baseY - ph, cx, baseY - ph); ctx.bezierCurveTo(cx + spread / 3, baseY - ph, cx + spread, baseY, w, baseY); ctx.strokeStyle = COLF; ctx.lineWidth = 2; ctx.stroke(); }
  }

  const allMixCvs = [];
  function paintMix(cvs, slider, fn) {
    if (!cvs.width || !cvs.height) return;
    const mctx = cvs.getContext('2d'); mctx.clearRect(0, 0, cvs.width, cvs.height);
    const v = parseFloat(slider.value), t = (v - parseFloat(slider.min)) / (parseFloat(slider.max) - parseFloat(slider.min));
    fn(mctx, cvs.width, cvs.height, t, v);
  }
  function redrawMix() {
    allMixCvs.forEach(({ cvs, slider, fn }) => {
      const rect = cvs.getBoundingClientRect();
      if (rect.width > 0) cvs.width = Math.round(rect.width);
      if (rect.height > 0) cvs.height = Math.round(rect.height);
      paintMix(cvs, slider, fn);
    });
  }

  [
    { cvs: document.getElementById('mix-fader-melody'), slider: document.getElementById('mix-melody'), color: COL4, unityT: 100 / 150 },
    { cvs: document.getElementById('mix-fader-drums'), slider: document.getElementById('mix-drums'), color: COL2, unityT: 100 / 150 },
    { cvs: document.getElementById('mix-fader-master'), slider: document.getElementById('mix-master'), color: '#a78bfa', unityT: 1.0 },
  ].forEach(({ cvs, slider, color, unityT }) => {
    if (!cvs || !slider) return;
    const fn = (ctx, w, h, t) => drawFader(ctx, w, h, t, color, unityT);
    allMixCvs.push({ cvs, slider, fn });
    function repaint() { paintMix(cvs, slider, fn); }
    slider.addEventListener('input', repaint);
    let startY, startVal, dragging = false;
    cvs.addEventListener('touchstart', e => { startY = e.touches[0].clientY; startVal = parseFloat(slider.value); e.preventDefault(); }, { passive: false });
    cvs.addEventListener('touchmove', e => { const dy = startY - e.touches[0].clientY, range = parseFloat(slider.max) - parseFloat(slider.min), step = parseFloat(slider.step) || 1; const nv = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), Math.round((startVal + (dy / cvs.height) * range) / step) * step)); slider.value = nv; slider.dispatchEvent(new Event('input', { bubbles: true })); repaint(); e.preventDefault(); }, { passive: false });
    cvs.addEventListener('mousedown', e => { dragging = true; startY = e.clientY; startVal = parseFloat(slider.value); e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (!dragging) return; const dy = startY - e.clientY, range = parseFloat(slider.max) - parseFloat(slider.min), step = parseFloat(slider.step) || 1; const nv = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), Math.round((startVal + (dy / cvs.height) * range) / step) * step)); slider.value = nv; slider.dispatchEvent(new Event('input', { bubbles: true })); repaint(); });
    window.addEventListener('mouseup', () => { dragging = false; });
  });

  const MIX_DRAW = {
    'mix-reverb': (ctx, w, h, t, v) => { drawMixReverb(ctx, w, h, t); valLabelMix(ctx, v + '%', w, h); },
    'mix-dist': (ctx, w, h, t, v) => { drawMixDrive(ctx, w, h, t); valLabelMix(ctx, v + '%', w, h, COLR); },
    'mix-delay-wet': (ctx, w, h, t, v) => { drawMixDelayWet(ctx, w, h, t); valLabelMix(ctx, v + '%', w, h); },
    'mix-delay-time': (ctx, w, h, t, v) => { drawMixDelayTime(ctx, w, h, t); valLabelMix(ctx, v + 'ms', w, h); },
    'mix-delay-fb': (ctx, w, h, t, v) => { drawMixDelayFB(ctx, w, h, t); valLabelMix(ctx, v + '%', w, h); },
    'mix-gflt-cut': (ctx, w, h, t, v) => { drawMixFilterCut(ctx, w, h, t); valLabelMix(ctx, v >= 100 ? 'Open' : Math.round(20 * Math.pow(1000, v / 100)) + 'Hz', w, h, COLF); },
    'mix-gflt-res': (ctx, w, h, t, v) => { drawMixFilterReso(ctx, w, h, t); valLabelMix(ctx, parseFloat(v).toFixed(1), w, h, COLF); },
  };
  Object.keys(MIX_DRAW).forEach(id => {
    const slider = document.getElementById(id); if (!slider) return;
    const fn = MIX_DRAW[id];
    const cvs = document.createElement('canvas'); cvs.className = 'vis-ctrl mix-vis-ctrl'; cvs.height = 50;
    slider.parentNode.insertBefore(cvs, slider);
    allMixCvs.push({ cvs, slider, fn });
    function repaint() { paintMix(cvs, slider, fn); }
    slider.addEventListener('input', repaint);
    let startX, startVal, dragging = false;
    cvs.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startVal = parseFloat(slider.value); e.preventDefault(); }, { passive: false });
    cvs.addEventListener('touchmove', e => { const dx = e.touches[0].clientX - startX, range = parseFloat(slider.max) - parseFloat(slider.min), step = parseFloat(slider.step) || 1; const nv = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), Math.round((startVal + (dx / cvs.width) * range) / step) * step)); slider.value = nv; slider.dispatchEvent(new Event('input', { bubbles: true })); repaint(); e.preventDefault(); }, { passive: false });
    cvs.addEventListener('mousedown', e => { dragging = true; startX = e.clientX; startVal = parseFloat(slider.value); e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (!dragging) return; const dx = e.clientX - startX, range = parseFloat(slider.max) - parseFloat(slider.min), step = parseFloat(slider.step) || 1; const nv = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), Math.round((startVal + (dx / cvs.width) * range) / step) * step)); slider.value = nv; slider.dispatchEvent(new Event('input', { bubbles: true })); repaint(); });
    window.addEventListener('mouseup', () => { dragging = false; });
  });

  document.getElementById('mixer-wrap')?.addEventListener('transitionend', () => {
    if (document.getElementById('mixer-wrap').classList.contains('open')) requestAnimationFrame(redrawMix);
  });
  document.getElementById('btn-mixer')?.addEventListener('click', () => {
    requestAnimationFrame(() => requestAnimationFrame(redrawMix));
  });
})();

// ── SYNTH VISUAL CONTROLS ─────────────────────────────────────────────

(function initSynthVisualControls() {
  const A3 = '#f59e0b';
  function valLabel(ctx, text, w, h, color) { ctx.fillStyle = color || 'rgba(245,158,11,0.82)'; ctx.font = `bold ${Math.round(h * 0.26)}px monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(text, w - 4, h - 3); }
  function drawAttack(ctx, w, h, t) { const peakX = w * 0.06 + t * w * 0.76, baseY = h * 0.84, topY = h * 0.1; ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(peakX, topY); ctx.lineTo(w, topY); ctx.lineTo(w, baseY); ctx.closePath(); ctx.fillStyle = 'rgba(245,158,11,0.07)'; ctx.fill(); ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(peakX, topY); ctx.lineTo(w, topY); ctx.strokeStyle = A3; ctx.lineWidth = 2; ctx.stroke(); }
  function drawDecay(ctx, w, h, t) { const sy = h * 0.1, ey = h * 0.72; ctx.beginPath(); for (let i = 0; i <= 60; i++) { const x = (i / 60) * w, y = sy + (ey - sy) * (1 - Math.exp(-(i / 60) * (5 - t * 4.3))); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.strokeStyle = A3; ctx.lineWidth = 2; ctx.stroke(); }
  function drawFilter(ctx, w, h, t) { const cutX = w * 0.08 + t * w * 0.8, topY = h * 0.14, botY = h * 0.82; ctx.beginPath(); ctx.moveTo(0, topY); ctx.lineTo(cutX, topY); ctx.bezierCurveTo(cutX + w * 0.09, topY, cutX + w * 0.09, botY, cutX + w * 0.2, botY); ctx.lineTo(w, botY); ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.moveTo(cutX, topY - 3); ctx.lineTo(cutX, botY + 3); ctx.strokeStyle = 'rgba(251,146,60,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
  function drawReso(ctx, w, h, t) { const baseY = h * 0.76, cx = w * 0.5, ph = t * h * 0.6, spread = Math.max(10, w * 0.28 * (1 - t * 0.75)); ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(w, baseY); ctx.strokeStyle = 'rgba(251,146,60,0.22)'; ctx.lineWidth = 1; ctx.stroke(); if (ph > 1) { ctx.beginPath(); ctx.moveTo(0, baseY); ctx.bezierCurveTo(cx - spread, baseY, cx - spread / 3, baseY - ph, cx, baseY - ph); ctx.bezierCurveTo(cx + spread / 3, baseY - ph, cx + spread, baseY, w, baseY); ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2; ctx.stroke(); } }
  function drawVibRate(ctx, w, h, t) { const cycles = 1 + t * 5.5, mid = h * 0.5, amp = h * 0.3; ctx.beginPath(); for (let x = 0; x <= w; x++) { const y = mid + Math.sin((x / w) * cycles * Math.PI * 2) * amp; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.strokeStyle = A3; ctx.lineWidth = 2; ctx.stroke(); }
  function drawVibDepth(ctx, w, h, t) { const amp = t * h * 0.4, mid = h * 0.5; ctx.beginPath(); for (let x = 0; x <= w; x++) { const y = mid + Math.sin((x / w) * 3 * Math.PI * 2) * amp; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.strokeStyle = amp > 1 ? A3 : 'rgba(245,158,11,0.28)'; ctx.lineWidth = 2; ctx.stroke(); if (amp < 2) { ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.strokeStyle = 'rgba(245,158,11,0.28)'; ctx.lineWidth = 1; ctx.stroke(); } }
  function drawSustain(ctx, w, h, t) { const susY = h * 0.12 + (1 - t) * h * 0.65, atkX = w * 0.18, decX = w * 0.38, relX = w * 0.85; ctx.beginPath(); ctx.moveTo(0, h * 0.9); ctx.lineTo(atkX, h * 0.1); ctx.lineTo(decX, susY); ctx.lineTo(relX, susY); ctx.lineTo(w, h * 0.9); ctx.strokeStyle = A3; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.moveTo(decX, susY); ctx.lineTo(relX, susY); ctx.strokeStyle = 'rgba(245,158,11,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
  function drawDetune(ctx, w, h, t) { const mid = h * 0.5, amp = h * 0.3, offset = (t - 0.5) * 2; ctx.beginPath(); for (let x = 0; x <= w; x++) { const y = mid + Math.sin((x / w) * 3 * Math.PI * 2) * amp; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.strokeStyle = 'rgba(245,158,11,0.2)'; ctx.lineWidth = 1; ctx.stroke(); const shift = offset * Math.PI * 0.6; ctx.beginPath(); for (let x = 0; x <= w; x++) { const y = mid + Math.sin((x / w) * 3 * Math.PI * 2 + shift) * amp; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.strokeStyle = Math.abs(offset) > 0.02 ? A3 : 'rgba(245,158,11,0.3)'; ctx.lineWidth = 2; ctx.stroke(); }
  function drawHarmonics(ctx, w, h, t, v) { const n = Math.round(v); for (let i = 1; i <= n; i++) { const amp = (h * 0.38) / i, mid = h * 0.5, alpha = 0.9 - (i - 1) * 0.1; ctx.beginPath(); for (let x = 0; x <= w; x++) { const y = mid + Math.sin((x / w) * i * 2 * Math.PI) * amp; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.strokeStyle = `rgba(167,139,250,${alpha.toFixed(2)})`; ctx.lineWidth = i === 1 ? 2 : 1; ctx.stroke(); } }

  const SYN_DRAW = {
    'syn-attack': (ctx, w, h, t, v) => { drawAttack(ctx, w, h, t); valLabel(ctx, fmtMs(v), w, h); },
    'syn-decay': (ctx, w, h, t, v) => { drawDecay(ctx, w, h, t); valLabel(ctx, fmtMs(v), w, h); },
    'syn-filter': (ctx, w, h, t, v) => { drawFilter(ctx, w, h, t); valLabel(ctx, fmtHz(v), w, h, '#fb923c'); },
    'syn-res': (ctx, w, h, t, v) => { drawReso(ctx, w, h, t); valLabel(ctx, parseFloat(v).toFixed(1), w, h, '#fb923c'); },
    'syn-vib-rate': (ctx, w, h, t, v) => { drawVibRate(ctx, w, h, t); valLabel(ctx, parseFloat(v).toFixed(1) + 'Hz', w, h); },
    'syn-vib-depth': (ctx, w, h, t, v) => { drawVibDepth(ctx, w, h, t); valLabel(ctx, v + '¢', w, h); },
    'syn-sustain': (ctx, w, h, t, v) => { drawSustain(ctx, w, h, t); valLabel(ctx, v + '%', w, h); },
    'syn-detune': (ctx, w, h, t, v) => { drawDetune(ctx, w, h, t); valLabel(ctx, v + '¢', w, h); },
    'syn-harmonics': (ctx, w, h, t, v) => { drawHarmonics(ctx, w, h, t, v); valLabel(ctx, Math.round(v) + ' harm.', w, h, 'rgba(167,139,250,0.85)'); },
    'solo-syn-attack': (ctx, w, h, t, v) => { drawAttack(ctx, w, h, t); valLabel(ctx, fmtMs(v), w, h); },
    'solo-syn-decay': (ctx, w, h, t, v) => { drawDecay(ctx, w, h, t); valLabel(ctx, fmtMs(v), w, h); },
    'solo-syn-filter': (ctx, w, h, t, v) => { drawFilter(ctx, w, h, t); valLabel(ctx, fmtHz(v), w, h, '#fb923c'); },
    'solo-syn-res': (ctx, w, h, t, v) => { drawReso(ctx, w, h, t); valLabel(ctx, parseFloat(v).toFixed(1), w, h, '#fb923c'); },
    'solo-syn-vib-rate': (ctx, w, h, t, v) => { drawVibRate(ctx, w, h, t); valLabel(ctx, parseFloat(v).toFixed(1) + 'Hz', w, h); },
    'solo-syn-vib-depth': (ctx, w, h, t, v) => { drawVibDepth(ctx, w, h, t); valLabel(ctx, v + '¢', w, h); },
    'solo-syn-sustain': (ctx, w, h, t, v) => { drawSustain(ctx, w, h, t); valLabel(ctx, v + '%', w, h); },
    'solo-syn-detune': (ctx, w, h, t, v) => { drawDetune(ctx, w, h, t); valLabel(ctx, v + '¢', w, h); },
    'solo-syn-harmonics': (ctx, w, h, t, v) => { drawHarmonics(ctx, w, h, t, v); valLabel(ctx, Math.round(v) + ' harm.', w, h, 'rgba(167,139,250,0.85)'); },
  };

  const allSynCvs = [];
  function paintSyn(cvs, slider, fn) {
    if (!cvs.width || !cvs.height) return;
    const sc = cvs.getContext('2d'); sc.clearRect(0, 0, cvs.width, cvs.height);
    const v = parseFloat(slider.value), t = (v - parseFloat(slider.min)) / (parseFloat(slider.max) - parseFloat(slider.min));
    fn(sc, cvs.width, cvs.height, t, v);
  }
  Object.keys(SYN_DRAW).forEach(id => {
    const slider = document.getElementById(id); if (!slider) return;
    const fn = SYN_DRAW[id];
    const cvs = document.createElement('canvas'); cvs.className = 'vis-ctrl syn-vis-ctrl'; cvs.height = 38;
    slider.parentNode.insertBefore(cvs, slider);
    allSynCvs.push({ cvs, slider, fn });
    function repaint() { const rect = cvs.getBoundingClientRect(); if (rect.width > 0) cvs.width = Math.round(rect.width); if (cvs.height > 0) paintSyn(cvs, slider, fn); }
    slider.addEventListener('input', repaint);
    let startX, startVal, dragging = false;
    cvs.addEventListener('mousedown', e => { dragging = true; startX = e.clientX; startVal = parseFloat(slider.value); e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (!dragging) return; const dx = e.clientX - startX, range = parseFloat(slider.max) - parseFloat(slider.min), step = parseFloat(slider.step) || 1; const nv = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), Math.round((startVal + (dx / cvs.width) * range) / step) * step)); slider.value = nv; slider.dispatchEvent(new Event('input', { bubbles: true })); repaint(); });
    window.addEventListener('mouseup', () => { dragging = false; });
    cvs.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startVal = parseFloat(slider.value); e.preventDefault(); }, { passive: false });
    cvs.addEventListener('touchmove', e => { const dx = e.touches[0].clientX - startX, range = parseFloat(slider.max) - parseFloat(slider.min), step = parseFloat(slider.step) || 1; const nv = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), Math.round((startVal + (dx / cvs.width) * range) / step) * step)); slider.value = nv; slider.dispatchEvent(new Event('input', { bubbles: true })); repaint(); e.preventDefault(); }, { passive: false });
  });

  document.getElementById('synth-wrap')?.addEventListener('transitionend', () => {
    if (document.getElementById('synth-wrap').classList.contains('open')) {
      allSynCvs.forEach(({ cvs, slider, fn }) => { const rect = cvs.getBoundingClientRect(); if (rect.width > 0) cvs.width = Math.round(rect.width); paintSyn(cvs, slider, fn); });
    }
  });
})();

// ── MOBILE SLIDES ─────────────────────────────────────────────────────

function isMobileSlides() { return window.innerWidth <= 768; }

const SLIDE_ELS = () => [
  document.querySelector('.main-layout'),
  document.getElementById('seq-wrap'),
  document.getElementById('drum-wrap'),
  document.getElementById('solo-wrap'),
];

function scrollToSlide(idx) {
  const outer = document.getElementById('outer-wrap');
  const els = SLIDE_ELS();
  const target = els[idx];
  if (!target || !outer) return;
  outer.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
}

document.querySelectorAll('.slide-dot').forEach(dot => {
  dot.addEventListener('click', () => scrollToSlide(parseInt(dot.dataset.slide)));
});

(function initMobileSlides() {
  if (!isMobileSlides()) return;

  document.body.classList.add('on-viz-slide'); // slide 0 active on load

  // Measure precise top of viz panel (below header + slide-nav) for overlay positioning
  requestAnimationFrame(() => {
    const hdrH = document.querySelector('header')?.offsetHeight || 0;
    const navH = document.getElementById('slide-nav')?.offsetHeight || 0;
    document.body.style.setProperty('--viz-top', `${hdrH + navH + 4}px`);
  });

  const strip = document.getElementById('mobile-scale-strip');
  ['mixer-wrap', 'synth-wrap', 'solo-synth-wrap', 'fretboard-wrap'].forEach(id => {
    const el = document.getElementById(id);
    if (el && strip) document.body.insertBefore(el, strip);
  });
  document.body.style.setProperty('--strip-h', '52px');

  function closePanelOverlay(wrapId) {
    const wrap = document.getElementById(wrapId); if (!wrap) return;
    wrap.classList.remove('open');
    if (wrapId === 'mixer-wrap') { document.getElementById('btn-mixer')?.classList.remove('active-mixer'); document.body.classList.remove('mixer-open'); }
    else if (wrapId === 'synth-wrap') { document.getElementById('btn-seq-synth')?.classList.remove('active-synth'); }
  }
  function openPanelOverlay(wrapId) {
    const wrap = document.getElementById(wrapId); if (!wrap) return;
    wrap.classList.add('open');
    if (wrapId === 'mixer-wrap') { document.getElementById('btn-mixer')?.classList.add('active-mixer'); document.body.classList.add('mixer-open'); }
    else if (wrapId === 'synth-wrap') { document.getElementById('btn-seq-synth')?.classList.add('active-synth'); }
  }

  [
    { wrapId: 'mixer-wrap', label: '<svg class="hdr-icon" style="width:1.1em;height:1.1em;margin-right:4px;fill:currentColor"><use href="simple-white-icons.svg#icon-mixer"></use></svg>Mixer', color: '#60a5fa' },
    { wrapId: 'synth-wrap', label: '<svg class="hdr-icon" style="width:1.1em;height:1.1em;margin-right:4px;fill:currentColor"><use href="simple-white-icons.svg#icon-synth"></use></svg>Sound', color: '#f59e0b' },
    { wrapId: 'solo-synth-wrap', label: '🔊 Solo Sound', color: '#c4b5fd' },
  ].forEach(({ wrapId, label, color }) => {
    const panel = document.querySelector(`#${wrapId} .synth-panel`); if (!panel) return;
    const handle = document.createElement('div'); handle.className = 'mob-panel-handle';
    const hdr = document.createElement('div'); hdr.className = 'mob-panel-hdr';
    hdr.innerHTML = `<span class="mob-panel-hdr-title" style="color:${color}">${label}</span><button class="mob-panel-close" aria-label="Fermer">✕</button>`;
    hdr.querySelector('.mob-panel-close').addEventListener('click', () => closePanelOverlay(wrapId));
    panel.prepend(hdr); panel.prepend(handle);
    document.getElementById(wrapId).addEventListener('click', e => { if (e.target === document.getElementById(wrapId)) closePanelOverlay(wrapId); });
  });

  const fabMixer = document.createElement('button'); fabMixer.id = 'mob-fab-mixer'; fabMixer.className = 'mob-fab'; fabMixer.innerHTML = '<svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor"><rect x="3" y="3" width="2" height="14" rx="1" opacity="0.5"/><rect x="9" y="3" width="2" height="14" rx="1" opacity="0.5"/><rect x="15" y="3" width="2" height="14" rx="1" opacity="0.5"/><rect x="1" y="8" width="6" height="3" rx="1.5"/><rect x="7" y="5" width="6" height="3" rx="1.5"/><rect x="13" y="11" width="6" height="3" rx="1.5"/></svg>'; fabMixer.setAttribute('aria-label', 'Mixer');

  const _muteIconOn  = '<svg viewBox="0 0 20 20" width="22" height="22"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3V7.5z" fill="currentColor"/><path d="M13 7a4.5 4.5 0 010 6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M15.5 4.5a7.5 7.5 0 010 11" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
  const _muteIconOff = '<svg viewBox="0 0 20 20" width="22" height="22"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3V7.5z" fill="currentColor"/><line x1="13" y1="7" x2="18" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="7" x2="13" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const fabMute = document.createElement('button'); fabMute.id = 'mob-fab-mute'; fabMute.className = 'mob-fab';
  fabMute.innerHTML = audio.enabled ? _muteIconOn : _muteIconOff;
  fabMute.classList.toggle('muted', !audio.enabled);
  fabMute.setAttribute('aria-label', 'Mute');

  document.body.appendChild(fabMixer); document.body.appendChild(fabMute);
  fabMixer.addEventListener('click', () => { const isOpen = document.getElementById('mixer-wrap').classList.contains('open'); isOpen ? closePanelOverlay('mixer-wrap') : openPanelOverlay('mixer-wrap'); });
  fabMute.addEventListener('click', () => {
    audio.enabled = !audio.enabled;
    fabMute.innerHTML = audio.enabled ? _muteIconOn : _muteIconOff;
    fabMute.classList.toggle('muted', !audio.enabled);
    const hdrBtn = document.getElementById('btn-audio');
    if (hdrBtn) {
      hdrBtn.classList.toggle('active-audio', audio.enabled);
      hdrBtn.innerHTML = audio.enabled
        ? '<svg class="hdr-icon"><use href="simple-white-icons.svg#icon-audio"></use></svg><span class="btn-text"> Audio</span>'
        : '<span class="hdr-icon">🔇</span><span class="btn-text"> Muted</span>';
    }
  });

  loadDrumSamples(() => scheduleDrmDraw());

  const outer = document.getElementById('outer-wrap');
  const dots = document.querySelectorAll('.slide-dot');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const idx = SLIDE_ELS().indexOf(entry.target); if (idx < 0) return;
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      document.getElementById('btn-seq').classList.toggle('active-seq', idx === 1);
      document.getElementById('btn-drums').classList.toggle('active-drums', idx === 2);
      document.getElementById('btn-solo').classList.toggle('active-solo', idx === 3);
      document.body.classList.toggle('on-viz-slide', idx === 0);
      const showStrip = idx !== 2;
      if (strip) strip.style.display = showStrip ? 'flex' : 'none';
      document.body.style.setProperty('--strip-h', showStrip ? '52px' : '0px');
      if (idx === 0) setTimeout(resize, 60);
      if (idx === 3) setTimeout(drawTonnetz, 50);
    });
  }, { root: outer, threshold: 0.5 });

  setTimeout(() => {
    SLIDE_ELS().forEach(el => { if (el) obs.observe(el); });
    scheduleDrawSequencer(); scheduleDrmDraw(); resize();
  }, 80);

  const mobTempSel = document.getElementById('mob-temp-sel');
  Object.entries(TEMPERAMENTS).forEach(([k, v]) => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = v.name.replace('Equal (12-TET)', 'Equal').replace('Just Intonation (5-limit)', 'Just').replace('Pythagorean', 'Pythag.').replace('Meantone (¼-comma)', 'Meantone').replace('Werckmeister III', 'Werkm. III');
    if (k === S.temp) opt.selected = true;
    mobTempSel.appendChild(opt);
  });
  mobTempSel.addEventListener('change', function () {
    S.temp = this.value;
    const dt = document.getElementById('sel-temperament'); if (dt) dt.value = this.value;
    document.getElementById('temp-desc').textContent = TEMPERAMENTS[S.temp].desc;
    updateInfo(); draw(); drawFretboard();
  });

  const mobFamSel = document.getElementById('mob-family-sel');
  Object.entries(SCALE_FAMILIES).forEach(([k, v]) => {
    const opt = document.createElement('option');
    const shortName = v.name.replace('Western Modes', 'Western').replace('Pentatonic & Blues', 'Penta.').replace('Arabic Maqamat', 'Arabic').replace('Indian Ragas', 'Indian');
    opt.value = k; opt.textContent = shortName;
    if (k === S.family) opt.selected = true;
    mobFamSel.appendChild(opt);
  });

  function populateMobScale() {
    const sel = document.getElementById('mob-scale-sel'); sel.innerHTML = '';
    Object.keys(SCALE_FAMILIES[S.family]?.scales || {}).forEach(name => {
      const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
      if (name === S.scaleName) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  populateMobScale();

  function updateMobRoot() { document.getElementById('mob-root-lbl').textContent = CHROMATIC[S.root]; }
  updateMobRoot();

  document.getElementById('mob-root-prev').addEventListener('click', () => {
    S.root = (S.root + 11) % 12; updateMobRoot(); refreshNoteGrid('root-grid', 'root'); updateInfo(); draw(); if (S.fretboardOpen) drawFretboard();
  });
  document.getElementById('mob-root-next').addEventListener('click', () => {
    S.root = (S.root + 1) % 12; updateMobRoot(); refreshNoteGrid('root-grid', 'root'); updateInfo(); draw(); if (S.fretboardOpen) drawFretboard();
  });
  mobFamSel.addEventListener('change', function () {
    S.family = this.value;
    const mainFam = document.getElementById('sel-family'); if (mainFam) mainFam.value = this.value;
    buildScaleSelect(); populateMobScale(); updateInfo(); draw();
  });
  document.getElementById('mob-scale-sel').addEventListener('change', function () {
    S.scaleName = this.value;
    const mainSc = document.getElementById('sel-scale'); if (mainSc) mainSc.value = this.value;
    updateInfo(); draw();
  });
  document.getElementById('sel-scale').addEventListener('change', () => {
    const ms = document.getElementById('mob-scale-sel');
    if (ms && ms.value !== S.scaleName) ms.value = S.scaleName;
  });

  document.getElementById('mob-btn-play').addEventListener('click', () => seqEngine.play());
  document.getElementById('mob-btn-stop').addEventListener('click', () => seqEngine.stop());
})();

// ── CROSS-DEVICE SYNC ─────────────────────────────────────────────────

function syncGetFullState() {
  return {
    bpm: SEQ.bpm,
    rhythmKey: SEQ.rhythmKey,
    gate: SEQ.gate,
    loopLen: SEQ.loopLen,
    grid: { ...SEQ.grid },
    drumGrid: { ...DRUM_GRID },
    drumLoopLen,
  };
}

function syncApplyFullState(msg) {
  if (msg.bpm !== undefined) SEQ.bpm = msg.bpm;
  if (msg.rhythmKey !== undefined) SEQ.rhythmKey = msg.rhythmKey;
  if (msg.gate !== undefined) SEQ.gate = msg.gate;
  if (msg.loopLen !== undefined) SEQ.loopLen = msg.loopLen;
  if (msg.drumLoopLen !== undefined) setDrumLoopLen(msg.drumLoopLen);
  if (msg.grid) SEQ.grid = { ...msg.grid };
  if (msg.drumGrid) {
    Object.keys(DRUM_GRID).forEach(k => delete DRUM_GRID[k]);
    Object.assign(DRUM_GRID, msg.drumGrid);
  }
  syncUpdateUI(msg);
}

function syncUpdateUI(msg) {
  if (msg.bpm !== undefined) {
    const sl = document.getElementById('seq-bpm'); if (sl) sl.value = msg.bpm;
    const vl = document.getElementById('seq-bpm-val'); if (vl) vl.textContent = msg.bpm;
  }
  if (msg.rhythmKey !== undefined) {
    const sel = document.getElementById('seq-rhythm'); if (sel) sel.value = msg.rhythmKey;
    const loopSl = document.getElementById('seq-loop-len'); if (loopSl) loopSl.max = seqSteps();
  }
  if (msg.loopLen !== undefined) {
    const sl = document.getElementById('seq-loop-len'); if (sl) sl.value = msg.loopLen;
    const vl = document.getElementById('seq-loop-val'); if (vl) vl.textContent = msg.loopLen;
  }
  if (msg.gate !== undefined) {
    const pct = Math.round(msg.gate * 100);
    const sl = document.getElementById('seq-gate'); if (sl) sl.value = pct;
    const vl = document.getElementById('seq-gate-val'); if (vl) vl.textContent = pct + '%';
  }
  if (msg.drumLoopLen !== undefined) {
    const sl = document.getElementById('drum-loop-len'); if (sl) { sl.max = seqSteps(); sl.value = msg.drumLoopLen; }
    const vl = document.getElementById('drum-loop-val'); if (vl) vl.textContent = msg.drumLoopLen;
  }
}

function syncHandleMessage(msg) {
  console.log('[sync] rx:', msg.type, msg);
  switch (msg.type) {
    case 'PLAY':
      setPeerEpochMs(msg.epochMs);
      if (msg.masterBpm !== undefined) applyPeerBpm(msg.masterBpm);
      syncApplyFullState(msg);
      if (seqEngine.playing) {
        if (msg.epochMs < epochMs) { setEpochMs(msg.epochMs); seqEngine.rebase(true); }
      } else {
        seqEngine.play(msg.epochMs);
      }
      scheduleDrawSequencer(); scheduleDrmDraw();
      break;
    case 'JOINED':
      setPeerEpochMs(msg.epochMs);
      break;
    case 'STOP':
      setPeerEpochMs(null);
      seqEngine.stop(true);
      break;
    case 'REBASE':
      setPeerEpochMs(msg.epochMs);
      if (msg.masterBpm !== undefined) applyPeerBpm(msg.masterBpm);
      if (msg.rhythmKey !== undefined) SEQ.rhythmKey = msg.rhythmKey;
      if (msg.loopLen !== undefined) SEQ.loopLen = msg.loopLen;
      syncUpdateUI(msg);
      if (seqEngine.playing) { setEpochMs(msg.epochMs); seqEngine.rebase(true); }
      scheduleDrawSequencer();
      break;
    case 'GRID_SET':
      if (msg.val) SEQ.grid[msg.key] = true; else delete SEQ.grid[msg.key];
      scheduleDrawSequencer();
      break;
    case 'DRUM_SET':
      if (msg.val) DRUM_GRID[msg.key] = true; else delete DRUM_GRID[msg.key];
      scheduleDrmDraw();
      break;
    case 'SEQ_PARAM':
      if (msg.masterBpm !== undefined) applyPeerBpm(msg.masterBpm);
      if (msg.rhythmKey !== undefined) SEQ.rhythmKey = msg.rhythmKey;
      if (msg.gate !== undefined) SEQ.gate = msg.gate;
      if (msg.loopLen !== undefined) SEQ.loopLen = msg.loopLen;
      if (msg.drumLoopLen !== undefined) setDrumLoopLen(msg.drumLoopLen);
      syncUpdateUI(msg);
      if (seqEngine.playing) seqEngine.rebase(true);
      scheduleDrawSequencer(); scheduleDrmDraw();
      break;
    case 'PEER_JOINED':
      if (seqEngine.playing) {
        Sync.send({ type: 'PLAY', epochMs, masterBpm, ...syncGetFullState() });
      } else {
        Sync.send({ type: 'FULL_STATE', playing: false, masterBpm, ...syncGetFullState() });
      }
      break;
    case 'FULL_STATE':
      syncApplyFullState(msg);
      scheduleDrawSequencer(); scheduleDrmDraw();
      break;
  }
}

(function initSync() {
  const params    = new URLSearchParams(location.search);

  // Server URL: prefer ?sync= param (local dev), then VITE env var (production build)
  const serverUrl = params.get('sync') ?? import.meta.env?.VITE_SYNC_URL ?? null;
  if (!serverUrl) return;

  // Room code: use ?room= param or generate a fresh one and push it into the URL
  function genRoom() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
  let roomId = (params.get('room') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!roomId) {
    roomId = genRoom();
    const next = new URL(location.href);
    next.searchParams.set('room', roomId);
    history.replaceState(null, '', next.toString());
  }

  // ── Badge ────────────────────────────────────────────────────────
  const badge = document.createElement('div');
  badge.style.cssText = [
    'position:fixed;top:8px;right:12px;z-index:9999',
    'display:flex;align-items:center;gap:6px',
    'font-size:11px;font-family:monospace',
    'background:#0f172a;border:1px solid #1e293b',
    'border-radius:10px;padding:3px 10px',
  ].join(';');

  const badgeText = document.createElement('span');
  badgeText.style.color = '#94a3b8';
  badgeText.textContent = `● ${roomId}  connecting…`;

  // Share / copy button
  const shareBtn = document.createElement('button');
  shareBtn.textContent = '⎘ share';
  shareBtn.title = 'Copy invite link';
  shareBtn.style.cssText = [
    'font-size:10px;font-family:monospace;cursor:pointer',
    'padding:1px 6px;border-radius:5px',
    'border:1px solid #334155;background:#1e293b;color:#94a3b8',
  ].join(';');
  shareBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).then(() => {
      shareBtn.textContent = '✓ copied';
      setTimeout(() => { shareBtn.textContent = '⎘ share'; }, 2000);
    });
  });

  badge.appendChild(badgeText);
  badge.appendChild(shareBtn);
  document.body.appendChild(badge);

  let peerCount = 0;
  function updateBadge(state) {
    const peers = peerCount > 0 ? `  ${peerCount} peer${peerCount > 1 ? 's' : ''}` : '  waiting…';
    if (state === 'live') {
      badgeText.style.color = '#4ade80';
      badgeText.textContent = `● ${roomId}${peers}`;
    } else {
      badgeText.style.color = '#f87171';
      badgeText.textContent = `● ${roomId}  reconnecting…`;
    }
  }

  // ── Tempo ratio UI ───────────────────────────────────────────────
  const bpmGroup = document.getElementById('seq-bpm')?.closest('.syn-group') ?? document.getElementById('seq-bpm')?.parentElement;
  if (bpmGroup) {
    const ratioRow = document.createElement('div');
    ratioRow.style.cssText = 'display:flex;gap:4px;margin-top:4px;align-items:center;';
    const label = document.createElement('span');
    label.textContent = 'ratio:';
    label.style.cssText = 'font-size:11px;color:#94a3b8;font-family:monospace;margin-right:2px;';
    ratioRow.appendChild(label);
    const RATIOS = [{ label: '÷3', val: 1/3 }, { label: '÷2', val: 0.5 }, { label: '×1', val: 1 }, { label: '×2', val: 2 }, { label: '×3', val: 3 }];
    RATIOS.forEach(({ label: lbl, val }) => {
      const btn = document.createElement('button');
      btn.textContent = lbl; btn.dataset.ratio = val;
      btn.style.cssText = 'font-size:11px;padding:1px 7px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#94a3b8;cursor:pointer;font-family:monospace;';
      if (val === 1) { btn.style.background = '#0f172a'; btn.style.color = '#4ade80'; btn.style.borderColor = '#4ade80'; }
      btn.addEventListener('click', () => {
        setSyncTempoRatio(val);
        ratioRow.querySelectorAll('button').forEach(b => { b.style.background = '#1e293b'; b.style.color = '#94a3b8'; b.style.borderColor = '#334155'; });
        btn.style.background = '#0f172a'; btn.style.color = '#4ade80'; btn.style.borderColor = '#4ade80';
        applyPeerBpm(masterBpm);
      });
      ratioRow.appendChild(btn);
    });
    bpmGroup.appendChild(ratioRow);
  }

  // ── Connect ──────────────────────────────────────────────────────
  const _origHandleMessage = syncHandleMessage;
  function handleMessageWithPeerCount(msg) {
    if (msg.type === 'PEER_JOINED') { peerCount = Math.max(1, (msg.peers ?? 1) - 1); updateBadge('live'); }
    if (msg.type === 'PEER_LEFT')   { peerCount = Math.max(0, peerCount - 1); updateBadge('live'); }
    _origHandleMessage(msg);
  }

  Sync.connect(
    serverUrl,
    roomId,
    handleMessageWithPeerCount,
    () => { peerCount = 0; updateBadge('live'); },
    () => { peerCount = 0; updateBadge('offline'); },
    () => {
      if (seqEngine.playing && epochMs !== null && !seqEngine._barJoining) {
        seqEngine._corrTick = 49;
      }
    },
  );
})();

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
