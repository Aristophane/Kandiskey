import { SYNTH, SEQ } from './state.js';
import { audio } from './audio.js';
import { PRESETS } from './data.js';
import { SOLO_SYNTH } from './solo.js';

export function fmtHz(v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'kHz' : v + 'Hz'; }
export function fmtMs(v) { return v >= 1000 ? (v / 1000).toFixed(2) + 's' : v + 'ms'; }

// ── Note length ───────────────────────────────────────────────────────

function noteLenToParams(v) {
  const t = v / 100;
  let gate;
  if (t <= 0.70) {
    gate = 0.08 + (t / 0.70) * 0.92;
  } else {
    gate = 1.0 + ((t - 0.70) / 0.30) * 3.0;
  }
  return {
    gate,
    decayMs:    Math.round(50 * Math.pow(80, t) / 10) * 10,
    sustainPct: Math.round(Math.max(0, t * 95 - 8)),
  };
}

export function applyNoteLen(v) {
  SEQ.noteLen = v;
  const p = noteLenToParams(v);
  SEQ.gate        = p.gate;
  SYNTH.decay     = p.decayMs / 1000;
  SYNTH.sustain   = p.sustainPct / 100;
  const decSl = document.getElementById('syn-decay');    if (decSl) decSl.value = p.decayMs;
  const decVl = document.getElementById('syn-dec-val');  if (decVl) decVl.textContent = fmtMs(p.decayMs);
  const susSl = document.getElementById('syn-sustain');  if (susSl) susSl.value = p.sustainPct;
  const susVl = document.getElementById('syn-sus-val');  if (susVl) susVl.textContent = p.sustainPct + '%';
}

// ── Synth presets ─────────────────────────────────────────────────────

export function applySynthPreset(name) {
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

document.getElementById('preset-piano')?.addEventListener('click', () => applySynthPreset('piano'));
document.getElementById('preset-cello')?.addEventListener('click', () => applySynthPreset('cello'));

document.getElementById('syn-attack')?.addEventListener('input', function () {
  SYNTH.attack = parseInt(this.value) / 1000;
  document.getElementById('syn-atk-val').textContent = fmtMs(parseInt(this.value));
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-decay')?.addEventListener('input', function () {
  SYNTH.decay = parseInt(this.value) / 1000;
  document.getElementById('syn-dec-val').textContent = fmtMs(parseInt(this.value));
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-filter')?.addEventListener('input', function () {
  SYNTH.filterFreq = parseInt(this.value);
  document.getElementById('syn-flt-val').textContent = fmtHz(SYNTH.filterFreq);
  audio.applyFilter();
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-res')?.addEventListener('input', function () {
  SYNTH.filterQ = parseFloat(this.value);
  document.getElementById('syn-res-val').textContent = SYNTH.filterQ.toFixed(1);
  audio.applyFilter();
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-vib-rate')?.addEventListener('input', function () {
  SYNTH.vibratoRate = parseFloat(this.value);
  document.getElementById('syn-vbr-val').textContent = SYNTH.vibratoRate.toFixed(1) + 'Hz';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-vib-depth')?.addEventListener('input', function () {
  SYNTH.vibratoDepth = parseInt(this.value);
  document.getElementById('syn-vbd-val').textContent = SYNTH.vibratoDepth + '¢';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-sustain')?.addEventListener('input', function () {
  SYNTH.sustain = parseInt(this.value) / 100;
  document.getElementById('syn-sus-val').textContent = this.value + '%';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-detune')?.addEventListener('input', function () {
  SYNTH.detune = parseInt(this.value);
  document.getElementById('syn-det-val').textContent = this.value + '¢';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});
document.getElementById('syn-harmonics')?.addEventListener('input', function () {
  SYNTH.numHarmonics = parseInt(this.value);
  document.getElementById('syn-harm-val').textContent = this.value;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
});

// ── Sequencer source mode (wave draw + sample recorder) ───────────────

export const _waveIO = {};

(function initSeqSource() {
  function isPhoneSeq() { return window.innerWidth <= 768; }

  function syncSeqDrawer(open) {
    const drawer = document.getElementById('seq-params-drawer');
    const btn    = document.getElementById('btn-seq-params');
    if (!drawer || !btn) return;
    if (isPhoneSeq()) {
      drawer.classList.toggle('open', open);
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    } else {
      drawer.classList.toggle('closed', !open);
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    }
  }

  function setSourceMode(mode) {
    SYNTH.sourceMode = mode;
    document.querySelectorAll('.seq-src-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`.seq-src-btn[data-source-mode="${mode}"], #seq-src-${mode}`)
      .forEach(b => b.classList.add('active'));
    document.getElementById('seq-src-sample')?.setAttribute('aria-expanded', String(mode === 'sample'));
    const seqPanel = document.querySelector('#seq-wrap .seq-panel');
    const waveExpand = mode === 'wave';
    if (seqPanel) seqPanel.classList.toggle('wave-expand', waveExpand);
    document.getElementById('seq-wave-ctrl-bar').style.display = waveExpand ? 'flex' : 'none';
    document.getElementById('seq-wave-bar').style.display = waveExpand ? 'flex' : 'none';
    document.getElementById('seq-sample-bar').style.display = mode === 'sample' ? 'flex' : 'none';
    if (mode !== 'sample') { const tb = document.getElementById('seq-sample-trim-bar'); if (tb) tb.style.display = 'none'; }
    if (mode === 'sample' && isPhoneSeq()) {
      syncSeqDrawer(false);
    }
    if (waveExpand) {
      requestAnimationFrame(renderWaveDraw);
      if (isPhoneSeq()) syncSeqDrawer(false);
    }
    scheduleWaveCanvasAnimation();
  }

  document.querySelectorAll('.seq-src-btn').forEach(btn => {
    const m = btn.dataset.sourceMode || btn.id?.replace('seq-src-', '');
    if (!m) return;
    btn.addEventListener('click', () => {
      if ((m === 'wave' || m === 'sample') && SYNTH.sourceMode === m) {
        setSourceMode('synth');
      } else {
        setSourceMode(m);
        if (m === 'synth') document.getElementById('btn-seq-synth')?.click();
      }
    });
  });

  const WN = 512;
  let waveSamples = new Float32Array(WN);
  let waveApplyTimer = null;
  let waveViewMode = 'linear';

  function _polarGeom(el) {
    const w = el.offsetWidth || 300;
    const h = Math.max(100, el.offsetHeight || 100);
    const cx = w / 2, cy = h / 2;
    const R   = Math.min(w, h) * 0.30;
    const amp = R * 0.55;
    return { w, h, cx, cy, R, amp };
  }

  function renderWaveDraw() {
    const cvs = document.getElementById('wave-draw-cvs');
    if (!cvs) return;
    const wctx = cvs.getContext('2d');

    if (waveViewMode === 'linear') {
      const w = cvs.offsetWidth || 300;
      const h = Math.max(52, cvs.offsetHeight || 52);
      cvs.width = w; cvs.height = h;
      const mid = h / 2, amp = h * 0.42;
      wctx.clearRect(0, 0, w, h);
      wctx.strokeStyle = 'rgba(167,139,250,0.08)'; wctx.lineWidth = 1;
      wctx.beginPath(); wctx.moveTo(0, mid); wctx.lineTo(w, mid); wctx.stroke();
      [mid - amp * 0.5, mid + amp * 0.5].forEach(y => {
        wctx.beginPath(); wctx.moveTo(0, y); wctx.lineTo(w, y); wctx.stroke();
      });
      wctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const si = Math.min(WN - 1, Math.floor((x / w) * WN));
        const y  = mid - waveSamples[si] * amp;
        x === 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
      }
      wctx.strokeStyle = '#a78bfa'; wctx.lineWidth = 2; wctx.stroke();
    } else {
      const { w, h, cx, cy, R, amp } = _polarGeom(cvs);
      cvs.width = w; cvs.height = h;
      wctx.clearRect(0, 0, w, h);
      wctx.strokeStyle = 'rgba(167,139,250,0.08)'; wctx.lineWidth = 1;
      [R - amp * 0.5, R, R + amp * 0.5].forEach(r => {
        wctx.beginPath(); wctx.arc(cx, cy, Math.max(2, r), 0, Math.PI * 2); wctx.stroke();
      });
      wctx.beginPath();
      for (let i = 0; i <= WN; i++) {
        const theta = (i / WN) * Math.PI * 2 - Math.PI / 2;
        const r = R + waveSamples[i % WN] * amp;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);
        i === 0 ? wctx.moveTo(x, y) : wctx.lineTo(x, y);
      }
      wctx.closePath();
      wctx.strokeStyle = '#a78bfa'; wctx.lineWidth = 2; wctx.stroke();
    }
  }

  function scheduleApply() {
    clearTimeout(waveApplyTimer);
    waveApplyTimer = setTimeout(() => {
      audio._resume();
      if (!audio.actx) return;
      const normalized = new Float32Array(WN);
      let mean = 0;
      for (let i = 0; i < WN; i++) mean += waveSamples[i];
      mean /= WN;
      let peak = 0;
      for (let i = 0; i < WN; i++) {
        const v = waveSamples[i] - mean;
        normalized[i] = v;
        peak = Math.max(peak, Math.abs(v));
      }
      if (peak > 0.0001) {
        for (let i = 0; i < WN; i++) normalized[i] /= peak;
      }
      const np = 64;
      const real = new Float32Array(np + 1), imag = new Float32Array(np + 1);
      for (let k = 1; k <= np; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < WN; n++) {
          const a = (2 * Math.PI * k * n) / WN;
          re += normalized[n] * Math.cos(a);
          im -= normalized[n] * Math.sin(a);
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
    let si, yr;

    if (waveViewMode === 'linear') {
      const h   = rect.height || 52;
      const mid = h / 2, amp = h * 0.42;
      const xr  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      yr = Math.max(-1, Math.min(1, (rect.top + mid - clientY) / amp));
      si = Math.floor(xr * WN);
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
    } else {
      const mock = { offsetWidth: rect.width, offsetHeight: rect.height };
      const { cx: gcx, cy: gcy, R, amp } = _polarGeom(mock);
      const cx = rect.left + gcx, cy = rect.top + gcy;
      const dx = clientX - cx, dy = clientY - cy;
      let theta = Math.atan2(dy, dx) + Math.PI / 2;
      if (theta < 0) theta += Math.PI * 2;
      if (theta >= Math.PI * 2) theta -= Math.PI * 2;
      si = Math.floor((theta / (Math.PI * 2)) * WN) % WN;
      const dist = Math.sqrt(dx * dx + dy * dy);
      yr = Math.max(-1, Math.min(1, (dist - R) / amp));
      if (drawAt._lastSi !== undefined) {
        let d = si - drawAt._lastSi;
        if (d >  WN / 2) d -= WN;
        if (d < -WN / 2) d += WN;
        if (Math.abs(d) > 1) {
          for (let i = 1; i < Math.abs(d); i++) {
            const s = ((drawAt._lastSi + Math.sign(d) * i) + WN) % WN;
            waveSamples[s] = drawAt._lastYr + (yr - drawAt._lastYr) * (i / Math.abs(d));
          }
        }
      }
    }
    waveSamples[si] = yr; drawAt._lastSi = si; drawAt._lastYr = yr;
    renderWaveDraw(); scheduleApply();
  }

  let wdDrawing = false;
  const wdCvs = document.getElementById('wave-draw-cvs');
  if (wdCvs) {
    wdCvs.addEventListener('mousedown', e => { wdDrawing = true; drawAt._lastSi = undefined; drawAt(wdCvs, e.clientX, e.clientY); e.preventDefault(); });
    wdCvs.addEventListener('mousemove', e => { if (wdDrawing) drawAt(wdCvs, e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { wdDrawing = false; drawAt._lastSi = undefined; });
    wdCvs.addEventListener('touchstart', e => { wdDrawing = true; drawAt._lastSi = undefined; drawAt(wdCvs, e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
    wdCvs.addEventListener('touchmove', e => { if (wdDrawing) drawAt(wdCvs, e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
    window.addEventListener('touchend', () => { wdDrawing = false; drawAt._lastSi = undefined; });
  }

  document.getElementById('wave-draw-reset')?.addEventListener('click', () => {
    waveSamples.fill(0); SYNTH.customWave = null; SYNTH.waveform = 'sine'; renderWaveDraw();
  });

  document.getElementById('wave-view-toggle')?.addEventListener('click', function () {
    waveViewMode = waveViewMode === 'linear' ? 'radial' : 'linear';
    this.textContent = waveViewMode === 'linear' ? '— Linear' : '○ Radial';
    renderWaveDraw();
  });

  document.getElementById('wave-draw-roughness')?.addEventListener('input', function () {
    document.getElementById('wave-draw-rough-val').textContent = this.value + '%';
  });

  const WAVE_GENS = {
    harmonic(n, r) {
      const numH = Math.round(3 + r * 29), falloff = 2.0 - r * 1.7;
      const amps = [], phases = [];
      for (let k = 0; k < numH; k++) {
        amps.push((1 / Math.pow(k + 1, falloff)) * (0.5 + 0.5 * Math.random()));
        phases.push(Math.random() * Math.PI * 2);
      }
      const s = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let k = 0; k < numH; k++) v += amps[k] * Math.sin((k+1) * 2*Math.PI*i/n + phases[k]);
        s[i] = v;
      }
      return s;
    },
    smooth(n, r) {
      const numPts = Math.max(3, Math.round(3 + r * 25));
      const pts = Array.from({length: numPts}, () => Math.random() * 2 - 1);
      const s = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * numPts;
        const i0 = Math.floor(t) % numPts, i1 = (i0 + 1) % numPts;
        const mu = (1 - Math.cos((t - Math.floor(t)) * Math.PI)) / 2;
        s[i] = pts[i0] * (1 - mu) + pts[i1] * mu;
      }
      return s;
    },
    fm(n, r) {
      const modDepth = 0.5 + r * 12;
      const modFreq  = 1 + Math.round(r * 8);
      const mp = Math.random() * Math.PI * 2, cp = Math.random() * Math.PI * 2;
      const s = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const mod = modDepth * Math.sin(modFreq * 2*Math.PI*i/n + mp);
        s[i] = Math.sin(2*Math.PI*i/n + mod + cp);
      }
      return s;
    },
    stepped(n, r) {
      const numSteps = Math.max(2, Math.round(2 + r * 20));
      const glide = (1 - r) * 0.35;
      const stepVals = Array.from({length: numSteps}, () => Math.random() * 2 - 1);
      const s = new Float32Array(n);
      const sw = n / numSteps;
      for (let i = 0; i < n; i++) {
        const t   = i / sw;
        const st  = Math.floor(t);
        const frac = t - st;
        const v0  = stepVals[st % numSteps];
        const v1  = stepVals[(st + 1) % numSteps];
        const blend = frac < glide ? frac / glide : 0;
        s[i] = v0 + (v1 - v0) * Math.min(1, blend);
      }
      return s;
    },
    spiky(n, r) {
      const numSpikes = Math.max(1, Math.round(1 + r * 14));
      const width = Math.max(3, Math.round(n * (0.09 - r * 0.08)));
      const s = new Float32Array(n);
      for (let k = 0; k < numSpikes; k++) {
        const pos = Math.floor(Math.random() * n);
        const h   = (0.4 + 0.6 * Math.random()) * (Math.random() < 0.5 ? 1 : -1);
        for (let i = 0; i < n; i++) {
          let d = Math.abs(i - pos); if (d > n/2) d = n - d;
          if (d < width * 3) {
            const g = Math.exp(-(d * d) / (2 * width * width));
            s[i] += h * g;
          }
        }
      }
      return s;
    },
  };

  function generateRandomWave() {
    const roughness = parseFloat(document.getElementById('wave-draw-roughness').value) / 100;
    const type = document.getElementById('wave-rand-type')?.value || 'harmonic';
    const gen = WAVE_GENS[type] || WAVE_GENS.harmonic;
    const raw = gen(WN, roughness);
    let maxAbs = 0;
    for (let i = 0; i < WN; i++) maxAbs = Math.max(maxAbs, Math.abs(raw[i]));
    for (let i = 0; i < WN; i++) waveSamples[i] = maxAbs > 0.001 ? raw[i] / maxAbs : 0;
    setSourceMode('wave');
    renderWaveDraw(); scheduleApply();
  }

  document.getElementById('wave-draw-random')?.addEventListener('click', generateRandomWave);

  (function () {
    const roughnessSl = document.getElementById('wave-draw-roughness');
    if (roughnessSl) roughnessSl.value = 29;
    const roughValEl = document.getElementById('wave-draw-rough-val');
    if (roughValEl) roughValEl.textContent = '29%';
    const raw = WAVE_GENS.harmonic(WN, 0.29);
    let maxAbs = 0;
    for (let i = 0; i < WN; i++) maxAbs = Math.max(maxAbs, Math.abs(raw[i]));
    for (let i = 0; i < WN; i++) waveSamples[i] = maxAbs > 0.001 ? raw[i] / maxAbs : 0;
    scheduleApply();
  })();

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const sampleRootSel = document.getElementById('sample-root-note');
  if (sampleRootSel) {
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
  }

  document.getElementById('sample-load-btn')?.addEventListener('click', () =>
    document.getElementById('sample-file-in').click());
  document.getElementById('sample-file-in')?.addEventListener('change', function () {
    const file = this.files[0]; if (!file) return;
    document.getElementById('sample-name-lbl').textContent = file.name;
    const reader = new FileReader();
    reader.onload = async e => {
      audio._resume();
      try {
        const buf = await audio.actx.decodeAudioData(e.target.result.slice(0));
        _sampleSetRaw(buf, file.name);
      } catch (err) { console.error('Sample decode failed:', err); }
    };
    reader.readAsArrayBuffer(file);
  });

  // ── Sample recorder + trim ────────────────────────────────────────

  let _recRawBuffer = null;
  let _trimStart    = 0;
  let _trimEnd      = 1;
  let _mediaRec     = null;
  let _recStream    = null;
  let _recTimerInt  = null;

  const _recBtn      = document.getElementById('sample-rec-btn');
  const _recTimer    = document.getElementById('sample-rec-timer');
  const _nameLbl     = document.getElementById('sample-name-lbl');
  const _trimBtn     = document.getElementById('sample-trim-btn');
  const _trimBar     = document.getElementById('seq-sample-trim-bar');
  const _trimCvs     = document.getElementById('sample-trim-cvs');
  const _trimCtx     = _trimCvs?.getContext('2d');
  const _autocutChk  = document.getElementById('sample-autocut');
  const _startLbl    = document.getElementById('trim-start-lbl');
  const _endLbl      = document.getElementById('trim-end-lbl');
  const _durLbl      = document.getElementById('trim-dur-lbl');

  function _setRecButton(label, recording) {
    if (!_recBtn) return;
    const text = _recBtn.querySelector('.sample-rec-text');
    if (text) text.textContent = label;
    else _recBtn.textContent = label;
    _recBtn.classList.toggle('recording', recording);
  }

  function _fmtTime(s) { return s.toFixed(2) + 's'; }
  function _fmtMM(s) {
    const m = Math.floor(s / 60);
    return String(m).padStart(2,'0') + ':' + String(Math.floor(s) % 60).padStart(2,'0');
  }

  function _sampleSetRaw(buf, name) {
    _recRawBuffer = buf;
    _trimStart = 0; _trimEnd = 1;
    if (_autocutChk?.checked) {
      _applyAutocut();
    }
    _applyTrim();
    if (name) _nameLbl.textContent = name;
    if (_trimBtn) _trimBtn.style.display = '';
    if (_autocutChk && !_autocutChk.checked) {
      _showTrimEditor();
    } else {
      _drawTrimCanvas();
    }
  }

  function _applyAutocut() {
    if (!_recRawBuffer) return;
    const ch = _recRawBuffer.getChannelData(0);
    const thresh = 20 / 1000;
    let s = 0;
    for (let i = 0; i < ch.length; i++) {
      if (Math.abs(ch[i]) >= thresh) { s = i; break; }
    }
    let e = ch.length - 1;
    for (let i = ch.length - 1; i >= 0; i--) {
      if (Math.abs(ch[i]) >= thresh) { e = i; break; }
    }
    const margin = Math.floor(_recRawBuffer.sampleRate * 0.005);
    _trimStart = Math.max(0, (s - margin)) / ch.length;
    _trimEnd   = Math.min(ch.length - 1, (e + margin)) / ch.length;
  }

  function _applyTrim() {
    if (!_recRawBuffer) return;
    const len  = _recRawBuffer.length;
    const sr   = _recRawBuffer.sampleRate;
    const s    = Math.floor(_trimStart * len);
    const e    = Math.ceil(_trimEnd   * len);
    const tlen = Math.max(1, e - s);
    const nch  = _recRawBuffer.numberOfChannels;
    const buf  = audio.actx.createBuffer(nch, tlen, sr);
    for (let c = 0; c < nch; c++) {
      buf.getChannelData(c).set(_recRawBuffer.getChannelData(c).subarray(s, e));
    }
    SYNTH.sampleBuffer = buf;
    _syncTrimLabels();
  }

  function _syncTrimLabels() {
    if (!_recRawBuffer) return;
    const dur = _recRawBuffer.duration;
    const s = _trimStart * dur;
    const e = _trimEnd   * dur;
    if (_startLbl) _startLbl.textContent = _fmtTime(s);
    if (_endLbl)   _endLbl.textContent   = _fmtTime(e);
    if (_durLbl)   _durLbl.textContent   = _fmtTime(Math.max(0, e - s));
  }

  function _drawTrimCanvas() {
    if (!_trimCvs || !_trimCtx || !_recRawBuffer) return;
    const W = _trimCvs.clientWidth || _trimCvs.offsetWidth || 400;
    const H = 72;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const needW = Math.round(W * DPR);
    const needH = Math.round(H * DPR);
    if (_trimCvs.width !== needW || _trimCvs.height !== needH) {
      _trimCvs.width  = needW;
      _trimCvs.height = needH;
    }
    const ctx = _trimCtx;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const ch   = _recRawBuffer.getChannelData(0);
    const len  = ch.length;
    const mid  = H / 2;

    const BLOCKS = Math.min(len, W * 2);
    ctx.beginPath();
    for (let b = 0; b < BLOCKS; b++) {
      const i0 = Math.floor(b / BLOCKS * len);
      const i1 = Math.floor((b + 1) / BLOCKS * len);
      let peak = 0;
      for (let i = i0; i < i1; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
      const x  = b / BLOCKS * W;
      const frac = b / BLOCKS;
      const inRange = frac >= _trimStart && frac <= _trimEnd;
      ctx.fillStyle = inRange ? 'rgba(167,139,250,0.75)' : 'rgba(100,80,150,0.25)';
      const h = Math.max(1, peak * mid * 0.95);
      ctx.fillRect(x, mid - h, Math.max(1, W / BLOCKS + 0.5), h * 2);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, _trimStart * W, H);
    ctx.fillRect(_trimEnd * W, 0, W - _trimEnd * W, H);

    const sx = _trimStart * W;
    const ex = _trimEnd   * W;
    function drawHandle(x, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 6, H); ctx.lineTo(x + 6, H); ctx.lineTo(x, H - 10); ctx.closePath(); ctx.fill();
    }
    drawHandle(sx, '#34d399');
    drawHandle(ex, '#f87171');

    _syncTrimLabels();
  }

  function _showTrimEditor() {
    if (!_recRawBuffer) return;
    if (_trimBar) _trimBar.style.display = 'flex';
    requestAnimationFrame(_drawTrimCanvas);
  }

  function _hideTrimEditor() {
    if (_trimBar) _trimBar.style.display = 'none';
  }

  let _trimDrag = null;

  if (_trimCvs) {
    _trimCvs.addEventListener('pointerdown', e => {
      const rect = _trimCvs.getBoundingClientRect();
      const x    = (e.clientX - rect.left) / rect.width;
      const dS   = Math.abs(x - _trimStart);
      const dE   = Math.abs(x - _trimEnd);
      _trimDrag  = dS <= dE ? 'start' : 'end';
      _trimCvs.setPointerCapture(e.pointerId);
    });
    _trimCvs.addEventListener('pointermove', e => {
      if (!_trimDrag) return;
      const rect = _trimCvs.getBoundingClientRect();
      const x    = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (_trimDrag === 'start') _trimStart = Math.min(x, _trimEnd - 0.001);
      else                       _trimEnd   = Math.max(x, _trimStart + 0.001);
      _drawTrimCanvas();
    });
    _trimCvs.addEventListener('pointerup',     () => { _trimDrag = null; });
    _trimCvs.addEventListener('pointercancel', () => { _trimDrag = null; });
  }

  document.getElementById('sample-trim-apply')?.addEventListener('click', () => {
    _applyTrim();
    _hideTrimEditor();
    if (_trimBtn) _trimBtn.style.display = '';
  });

  _trimBtn?.addEventListener('click', () => {
    if (_trimBar?.style.display !== 'none') { _hideTrimEditor(); }
    else { _showTrimEditor(); }
  });

  async function _startRecording() {
    if (_mediaRec && _mediaRec.state === 'recording') return;
    try {
      audio._resume();
      _recStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      alert('Microphone access denied: ' + (err.message || err));
      return;
    }
    const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg',''].find(m => !m || MediaRecorder.isTypeSupported(m));
    _mediaRec = new MediaRecorder(_recStream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    _mediaRec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    _mediaRec.onstop = async () => {
      _recStream.getTracks().forEach(t => t.stop());
      clearInterval(_recTimerInt);
      if (_recTimer) _recTimer.style.display = 'none';
      _setRecButton('Record', false);
      const blob = new Blob(chunks, { type: _mediaRec.mimeType || 'audio/webm' });
      try {
        const ab  = await blob.arrayBuffer();
        const buf = await audio.actx.decodeAudioData(ab);
        _sampleSetRaw(buf, 'Recorded sample');
      } catch (err) { console.error('Record decode failed:', err); }
    };
    _mediaRec.start(100);
    _setRecButton('Stop', true);
    const t0 = Date.now();
    if (_recTimer) _recTimer.style.display = '';
    clearInterval(_recTimerInt);
    _recTimerInt = setInterval(() => {
      if (_recTimer) _recTimer.textContent = '● ' + _fmtMM((Date.now() - t0) / 1000);
    }, 500);
  }

  function _stopRecording() {
    if (_mediaRec && _mediaRec.state === 'recording') _mediaRec.stop();
  }

  _recBtn?.addEventListener('click', () => {
    if (_mediaRec && _mediaRec.state === 'recording') { _stopRecording(); }
    else { _startRecording(); }
  });

  window.addEventListener('resize', () => {
    if (_trimBar?.style.display !== 'none') requestAnimationFrame(_drawTrimCanvas);
  });

  document.getElementById('btn-seq-params')?.addEventListener('click', () => {
    const mode = SYNTH.sourceMode;
    if (mode !== 'wave' && mode !== 'sample') return;
    const drawer    = document.getElementById('seq-params-drawer');
    const isPhone   = window.innerWidth <= 768;
    const drawerOpen = isPhone
      ? drawer?.classList.contains('open')
      : !drawer?.classList.contains('closed');
    const d = drawerOpen ? 'flex' : 'none';
    if (mode === 'wave') {
      document.getElementById('seq-wave-ctrl-bar').style.display = d;
      document.getElementById('seq-wave-bar').style.display = d;
      document.querySelector('#seq-wrap .seq-panel')?.classList.toggle('wave-expand', drawerOpen);
      if (drawerOpen) requestAnimationFrame(renderWaveDraw);
    } else if (mode === 'sample') {
      if (drawerOpen) setSourceMode('synth');
      else {
        document.getElementById('seq-sample-bar').style.display = 'none';
        if (_trimBar) _trimBar.style.display = 'none';
      }
    }
  });

  _waveIO.getState = () => ({ samples: Array.from(waveSamples), viewMode: waveViewMode });
  _waveIO.applyState = (state) => {
    if (Array.isArray(state?.samples) && state.samples.length === WN) {
      waveSamples.set(state.samples);
    }
    if (state?.viewMode && (state.viewMode === 'linear' || state.viewMode === 'radial')) {
      waveViewMode = state.viewMode;
      const btn = document.getElementById('wave-view-toggle');
      if (btn) btn.textContent = waveViewMode === 'radial' ? '— Linear' : '○ Radial';
    }
    renderWaveDraw();
    scheduleApply();
  };
  _waveIO.setSourceMode = setSourceMode;
})();

// ── Waveform selector ─────────────────────────────────────────────────

const WAVE_TYPES = ['sine', 'triangle', 'square', 'sawtooth'];
let _waveT = 0;
let _waveAnimRaf = 0;

function drawWaveCanvas(cvs, type, t) {
  const wctx = cvs.getContext('2d');
  const W = cvs.offsetWidth || 52, H = cvs.offsetHeight || 22;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
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

function _waveCanvasVisible(cvs) {
  return !!cvs && cvs.offsetParent !== null;
}

function _hasVisibleWaveCanvas() {
  return WAVE_TYPES.some(type => {
    const cvs = document.getElementById('wave-' + type);
    const scvs = document.getElementById('solo-wave-' + type);
    return _waveCanvasVisible(cvs) || _waveCanvasVisible(scvs);
  });
}

export function scheduleWaveCanvasAnimation() {
  if (_waveAnimRaf) return;
  const step = () => {
    _waveAnimRaf = 0;
    if (!_hasVisibleWaveCanvas()) return;
    _waveT += 0.025;
    WAVE_TYPES.forEach(type => {
      const cvs = document.getElementById('wave-' + type);
      if (_waveCanvasVisible(cvs)) drawWaveCanvas(cvs, type, _waveT);
      const scvs = document.getElementById('solo-wave-' + type);
      if (_waveCanvasVisible(scvs)) drawWaveCanvas(scvs, type, _waveT);
    });
    _waveAnimRaf = requestAnimationFrame(step);
  };
  _waveAnimRaf = requestAnimationFrame(step);
}

scheduleWaveCanvasAnimation();

document.querySelectorAll('.wave-cvs').forEach(cvs => {
  cvs.addEventListener('click', () => {
    SYNTH.waveform = cvs.dataset.wave; SYNTH.customWave = null; SYNTH.sourceMode = 'synth';
    document.querySelectorAll('.seq-src-btn').forEach(b => b.classList.remove('active'));
    const synthBtn = document.getElementById('seq-src-synth');
    if (synthBtn) synthBtn.classList.add('active');
    document.getElementById('seq-wave-ctrl-bar').style.display = 'none';
    document.getElementById('seq-wave-bar').style.display = 'none';
    document.getElementById('seq-sample-bar').style.display = 'none';
    document.querySelector('#seq-wrap .seq-panel')?.classList.remove('wave-expand');
    document.querySelectorAll('.wave-cvs').forEach(c => c.classList.remove('active'));
    cvs.classList.add('active');
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    scheduleWaveCanvasAnimation();
  });
});

document.querySelectorAll('.solo-wave-cvs').forEach(cvs => {
  cvs.addEventListener('click', () => {
    SOLO_SYNTH.waveform = cvs.dataset.wave;
    document.querySelectorAll('.solo-wave-cvs').forEach(c => c.classList.remove('active'));
    cvs.classList.add('active');
    scheduleWaveCanvasAnimation();
  });
});

document.querySelectorAll('.wave-cvs').forEach(c =>
  c.classList.toggle('active', c.dataset.wave === SYNTH.waveform));
document.querySelectorAll('.solo-wave-cvs').forEach(c =>
  c.classList.toggle('active', c.dataset.wave === SOLO_SYNTH.waveform));

// ── Synth visual controls ─────────────────────────────────────────────

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
      scheduleWaveCanvasAnimation();
      allSynCvs.forEach(({ cvs, slider, fn }) => { const rect = cvs.getBoundingClientRect(); if (rect.width > 0) cvs.width = Math.round(rect.width); paintSyn(cvs, slider, fn); });
    }
  });
})();
