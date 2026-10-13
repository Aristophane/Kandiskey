import { CHROMATIC, TEMPERAMENTS, SCALE_FAMILIES, CHORDS, GUITAR_TUNINGS, DEGREE_NAMES, MAQAM_CENTS } from './data.js';
import { S, getScale, getScaleNotes } from './state.js';
import { audio } from './audio.js';
import { seqEngine } from './sequencer.js';
import { draw, playChordNow } from './visualizer.js';
import { drawFretboard, scheduleDrawFretboard } from './fretboard.js';
import { playTonnetzNote, playTonnetzChord, soloMode } from './solo.js';

// Mutable callbacks set by ui-sequencer.js after the scale picker overlay is wired
let syncScalePickerUi = () => {};
let openScaleSettingsPicker = () => false;
export function setSyncScalePickerUi(fn) { syncScalePickerUi = fn; }
export function setOpenScaleSettingsPicker(fn) { openScaleSettingsPicker = fn; }
export function callOpenScaleSettingsPicker() { return openScaleSettingsPicker(); }

// ── Scale helpers ─────────────────────────────────────────────────────

export function findRelativeMode(newRoot) {
  const currentNotes = getScaleNotes();
  if (!currentNotes.includes(newRoot)) return null;
  const intervals = currentNotes.map(n => (n - newRoot + 12) % 12).sort((a, b) => a - b).join(',');
  const families = [S.family, ...Object.keys(SCALE_FAMILIES).filter(k => k !== S.family)];
  for (const fk of families) {
    const f = SCALE_FAMILIES[fk];
    for (const [name, degs] of Object.entries(f.scales)) {
      if (degs.length && [...degs].sort((a, b) => a - b).join(',') === intervals)
        return { family: fk, scaleName: name };
    }
  }
  return null;
}

export function populateScaleSelect(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '';
  const family = SCALE_FAMILIES[S.family];
  if (!family) return;
  const scaleNames = Object.keys(family.scales);
  if (!scaleNames.length) return;
  if (!family.scales[S.scaleName]) S.scaleName = scaleNames[0];
  scaleNames.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === S.scaleName) opt.selected = true;
    sel.appendChild(opt);
  });
}

export function refreshRootUi() {
  refreshNoteGrid('root-grid', 'root');
  const mobRootLbl = document.getElementById('mob-root-lbl');
  if (mobRootLbl) mobRootLbl.textContent = CHROMATIC[S.root];
}

export function applyRootSelection(noteIdx, { preview = true } = {}) {
  const inScale = getScaleNotes().includes(noteIdx);
  const mode = inScale ? findRelativeMode(noteIdx) : null;
  if (inScale && !mode) return false;

  S.root = noteIdx;
  if (mode) {
    S.family = mode.family;
    S.scaleName = mode.scaleName;
    const familySel = document.getElementById('sel-family');
    if (familySel) familySel.value = S.family;
    const mobFamilySel = document.getElementById('mob-family-sel');
    if (mobFamilySel) mobFamilySel.value = S.family;
    buildScaleSelect();
    populateScaleSelect('mob-scale-sel');
    const scaleSel = document.getElementById('sel-scale');
    if (scaleSel) scaleSel.value = S.scaleName;
    const mobScaleSel = document.getElementById('mob-scale-sel');
    if (mobScaleSel) mobScaleSel.value = S.scaleName;
  }

  refreshRootUi();
  updateInfo();
  draw();
  if (S.fretboardOpen) scheduleDrawFretboard();
  syncScalePickerUi();
  if (preview && !seqEngine.playing) audio.playArpeggio(getScaleFreqs());
  return true;
}

export function isScaleSidebarHidden() {
  const panel = document.getElementById('slide-scale');
  return !panel || getComputedStyle(panel).display === 'none';
}

export function applyTemperamentSelection(tempKey) {
  if (!TEMPERAMENTS[tempKey]) return false;
  S.temp = tempKey;
  const sel = document.getElementById('sel-temperament');
  if (sel) sel.value = tempKey;
  const mobSel = document.getElementById('mob-temp-sel');
  if (mobSel) mobSel.value = tempKey;
  const desc = document.getElementById('temp-desc');
  if (desc) desc.textContent = TEMPERAMENTS[S.temp].desc;
  updateInfo();
  draw();
  if (S.fretboardOpen) scheduleDrawFretboard();
  syncScalePickerUi();
  return true;
}

export function applyScaleFamilySelection(familyKey) {
  if (!SCALE_FAMILIES[familyKey]) return false;
  S.family = familyKey;
  const sel = document.getElementById('sel-family');
  if (sel) sel.value = familyKey;
  const mobSel = document.getElementById('mob-family-sel');
  if (mobSel) mobSel.value = familyKey;
  buildScaleSelect();
  populateScaleSelect('mob-scale-sel');
  const scaleSel = document.getElementById('sel-scale');
  if (scaleSel) scaleSel.value = S.scaleName;
  const mobScaleSel = document.getElementById('mob-scale-sel');
  if (mobScaleSel) mobScaleSel.value = S.scaleName;
  updateInfo();
  draw();
  if (S.fretboardOpen) scheduleDrawFretboard();
  refreshNoteGrid('root-grid', 'root');
  syncScalePickerUi();
  return true;
}

export function applyScaleNameSelection(scaleName) {
  const family = SCALE_FAMILIES[S.family];
  if (!family) return false;
  if (!family.scales[scaleName]) {
    scaleName = Object.keys(family.scales)[0];
  }
  if (!scaleName) return false;
  S.scaleName = scaleName;
  const sel = document.getElementById('sel-scale');
  if (sel) sel.value = scaleName;
  const mobSel = document.getElementById('mob-scale-sel');
  if (mobSel) mobSel.value = scaleName;
  updateInfo();
  draw();
  if (S.fretboardOpen) scheduleDrawFretboard();
  refreshNoteGrid('root-grid', 'root');
  syncScalePickerUi();
  return true;
}

export function buildNoteGrid(id, stateKey) {
  const el = document.getElementById(id);
  CHROMATIC.forEach((n, i) => {
    const btn = document.createElement('button');
    btn.className = 'note-btn';
    btn.textContent = n;
    btn.addEventListener('click', () => {
      if (stateKey === 'root') {
        applyRootSelection(i);
        return;
      }
      S[stateKey] = i;
      refreshNoteGrid(id, stateKey);
      updateInfo(); draw(); drawFretboard();
      if (!seqEngine.playing && stateKey === 'chordRoot' && CHORDS[S.chordName]) playChordNow();
    });
    el.appendChild(btn);
  });
  refreshNoteGrid(id, stateKey);
}

export function refreshNoteGrid(id, stateKey) {
  const cls = stateKey === 'chordRoot' ? 'active-chord' : 'active';
  const scaleNotes = stateKey === 'root' ? getScaleNotes() : null;
  document.querySelectorAll(`#${id} .note-btn`).forEach((btn, i) => {
    btn.classList.remove('active', 'active-chord');
    if (S[stateKey] === i) btn.classList.add(cls);
    if (scaleNotes) btn.classList.toggle('out-of-scale', !scaleNotes.includes(i));
  });
}

export function buildTemperamentSelect() {
  const sel = document.getElementById('sel-temperament');
  Object.entries(TEMPERAMENTS).forEach(([k, v]) => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = v.name;
    if (k === S.temp) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => applyTemperamentSelection(sel.value));
  applyTemperamentSelection(S.temp);
}

export function buildFamilySelect() {
  const sel = document.getElementById('sel-family');
  Object.entries(SCALE_FAMILIES).forEach(([k, v]) => {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = v.name;
    if (k === S.family) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => applyScaleFamilySelection(sel.value));
}

export function buildScaleSelect() {
  populateScaleSelect('sel-scale');
}

export function buildChordTypeGrid() {
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

export function buildTuningSelect() {
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

function getChordPositionBoxesLen() {
  const lbl = document.getElementById('fb-pos-lbl');
  if (!lbl) return 0;
  const text = lbl.innerText;
  const mAll = text.match(/\((\d+)\)/);
  if (mAll) return parseInt(mAll[1]);
  const mPos = text.match(/\/\s*(\d+)/);
  if (mPos) return parseInt(mPos[1]);
  return text === '—' ? 0 : 1;
}

export function getScaleFreqs() {
  const C4 = 261.62556, rootHz = C4 * Math.pow(2, S.root / 12) * Math.pow(2, S.octave - 4);
  if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) {
    const freqs = MAQAM_CENTS[S.scaleName].map(c => rootHz * Math.pow(2, c / 1200));
    freqs.push(rootHz * 2);
    return freqs;
  }
  const scale = getScale();
  const freqs = scale.map(d => audio.degreeFreq(S.root, d, S.temp, S.octave));
  freqs.push(audio.degreeFreq(S.root, 0, S.temp, S.octave + 1));
  return freqs;
}

export function updateInfo() {
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

// ── TONNETZ VISUALIZATION ─────────────────────────────────────────────

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
let _tonnetzFlash = null;

function _pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

export function drawTonnetz() {
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

  if (flashNow) requestAnimationFrame(drawTonnetz);
}

// ── Tonnetz interaction ───────────────────────────────────────────────
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

    let rootPitch = null;
    let flashVerts = null;

    if (closestD < 15 && closest) {
      rootPitch = closest.pitch;
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

// ── Wiring: sel-scale + tog-cents/tog-labels ──────────────────────────
document.getElementById('sel-scale')?.addEventListener('change', function () {
  applyScaleNameSelection(this.value);
});

['tog-cents', 'tog-labels'].forEach(id => {
  const btn = document.getElementById(id);
  if (!btn) return;
  const key = id === 'tog-cents' ? 'showCents' : 'showLabels';
  btn.addEventListener('click', () => {
    S[key] = !S[key];
    btn.classList.toggle('active', S[key]);
    draw();
  });
});
