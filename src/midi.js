// ═══════════════════════════════════════════════════════════════════
// MIDI ENGINE — parser, player, embedded files
// ═══════════════════════════════════════════════════════════════════

import { MAQAM_CENTS } from './data.js';
import { S, getScale, setMidiActiveQuantizedMidi } from './state.js';
import { audio } from './audio.js';

// ── Injected callbacks ──────────────────────────────────────────────

let _draw          = () => {};
let _drawFretboard = () => {};

export function setDrawCallback(fn)         { _draw          = fn; }
export function setDrawFretboardCallback(fn){ _drawFretboard = fn; }

// ── MIDI Parser ─────────────────────────────────────────────────────

class MidiParser {
  constructor(buffer) { this.data = new Uint8Array(buffer); this.pos = 0; }

  _u32() {
    const v = ((this.data[this.pos] << 24) | (this.data[this.pos+1] << 16) |
               (this.data[this.pos+2] << 8) | this.data[this.pos+3]) >>> 0;
    this.pos += 4; return v;
  }
  _u16() { const v = (this.data[this.pos] << 8) | this.data[this.pos+1]; this.pos += 2; return v; }
  _vlq() {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.data[this.pos++];
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  }

  parse() {
    this.pos = 0;
    this._u32(); this._u32();
    const format    = this._u16();
    const numTracks = this._u16();
    const division  = this._u16();
    const tracks    = [];
    for (let t = 0; t < numTracks; t++) {
      this._u32();
      const len = this._u32();
      const end = this.pos + len;
      tracks.push(this._parseTrack(end));
      this.pos = end;
    }
    return { format, division, tracks };
  }

  _parseTrack(end) {
    const events = [];
    let tick = 0, rs = 0;
    while (this.pos < end) {
      tick += this._vlq();
      let st = this.data[this.pos];
      if (st & 0x80) { rs = st; this.pos++; } else { st = rs; }
      const type = st & 0xf0, ch = st & 0x0f;

      if (st === 0xff) {
        const mt = this.data[this.pos++], ml = this._vlq();
        if (mt === 0x51 && ml === 3) {
          const tempo = (this.data[this.pos] << 16) | (this.data[this.pos+1] << 8) | this.data[this.pos+2];
          events.push({ tick, type: 'tempo', tempo });
        }
        this.pos += ml;
      } else if (st === 0xf0 || st === 0xf7) {
        this.pos += this._vlq();
      } else if (type === 0x80 || type === 0x90) {
        const note = this.data[this.pos++], vel = this.data[this.pos++];
        events.push({ tick, type: (type === 0x90 && vel > 0) ? 'noteon' : 'noteoff', note, vel, ch });
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) { this.pos += 2; }
        else if (type === 0xc0 || type === 0xd0) { this.pos += 1; }
        else { this.pos++; }
    }
    return events;
  }
}

// ── Timeline builder ────────────────────────────────────────────────

export function buildTimeline(parsed) {
  const { division, tracks } = parsed;
  const all = [];
  tracks.forEach(tr => tr.forEach(ev => all.push(ev)));
  all.sort((a, b) => a.tick - b.tick || (a.type === 'tempo' ? -1 : 1));

  const tempoMap = [{ tick: 0, tempo: 500000, sec: 0 }];
  all.forEach(ev => {
    if (ev.type !== 'tempo') return;
    const last = tempoMap[tempoMap.length - 1];
    const sec  = last.sec + (ev.tick - last.tick) * last.tempo / 1e6 / division;
    tempoMap.push({ tick: ev.tick, tempo: ev.tempo, sec });
  });

  function t2s(tick) {
    let seg = tempoMap[0];
    for (const s of tempoMap) { if (s.tick <= tick) seg = s; else break; }
    return seg.sec + (tick - seg.tick) * seg.tempo / 1e6 / division;
  }

  const pending = {}, notes = [];
  all.forEach(ev => {
    if (ev.type !== 'noteon' && ev.type !== 'noteoff') return;
    const key = `${ev.ch}_${ev.note}`;
    if (ev.type === 'noteon') {
      if (!pending[key]) pending[key] = [];
      pending[key].push({ tick: ev.tick, vel: ev.vel });
    } else if (pending[key] && pending[key].length) {
      const on = pending[key].shift();
      const startS = t2s(on.tick), endS = t2s(ev.tick);
      notes.push({ startS, durationS: Math.max(endS - startS, 0.04), note: ev.note, vel: on.vel });
    }
  });
  Object.entries(pending).forEach(([key, arr]) => {
    arr.forEach(on => {
      const note = parseInt(key.split('_')[1]);
      notes.push({ startS: t2s(on.tick), durationS: 0.4, note, vel: on.vel });
    });
  });

  notes.sort((a, b) => a.startS - b.startS);
  return notes;
}

// ── MIDI Player ─────────────────────────────────────────────────────

export class MidiPlayer {
  constructor(timeline) {
    this.timeline = timeline;
    this.playing  = false;
    this.startCtx = 0;
    this.speed    = 1;
    this.totalS   = timeline.length
      ? timeline[timeline.length-1].startS + timeline[timeline.length-1].durationS : 0;
    this._ivl = null;
    this._raf = null;
  }

  _scaleCents() {
    if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) return MAQAM_CENTS[S.scaleName].slice();
    return getScale().map(d => d * 100);
  }

  _nearestIdx(midiNote, scaleCents) {
    if (!scaleCents.length) return 0;
    const pcCents = ((midiNote - S.root) % 12 + 12) % 12 * 100;
    let best = 0, bd = Infinity;
    scaleCents.forEach((c, i) => {
      const d = Math.abs(((c - pcCents + 600) % 1200) - 600);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  _freqFromIdx(idx, midiNote, scaleCents) {
    const midiHz = 440 * Math.pow(2, (midiNote - 69) / 12);
    let baseHz;
    if (S.family === 'arabic' && MAQAM_CENTS[S.scaleName]) {
      const rootHz = 261.62556 * Math.pow(2, S.root / 12);
      baseHz = rootHz * Math.pow(2, scaleCents[idx] / 1200);
    } else {
      baseHz = audio.degreeFreq(S.root, getScale()[idx], S.temp, 4);
    }
    return baseHz * Math.pow(2, Math.round(Math.log2(midiHz / baseHz)));
  }

  play(speed = 1) {
    audio._resume();
    this.speed    = speed;
    this.playing  = true;
    this.startCtx = audio.actx.currentTime + 0.05;
    this.timeline.forEach(n => { delete n._sched; delete n._qFreq; delete n._qMidi; });

    let prevIdx = -1, prevOrigMidi = null, prevSig = '';
    const LOOK = 0.25;

    this._ivl = setInterval(() => {
      if (!this.playing) return;
      const now       = audio.actx.currentTime;
      const elapsed   = (now - this.startCtx) * speed;
      const scaleCents = this._scaleCents();
      const sig = `${S.root}|${S.temp}|${S.family}|${S.scaleName}`;

      if (sig !== prevSig) { prevIdx = -1; prevOrigMidi = null; prevSig = sig; }

      for (const note of this.timeline) {
        if (note._sched) continue;
        const t = note.startS / speed;
        if (t > elapsed + LOOK) break;

        let idx = this._nearestIdx(note.note, scaleCents);
        if (prevIdx >= 0 && idx === prevIdx && note.note !== prevOrigMidi) {
          const dir = note.note > prevOrigMidi ? +1 : -1;
          const ni  = prevIdx + dir;
          if (ni >= 0 && ni < scaleCents.length) idx = ni;
        }

        const freq = this._freqFromIdx(idx, note.note, scaleCents);
        note._qFreq = freq;
        note._qMidi = Math.round(69 + 12 * Math.log2(freq / 440));
        prevIdx      = idx;
        prevOrigMidi = note.note;

        audio._playHz(freq, Math.max(this.startCtx + t - now, 0),
          Math.min(note.durationS / speed, 1.4), (note.vel / 127) * 0.55);
        note._sched = true;
      }

      if (elapsed > this.totalS + 0.8) this.stop();
    }, 50);

    const rafLoop = () => {
      if (!this.playing) return;
      const elapsed = (audio.actx.currentTime - this.startCtx) * speed;
      document.getElementById('midi-prog').style.width =
        Math.min(elapsed / this.totalS * 100, 100) + '%';
      let active = null;
      for (const n of this.timeline) {
        const t = n.startS / speed;
        if (elapsed >= t - 0.02 && elapsed < t + n.durationS / speed) { active = n; break; }
      }
      setMidiActiveQuantizedMidi(active ? active._qMidi : null);
      _draw();
      if (S.fretboardOpen) _drawFretboard();
      this._raf = requestAnimationFrame(rafLoop);
    };
    this._raf = requestAnimationFrame(rafLoop);
  }

  stop() {
    this.playing = false;
    clearInterval(this._ivl);
    if (this._raf) cancelAnimationFrame(this._raf);
    audio.stopAll();
    setMidiActiveQuantizedMidi(null);
    document.getElementById('midi-prog').style.width = '0%';
    document.getElementById('btn-midi-play').style.display = '';
    document.getElementById('btn-midi-stop').style.display = 'none';
    _draw();
    if (S.fretboardOpen) _drawFretboard();
  }

  setSpeed(newSpeed) {
    if (!this.playing) return;
    const now       = audio.actx.currentTime;
    const elapsedTL = (now - this.startCtx) * this.speed;
    this.speed      = newSpeed;
    this.startCtx   = now - elapsedTL / newSpeed;
    this.timeline.forEach(n => { if (n._sched && n.startS > elapsedTL) delete n._sched; });
    audio.stopAll();
    audio._resume();
  }
}

// ── Embedded MIDI files ─────────────────────────────────────────────

export const MIDI_FILES = [
  { id: 'bach_cello', title: 'Bach – Cello Suite No.2 Prelude (BWV 1008)', b64: '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ZHgwAAAyZHgyAAA1ZHg1AAAuZHguAAA3ZHg3AAA5ZHg5AAA6ZHg6AAAxZHgxAAA6ZHg6AAA5ZHg5AAA3ZHg3AAA1ZHg1AAA0ZHg0AAA1ZHg1AAA5ZHg5AAAyZHgyAAA6ZHg6AAA8ZHg8AAA+ZHg+AAA0ZHg0AAA+ZHg+AAA8ZHg8AAA6ZHg6AAA5ZHg5AAA3ZHg3AAA5ZHg5AAA8ZHg8AAA1ZHg1AAA+ZHg+AABAZHhAAABBZHhBAAA3ZHg3AABBZHhBAABAZHhAAAA+ZHg+AAA9ZHg9AAA3ZHg3AAA1ZHg1AAA0ZHg0AAAtZHgtAAA0ZHg0AAA1ZHg1AAA3ZHg3AAA9ZHg9AAA6ZHg6AAA5ZHg5AAA3ZHg3AAA1ZHg1AAA3ZHg3AAA5ZHg5AAA9ZHg9AAA+ZHg+AAA5ZHg5AAA3ZHg3AAA1ZHg1AAA5ZHg5AAA1ZHg1AAA0ZHg0AAAyZHgyAAA4ZHg4AAAyZHgyAAA0ZHg0AAA1ZHg1AAAtZHgtAAA1ZHg1AAA0ZHg0AAAyZHgyAAA4ZHg4AAA1ZHg1AAA0ZHg0AAAyZHgyAAAxZHgxAAAvZHgvAAAxZHgxAAA0ZHg0AAA5ZHg5AAA0ZHg0AAAxZHgxAAA0ZHg0AAAtZHgtAAA3ZHg3AAA1ZHg1AAA0ZHg0AAA1ZHg1AAA0ZHg0AAA1ZHg1AAA5ZHg5AAA+ZHg+AAA5ZHg5AAA1ZHg1AAA5ZHg5AAAyZHgyAAA8ZHg8AAA6ZHg6AAA5ZHg5AAA3ZHg3AAA1ZHg1AAA3ZHg3AAA9ZHg9AABAZHhAAAA9ZHg9AAA3ZHg3AAA9ZHg9AAAtZHgtAAA3ZHg3AAA1ZHg1AAA0ZHg0AAAyZHgyAAA5ZHg5AAA+ZHg+AABAZHhAAABBZHhBAAA+ZHg+AAA5ZHg5AAA1ZHg1AAAyZHgyAAA8ZHg8AAA6ZHg6AAA5ZHg5AAA3ZHg3AAA5ZHg5AAA6ZHg6AAAyZHgyAAAzZHgzAAA1ZHg1AAA3ZHg3AAA5ZHg5AAA6ZHg6AAA3ZHg3AAA/ZHg/AAA3ZHg3AAA1ZHg1AAA3ZHg3AAA5ZHg5AAAxZHgxAAAyZHgyAAA0ZHg0AAA1ZHg1AAA3ZHg3AAA5ZHg5AAA1ZHg1AAA+ZHg+AAA1ZHg1AAA0ZHg0AAA1ZHg1AAA3ZHg3AAAuZHguAAAtZHgtAAAvZHgvAAAxZHgxAAAy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' },
  { id: 'crab_canon', title: 'Bach – Crab Canon (BWV 1079)', b64: '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' },
];

// ── MIDI state + init ───────────────────────────────────────────────

let midiTimeline        = null;
export let activeMidiPlayer = null;

export function loadMidiFile(idx) {
  const f = MIDI_FILES[idx];
  try {
    const bin  = atob(f.b64);
    const buf  = new ArrayBuffer(bin.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
    const parsed = new MidiParser(buf).parse();
    midiTimeline = buildTimeline(parsed);
    document.getElementById('btn-midi-play').disabled = false;
    if (activeMidiPlayer) { activeMidiPlayer.stop(); activeMidiPlayer = null; }
    document.getElementById('btn-midi-play').style.display = '';
    document.getElementById('btn-midi-stop').style.display = 'none';
  } catch(e) {
    console.warn('MIDI load error', f.title);
    console.error(e);
  }
}

export function stopActiveMidiPlayer() {
  if (activeMidiPlayer) { activeMidiPlayer.stop(); activeMidiPlayer = null; }
}

// ── MIDI event wiring (called from main.js after DOM ready) ─────────

export function wireMidiControls() {
  loadMidiFile(0);

  document.getElementById('btn-midi-play').addEventListener('click', () => {
    if (!midiTimeline) return;
    if (activeMidiPlayer) { activeMidiPlayer.stop(); activeMidiPlayer = null; }
    activeMidiPlayer = new MidiPlayer(midiTimeline);
    const speed = parseFloat(document.getElementById('midi-speed').value);
    activeMidiPlayer.play(speed);
    document.getElementById('btn-midi-play').style.display = 'none';
    document.getElementById('btn-midi-stop').style.display = '';
  });

  document.getElementById('btn-midi-stop').addEventListener('click', () => {
    if (activeMidiPlayer) { activeMidiPlayer.stop(); activeMidiPlayer = null; }
  });

  document.getElementById('midi-speed').addEventListener('input', function() {
    const v = parseFloat(this.value);
    document.getElementById('midi-spd-lbl').textContent =
      '×' + (Number.isInteger(v) ? v + '.0' : v.toFixed(2).replace(/0+$/, ''));
  });

  document.getElementById('midi-speed').addEventListener('change', function() {
    const v = parseFloat(this.value);
    document.getElementById('midi-spd-lbl').textContent =
      '×' + (Number.isInteger(v) ? v + '.0' : v.toFixed(2).replace(/0+$/, ''));
    if (activeMidiPlayer) activeMidiPlayer.setSpeed(v);
  });
}
