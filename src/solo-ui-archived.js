// ═══════════════════════════════════════════════════════════════════
// SOLO UI WIRING — archived, not imported in build
// To restore: import these handlers back into main.js,
// re-add ResizeObserver for solo-wrap, and restore HTML from solo-archived.html.
// ═══════════════════════════════════════════════════════════════════

// ResizeObserver (was at module scope in main.js after viz panel observer):
// const roTonnetz = new ResizeObserver(() => drawTonnetz());
// roTonnetz.observe(document.getElementById('solo-wrap'));

// Mobile slide index 3 active state (was in initMobileSlides intersection observer):
// document.getElementById('btn-solo').classList.toggle('active-solo', idx === 3);

// ── SOLO PANEL ────────────────────────────────────────────────────────

document.getElementById('btn-solo').addEventListener('click', function () {
  if (isMobileSlides()) { scrollToSlide(3); return; }
  const wrap = document.getElementById('solo-wrap');
  const open = wrap.classList.toggle('open');
  this.classList.toggle('active-solo', open);
  if (open) setTimeout(drawTonnetz, 50);
});

document.getElementById('btn-solo-synth').addEventListener('click', () => {
  const open = document.getElementById('solo-synth-wrap').classList.toggle('open');
  if (open) scheduleWaveCanvasAnimation();
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
      scheduleWaveCanvasAnimation();
      document.querySelectorAll('#solo-synth-wrap .syn-vis-ctrl').forEach(cvs => {
        const rect = cvs.getBoundingClientRect();
        if (rect.width > 0) cvs.width = Math.round(rect.width);
        const slider = cvs.nextElementSibling;
        if (slider) slider.dispatchEvent(new Event('input'));
      });
    }
  });
}

// Solo wave canvas clicks (was near .wave-cvs listeners):
document.querySelectorAll('.solo-wave-cvs').forEach(cvs => {
  cvs.addEventListener('click', () => {
    SOLO_SYNTH.waveform = cvs.dataset.wave;
    document.querySelectorAll('.solo-wave-cvs').forEach(c => c.classList.remove('active'));
    cvs.classList.add('active');
    scheduleWaveCanvasAnimation();
  });
});
