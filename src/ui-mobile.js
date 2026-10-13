import { S } from './state.js';
import { TEMPERAMENTS, SCALE_FAMILIES } from './data.js';
import { scheduleDrawSequencer } from './sequencer.js';
import { scheduleDrmDraw } from './drum.js';
import { draw } from './visualizer.js';
import { scheduleDrawFretboard } from './fretboard.js';
import {
  drawTonnetz, populateScaleSelect, refreshRootUi, updateInfo,
  applyTemperamentSelection, applyScaleFamilySelection, applyScaleNameSelection,
} from './ui-scale.js';
import { syncMixerUi } from './ui-mixer.js';
import { scheduleWaveCanvasAnimation } from './ui-synth.js';

// ── Mobile slides helpers ─────────────────────────────────────────────

export function isMobileSlides() { return window.innerWidth <= 768; }

export const SLIDE_ELS = () => [
  document.querySelector('.main-layout'),
  document.getElementById('seq-wrap'),
  document.getElementById('drum-wrap'),
  document.getElementById('clips-wrap'),
];

export function scrollToSlide(idx) {
  const outer = document.getElementById('outer-wrap');
  const els = SLIDE_ELS();
  const target = els[idx];
  if (!target || !outer) return;
  outer.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
}

document.querySelectorAll('.slide-dot').forEach(dot => {
  dot.addEventListener('click', () => scrollToSlide(parseInt(dot.dataset.slide)));
});

// ── Mobile slides init ────────────────────────────────────────────────

(function initMobileSlides() {
  if (!isMobileSlides()) return;

  document.body.classList.add('on-viz-slide');

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
  if (strip) strip.style.display = 'block';
  document.body.style.setProperty('--strip-h', '0px');

  function closePanelOverlay(wrapId) {
    const wrap = document.getElementById(wrapId); if (!wrap) return;
    wrap.classList.remove('open');
    if (wrapId === 'mixer-wrap') { syncMixerUi(false); document.body.classList.remove('mixer-open'); }
    else if (wrapId === 'synth-wrap') { document.getElementById('btn-seq-synth')?.classList.remove('active-synth'); }
  }
  function openPanelOverlay(wrapId) {
    const wrap = document.getElementById(wrapId); if (!wrap) return;
    wrap.classList.add('open');
    if (wrapId === 'mixer-wrap') { syncMixerUi(true); document.body.classList.add('mixer-open'); }
    else if (wrapId === 'synth-wrap') { document.getElementById('btn-seq-synth')?.classList.add('active-synth'); }
    if (wrapId === 'synth-wrap' || wrapId === 'solo-synth-wrap') scheduleWaveCanvasAnimation();
  }

  [
    { wrapId: 'mixer-wrap', label: '<svg class="hdr-icon" style="width:1.1em;height:1.1em;margin-right:4px;fill:currentColor"><use href="#icon-mixer"></use></svg>Mixer', color: '#60a5fa' },
    { wrapId: 'synth-wrap', label: '<svg class="hdr-icon" style="width:1.1em;height:1.1em;margin-right:4px;fill:currentColor"><use href="#icon-synth"></use></svg>Sound', color: '#f59e0b' },
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

  const outer = document.getElementById('outer-wrap');
  const dots = document.querySelectorAll('.slide-dot');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const idx = SLIDE_ELS().indexOf(entry.target); if (idx < 0) return;
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      document.getElementById('btn-seq').classList.toggle('active-seq', idx === 1);
      document.getElementById('btn-drums').classList.toggle('active-drums', idx === 2);
      document.getElementById('btn-clips').classList.toggle('active-clips', idx === 3);
      document.body.classList.toggle('on-viz-slide', idx === 0);
      if (strip) strip.style.display = 'block';
      document.body.style.setProperty('--strip-h', '0px');
      if (idx === 0) setTimeout(() => {
        // resize is in main.js; we trigger via event
        window.dispatchEvent(new Event('app-resize'));
      }, 60);
      if (idx === 3) setTimeout(drawTonnetz, 50);
    });
  }, { root: outer, threshold: 0.5 });

  setTimeout(() => {
    SLIDE_ELS().forEach(el => { if (el) obs.observe(el); });
    scheduleDrawSequencer(); scheduleDrmDraw();
  }, 80);

  // Swipe guard
  if (outer) {
    const SWIPE_H_THRESHOLD = 48;
    let _sgStartX = 0, _sgStartY = 0, _sgDecided = false, _sgAllow = false;

    outer.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      if (e.target.tagName === 'CANVAS') { _sgDecided = true; _sgAllow = true; return; }
      _sgStartX = e.touches[0].clientX;
      _sgStartY = e.touches[0].clientY;
      _sgDecided = false; _sgAllow = false;
    }, { passive: true });

    outer.addEventListener('touchmove', e => {
      if (_sgDecided) { if (!_sgAllow) e.preventDefault(); return; }
      const dx = Math.abs(e.touches[0].clientX - _sgStartX);
      const dy = Math.abs(e.touches[0].clientY - _sgStartY);
      if (dx + dy < 6) return;
      if (dy > dx * 1.2) { _sgDecided = true; _sgAllow = false; e.preventDefault(); }
      else if (dx >= SWIPE_H_THRESHOLD && dx > dy) { _sgDecided = true; _sgAllow = true; }
      else { e.preventDefault(); }
    }, { passive: false });

    outer.addEventListener('touchend', () => { _sgDecided = false; _sgAllow = false; }, { passive: true });
    outer.addEventListener('touchcancel', () => { _sgDecided = false; _sgAllow = false; }, { passive: true });
  }

  // Mobile scale strip selectors
  const mobTempSel = document.getElementById('mob-temp-sel');
  if (mobTempSel) {
    Object.entries(TEMPERAMENTS).forEach(([k, v]) => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = v.name
        .replace('Equal (12-TET)', 'Equal').replace('Just Intonation (5-limit)', 'Just')
        .replace('Pythagorean', 'Pythag.').replace('Meantone (¼-comma)', 'Meantone')
        .replace('Werckmeister III', 'Werkm. III');
      if (k === S.temp) opt.selected = true;
      mobTempSel.appendChild(opt);
    });
    mobTempSel.addEventListener('change', function () { applyTemperamentSelection(this.value); });
  }

  const mobFamSel = document.getElementById('mob-family-sel');
  if (mobFamSel) {
    Object.entries(SCALE_FAMILIES).forEach(([k, v]) => {
      const opt = document.createElement('option');
      const shortName = v.name.replace('Western Modes', 'Western').replace('Pentatonic & Blues', 'Penta.').replace('Arabic Maqamat', 'Arabic').replace('Indian Ragas', 'Indian');
      opt.value = k; opt.textContent = shortName;
      if (k === S.family) opt.selected = true;
      mobFamSel.appendChild(opt);
    });
    mobFamSel.addEventListener('change', function () { applyScaleFamilySelection(this.value); });
  }

  populateScaleSelect('mob-scale-sel');
  refreshRootUi();

  document.getElementById('mob-root-prev')?.addEventListener('click', () => {
    S.root = (S.root + 11) % 12;
    refreshRootUi(); updateInfo(); draw();
    if (S.fretboardOpen) scheduleDrawFretboard();
  });
  document.getElementById('mob-root-next')?.addEventListener('click', () => {
    S.root = (S.root + 1) % 12;
    refreshRootUi(); updateInfo(); draw();
    if (S.fretboardOpen) scheduleDrawFretboard();
  });

  document.getElementById('mob-scale-sel')?.addEventListener('change', function () { applyScaleNameSelection(this.value); });
  document.getElementById('sel-scale')?.addEventListener('change', () => {
    const ms = document.getElementById('mob-scale-sel');
    if (ms && ms.value !== S.scaleName) ms.value = S.scaleName;
  });
})();
