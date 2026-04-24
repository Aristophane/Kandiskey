// ═══════════════════════════════════════════════════════════════════
// AUDIO ENGINE — additive synthesis, exact temperament frequencies
// ═══════════════════════════════════════════════════════════════════

import { TEMPERAMENTS } from './data.js';
import { SYNTH } from './state.js';

export class AudioEngine {
  constructor() {
    this.actx = null;
    this.master = null;
    this.reverb = null;
    this.ready = false;
    this.enabled = true;
  }

  _init() {
    if (this.ready) return;
    this.actx = new (window.AudioContext || window.webkitAudioContext)();

    this.melodyBus = this.actx.createGain(); this.melodyBus.gain.value = 1.0;
    this.drumBus   = this.actx.createGain(); this.drumBus.gain.value   = 1.0;

    this.master = this.actx.createGain(); this.master.gain.value = 0.55;
    this.melodyBus.connect(this.master);

    this.filter = this.actx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = SYNTH.filterFreq;
    this.filter.Q.value = SYNTH.filterQ;

    this.kill = this.actx.createGain(); this.kill.gain.value = 1;

    const comp = this.actx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 5;
    comp.attack.value = 0.002;  comp.release.value = 0.08;

    this.globalFilter = this.actx.createBiquadFilter();
    this.globalFilter.type = 'lowpass';
    this.globalFilter.frequency.value = 20000;
    this.globalFilter.Q.value = 0.7;

    this.distNode = this.actx.createWaveShaper();
    this.distNode.oversample = '4x';
    this.distNode.curve = this._makeDistCurve(0);
    this.distWet = this.actx.createGain(); this.distWet.gain.value = 0;

    this.delayNode = this.actx.createDelay(2.0);
    this.delayNode.delayTime.value = 0.25;
    this.delayFeedback = this.actx.createGain(); this.delayFeedback.gain.value = 0.30;
    this.delayWet = this.actx.createGain(); this.delayWet.gain.value = 0;

    this.reverb = this._makeReverb(2.2, 2.8);
    this.revSend = this.actx.createGain(); this.revSend.gain.value = 0.64;

    this.drumComp = this.actx.createDynamicsCompressor();
    this.drumComp.threshold.value = -12; this.drumComp.ratio.value = 4;
    this.drumComp.attack.value = 0.003; this.drumComp.release.value = 0.1;
    this.drumBus.connect(this.drumComp);
    this.drumComp.connect(this.actx.destination);

    this.master.connect(this.filter);
    this.filter.connect(this.kill);
    this.kill.connect(comp);
    comp.connect(this.globalFilter);
    this.globalFilter.connect(this.actx.destination);
    this.kill.connect(this.distNode);
    this.distNode.connect(this.distWet);
    this.distWet.connect(comp);
    this.kill.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(comp);
    this.kill.connect(this.revSend);
    this.revSend.connect(this.reverb);
    this.reverb.connect(this.globalFilter);

    this.ready = true;
  }

  _makeDistCurve(amount) {
    const n = 256, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = amount > 0
        ? ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
        : x;
    }
    return curve;
  }

  applyDistortion(amount) {
    if (!this.ready) return;
    this.distNode.curve = this._makeDistCurve(amount * 400);
  }

  _makeReverb(dur, decay) {
    const sr = this.actx.sampleRate;
    const len = Math.floor(sr * dur);
    const buf = this.actx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    const cv = this.actx.createConvolver();
    cv.buffer = buf;
    return cv;
  }

  // Precise frequency: root semitone + scale degree in chosen temperament
  degreeFreq(rootSemitone, degree, tempKey, octave = 4) {
    const C4 = 261.62556;
    const rootHz = C4 * Math.pow(2, rootSemitone / 12);
    const cents = TEMPERAMENTS[tempKey].cents[degree % 12];
    const octShift = Math.floor(degree / 12);
    return rootHz * Math.pow(2, cents / 1200 + octShift + (octave - 4));
  }

  // For fretboard: MIDI note → tempered frequency
  midiFreq(midiNote, rootSemitone, tempKey) {
    const eqHz = 440 * Math.pow(2, (midiNote - 69) / 12);
    const degree = ((midiNote - rootSemitone) % 12 + 12) % 12;
    const deviation = TEMPERAMENTS[tempKey].cents[degree] - degree * 100;
    return eqHz * Math.pow(2, deviation / 1200);
  }

  _playHz(hz, startOffset, duration, velocity = 0.75) {
    if (!this.ready || !this.enabled) return;
    const t = this.actx.currentTime + startOffset;
    const env = this.actx.createGain();
    env.connect(this.melodyBus);

    const pk  = 0.24 * velocity;
    const atk = SYNTH.attack;
    const dec = SYNTH.decay;
    const sus = Math.max(0.001, SYNTH.sustain);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(pk, t + atk);
    env.gain.exponentialRampToValueAtTime(pk * sus, t + atk + dec);
    env.gain.setValueAtTime(pk * sus, t + Math.max(duration - 0.1, atk + 0.05));
    env.gain.exponentialRampToValueAtTime(0.00015, t + duration + 0.08);

    if (SYNTH.sourceMode === 'sample' && SYNTH.sampleBuffer) {
      const src = this.actx.createBufferSource();
      src.buffer = SYNTH.sampleBuffer;
      src.playbackRate.value = hz / SYNTH.sampleBaseFreq;
      src.detune.value = SYNTH.detune;
      src.loop = duration > 0.8;
      src.connect(env);
      src.start(t);
      src.stop(t + duration + 0.1);
      return;
    }

    let lfo = null;
    if (SYNTH.vibratoDepth > 0) {
      lfo = this.actx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = SYNTH.vibratoRate;
      lfo.start(t + atk * 0.6);
      lfo.stop(t + duration + 0.2);
    }

    if (SYNTH.waveform !== 'sine') {
      const osc = this.actx.createOscillator();
      if (SYNTH.waveform === 'custom' && SYNTH.customWave) {
        osc.setPeriodicWave(SYNTH.customWave);
      } else {
        osc.type = SYNTH.waveform;
      }
      osc.frequency.value = hz;
      osc.detune.value = SYNTH.detune;
      if (lfo) {
        const lfoG = this.actx.createGain();
        lfoG.gain.value = hz * (Math.pow(2, SYNTH.vibratoDepth / 1200) - 1);
        lfo.connect(lfoG); lfoG.connect(osc.frequency);
      }
      osc.connect(env); osc.start(t); osc.stop(t + duration + 0.1);
    } else {
      SYNTH.harmonics.slice(0, SYNTH.numHarmonics).forEach(([m, a, df]) => {
        const osc = this.actx.createOscillator();
        const g   = this.actx.createGain();
        osc.type = 'sine';
        osc.frequency.value = hz * m;
        osc.detune.value = SYNTH.detune;
        if (lfo) {
          const lfoG = this.actx.createGain();
          lfoG.gain.value = hz * m * (Math.pow(2, SYNTH.vibratoDepth / 1200) - 1);
          lfo.connect(lfoG); lfoG.connect(osc.frequency);
        }
        const hd = duration * df + 0.05;
        g.gain.setValueAtTime(a, t);
        g.gain.exponentialRampToValueAtTime(0.00015, t + hd);
        osc.connect(g); g.connect(env); osc.start(t); osc.stop(t + hd + 0.1);
      });
    }
  }

  applyFilter() {
    if (!this.ready) return;
    this.filter.frequency.setTargetAtTime(SYNTH.filterFreq, this.actx.currentTime, 0.015);
    this.filter.Q.setTargetAtTime(SYNTH.filterQ, this.actx.currentTime, 0.015);
  }

  _resume() {
    if (!this.ready) this._init();
    if (this.actx.state === 'suspended') this.actx.resume();
    this.kill.gain.cancelScheduledValues(this.actx.currentTime);
    this.kill.gain.setValueAtTime(1, this.actx.currentTime);
  }

  stopAll() {
    if (!this.ready) return;
    this.kill.gain.cancelScheduledValues(this.actx.currentTime);
    this.kill.gain.setValueAtTime(0, this.actx.currentTime);
  }

  playArpeggio(freqs, noteDur = 0.55, step = 0.17) {
    if (!this.enabled) return;
    this._resume();
    freqs.forEach((f, i) => this._playHz(f, i * step, noteDur));
  }

  playChord(freqs, duration = 3.5) {
    if (!this.enabled) return;
    this._resume();
    freqs.forEach((f, i) => this._playHz(f, i * 0.018, duration));
  }

  playSingle(freq, duration = 0.75) {
    if (!this.enabled) return;
    this._resume();
    this._playHz(freq, 0, duration);
  }
}

export const audio = new AudioEngine();
