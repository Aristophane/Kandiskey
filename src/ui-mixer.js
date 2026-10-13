import { audio } from './audio.js';
import { fmtHz, fmtMs } from './ui-synth.js';
import { setFilterNorm as vizSetFilterNorm } from './visualizer.js';

function withAudio(fn) { audio._resume(); setTimeout(fn, 0); }

// ── syncMixerUi ───────────────────────────────────────────────────────

export function syncMixerUi(open) {
  ['btn-mixer', 'btn-viz-mixer', 'btn-seq-panel-mixer', 'btn-drum-panel-mixer',
   'btn-clips-panel-mixer', 'btn-mob-footer-mixer'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active-mixer', open);
  });
}

// ── getMixerState ─────────────────────────────────────────────────────

export function getMixerState() {
  const qf = id => { const el = document.getElementById(id); return el ? parseFloat(el.value) : undefined; };
  const activeType = document.querySelector('[data-type].active');
  return {
    melody:    qf('mix-melody'),
    drums:     qf('mix-drums'),
    master:    qf('mix-master'),
    reverb:    qf('mix-reverb'),
    dist:      qf('mix-dist'),
    delayWet:  qf('mix-delay-wet'),
    delayTime: qf('mix-delay-time'),
    delayFb:   qf('mix-delay-fb'),
    gfltCut:   qf('mix-gflt-cut'),
    gfltRes:   qf('mix-gflt-res'),
    gfltType:  activeType ? activeType.dataset.type : 'lowpass',
  };
}

// ── Mixer slider listeners ────────────────────────────────────────────

document.getElementById('mix-melody')?.addEventListener('input', function () {
  const v = parseInt(this.value) / 100;
  document.getElementById('mix-mel-val').textContent = parseInt(this.value) + '%';
  withAudio(() => { if (audio.melodyBus) audio.melodyBus.gain.value = v; });
});
document.getElementById('mix-master')?.addEventListener('input', function () {
  const v = parseInt(this.value) / 100;
  document.getElementById('mix-master-val').textContent = parseInt(this.value) + '%';
  withAudio(() => { if (audio.master) audio.master.gain.setTargetAtTime(v, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-drums')?.addEventListener('input', function () {
  const v = parseInt(this.value) / 100;
  document.getElementById('mix-drm-val').textContent = parseInt(this.value) + '%';
  withAudio(() => { if (audio.drumBus) audio.drumBus.gain.value = v; });
});
document.getElementById('mix-reverb')?.addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-rev-val').textContent = v + '%';
  withAudio(() => { if (audio.revSend) audio.revSend.gain.setTargetAtTime(v / 100 * 1.28, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-dist')?.addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-dist-val').textContent = v + '%';
  withAudio(() => {
    if (!audio.distNode) return;
    audio.applyDistortion(v / 100);
    audio.distWet.gain.setTargetAtTime(v / 100 * 0.7, audio.actx.currentTime, 0.02);
  });
});
document.getElementById('mix-delay-wet')?.addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-dly-val').textContent = v + '%';
  withAudio(() => { if (audio.delayWet) audio.delayWet.gain.setTargetAtTime(v / 100 * 0.8, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-delay-time')?.addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-dlt-val').textContent = v + 'ms';
  withAudio(() => { if (audio.delayNode) audio.delayNode.delayTime.setTargetAtTime(v / 1000, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-delay-fb')?.addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('mix-dfb-val').textContent = v + '%';
  withAudio(() => { if (audio.delayFeedback) audio.delayFeedback.gain.setTargetAtTime(v / 100, audio.actx.currentTime, 0.02); });
});
document.getElementById('mix-gflt-cut')?.addEventListener('input', function () {
  const v = parseFloat(this.value);
  const hz = v >= 100 ? 20000 : Math.round(20 * Math.pow(1000, v / 100));
  const label = v >= 100 ? 'Open' : (hz >= 1000 ? (hz / 1000).toFixed(1) + 'kHz' : hz + 'Hz');
  document.getElementById('mix-gflt-val').textContent = label;
  vizSetFilterNorm(v / 100);
  withAudio(() => { if (audio.globalFilter) audio.globalFilter.frequency.setTargetAtTime(hz, audio.actx.currentTime, 0.015); });
});
document.getElementById('mix-gflt-res')?.addEventListener('input', function () {
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

// ── Mixer visual controls ─────────────────────────────────────────────

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
