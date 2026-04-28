// ═══════════════════════════════════════════════════════════════════
// GROOVE — timing and velocity feel helpers
// All functions are deterministic (no Math.random at playback time).
// ═══════════════════════════════════════════════════════════════════

import { SEQ } from './state.js';

// ── Deterministic per-step nudge tables (ms) ─────────────────────────
// 16-entry — accessed via step % 16

const _DILLA_HAT  = [ 0, 8, 0,10, 0, 6, 0,12, 0, 9, 0, 7, 0,11, 0, 8];
const _DILLA_MEL  = [ 0, 4, 2, 6, 0, 5, 3, 7, 0, 4, 2, 5, 0, 6, 3, 5];
const _FUNK_PUSH  = [ 0, 0, 0,-10, 0, 0, 0,-12, 0, 0, 0,-10, 0, 0, 0,-12];
const _AFRO_NUDGE = [-5, 0, 0,-6, 0, 0,-5, 0, 0, 0,-6, 0,-5, 0, 0, 0];
const _SAMBA_NUDGE= [ 0, 0, 6,-7, 0, 0, 6,-7, 0, 0, 5,-6, 0, 0, 6,-7];

// Clave accent positions (step % 16)
const _CLAVE_SET = new Set([0, 3, 6, 10, 12]);

// ── Role detection ───────────────────────────────────────────────────

export function drumKeyRole(key) {
  if (!key) return 'other';
  const k = key.toLowerCase();
  if (k.includes('bassdrum') || k.includes('kick') || k.includes('bass_drum')) return 'kick';
  if (k.includes('snare'))  return 'snare';
  if (k.includes('clap'))   return 'clap';
  if (k.includes('hat') || k.includes('hihat')) return 'hat';
  if (k.includes('cowbell') || k.includes('claves') || k.includes('rimshot') ||
      k.includes('tom') || k.includes('cymbal')) return 'perc';
  return 'other';
}

// ── Internal position helpers ────────────────────────────────────────

function _odd(step)           { return (step & 1) === 1; }
function _downbeat(step, spb) { return step % spb === 0; }
function _backbeat(step, spb) { return step % (spb * 2) === spb; }

// ── Template table ───────────────────────────────────────────────────
// Each template exposes two functions:
//   offsetMs(step, spb, role, stepDurMs) → ms  (positive = late, negative = early)
//   velMult(step, spb, role, accent)     → multiplier

const _T = {
  'Straight': {
    offsetMs() { return 0; },
    velMult(step, spb, role, a) {
      if (!a) return 1;
      if (_downbeat(step, spb))                          return 1 + a * 0.12;
      if (_backbeat(step, spb))                          return 1 + a * 0.18;
      if (role === 'hat' && _odd(step))                  return 1 - a * 0.08;
      return 1;
    },
  },

  'Classic Swing': {
    offsetMs(step, spb, role, d) {
      if (!_odd(step)) return 0;
      if (role === 'hat' || role === 'perc')             return d * 0.18;
      if (role === 'melody')                             return d * 0.12;
      if (role === 'kick')                               return d * 0.05;
      if (role === 'snare' || role === 'clap')           return 6;
      return d * 0.10;
    },
    velMult(step, spb, role, a) {
      if (!a) return 1;
      if (_downbeat(step, spb))  return 1 + a * 0.14;
      if (_backbeat(step, spb))  return 1 + a * 0.12;
      if (_odd(step))            return 1 - a * 0.10;
      return 1;
    },
  },

  'MPC 54': {
    offsetMs(step, spb, role, d) {
      if (!_odd(step)) return 0;
      if (role === 'hat' || role === 'perc')             return d * 0.10;
      if (role === 'melody')                             return d * 0.06;
      if (role === 'kick')                               return d * 0.03;
      if (role === 'snare' || role === 'clap')           return 4;
      return d * 0.07;
    },
    velMult(step, spb, role, a) {
      if (!a) return 1;
      const hat = role === 'hat';
      if (_downbeat(step, spb))           return 1 + a * 0.12;
      if (_backbeat(step, spb))           return 1 + a * 0.14;
      if (hat && _odd(step))              return 1 - a * 0.12;
      if (hat)                            return 1 + a * 0.06;
      return 1;
    },
  },

  'Dilla / laid-back hats': {
    offsetMs(step, spb, role) {
      const i = step % 16;
      if (role === 'hat')                                return _DILLA_HAT[i];
      if (role === 'snare' || role === 'clap')           return 10;
      if (role === 'kick') return _downbeat(step, spb) ? 0 : -6;
      if (role === 'melody')                             return _DILLA_MEL[i];
      return 4;
    },
    velMult(step, spb, role, a) {
      if (!a) return 1;
      if (_backbeat(step, spb))            return 1 + a * 0.16;
      if (role === 'hat' && _odd(step))    return 1 - a * 0.18;
      if (role === 'hat')                  return 1 + a * 0.08;
      return 1;
    },
  },

  'Funk push': {
    offsetMs(step, spb, role, d) {
      const i = step % 16;
      if (role === 'kick')
        return _downbeat(step, spb) ? 0 : _FUNK_PUSH[i];
      if (role === 'melody')
        return _downbeat(step, spb) ? 0 : _FUNK_PUSH[i] * 0.6;
      if (role === 'hat' || role === 'perc')
        return _odd(step) ? d * 0.05 : 0;
      if (role === 'snare' || role === 'clap') return 3;
      return _FUNK_PUSH[i] * 0.5;
    },
    velMult(step, spb, role, a) {
      if (!a) return 1;
      if (_downbeat(step, spb))                         return 1 + a * 0.15;
      if (_backbeat(step, spb))                         return 1 + a * 0.14;
      if (step % spb === spb - 1)                       return 1 + a * 0.10;
      if (role === 'hat' && _odd(step))                 return 1 - a * 0.08;
      return 1;
    },
  },

  'Afro / clave lilt': {
    offsetMs(step) { return _AFRO_NUDGE[step % 16]; },
    velMult(step, spb, role, a) {
      if (!a) return 1;
      return _CLAVE_SET.has(step % 16) ? 1 + a * 0.18 : 1 - a * 0.06;
    },
  },

  'Samba': {
    offsetMs(step) { return _SAMBA_NUDGE[step % 16]; },
    velMult(step, spb, role, a) {
      if (!a) return 1;
      const s16 = step % 16;
      const hat = role === 'hat' || role === 'perc';
      if (s16 === 0)                       return 1 + a * 0.20;
      if (s16 === 10 || s16 === 12)        return 1 + a * 0.12;
      if (hat && _odd(step))               return 1 + a * 0.12;
      if (hat)                             return 1 - a * 0.08;
      return 1;
    },
  },
};

export const GROOVE_TEMPLATES = Object.keys(_T);

// ── Public API ───────────────────────────────────────────────────────

/**
 * Returns { offsetSec, velocity } for a single scheduled event.
 * @param {object} p
 * @param {number} p.step          - loop-relative step index
 * @param {number} p.spb           - steps per beat (from seqR().spb)
 * @param {number} p.stepDurSec    - duration of one step in seconds
 * @param {string} p.role          - 'melody'|'kick'|'snare'|'clap'|'hat'|'perc'|'other'
 * @param {number} p.baseVelocity  - nominal gain (0–1)
 */
export function getGrooveEvent({ step, spb, stepDurSec, role, baseVelocity }) {
  const groove = SEQ.groove;
  const tmpl   = _T[groove.template] || _T['Straight'];
  const accent = groove.accent ?? 0;

  const offsetMs  = tmpl.offsetMs(step, spb, role, stepDurSec * 1000);
  const offsetSec = offsetMs / 1000;

  const rawMult = tmpl.velMult(step, spb, role, accent);
  const velocity = Math.max(0.05, Math.min(1.2, baseVelocity * rawMult));

  return { offsetSec, velocity };
}
