// ═══════════════════════════════════════════════════════════════
// MINI GUITARE — children's guitar learning tool
// 4-string ukulele (GCEA standard tuning)
// ═══════════════════════════════════════════════════════════════

const NOTE_NAMES  = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_LABELS = ['Do','Do#','Ré','Ré#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];

// ─── TUNING DATA ─────────────────────────────────────────────
// Standard ukulele: G4-C4-E4-A4 (strings nearest face → away)
const STRINGS = [
  { id:0, name:'G', label:'Sol', freq:392.00, pegSide:'left',  display:'1ʳᵉ corde' },
  { id:1, name:'C', label:'Do',  freq:261.63, pegSide:'left',  display:'2ᵉ corde'  },
  { id:2, name:'E', label:'Mi',  freq:329.63, pegSide:'right', display:'3ᵉ corde'  },
  { id:3, name:'A', label:'La',  freq:440.00, pegSide:'right', display:'4ᵉ corde'  },
];

// ─── CHORD DATA ───────────────────────────────────────────────
// frets[s] = fret number for string s (G=0,C=1,E=2,A=3); 0=open
const CHORDS = {
  C:  { name:'Do',       color:'#5B9BD5', frets:[0,0,0,3], fingers:[0,0,0,3], rootFreq:261.63 },
  Am: { name:'La m.',    color:'#9B7ED9', frets:[2,0,0,0], fingers:[2,0,0,0], rootFreq:220.00 },
  F:  { name:'Fa',       color:'#F0854A', frets:[2,0,1,0], fingers:[2,0,1,0], rootFreq:174.61 },
  G7: { name:'Sol 7',    color:'#5CC877', frets:[0,2,1,2], fingers:[0,2,1,3], rootFreq:196.00 },
};

// ─── MELODY SEQUENCES ─────────────────────────────────────────
const FRERE_JACQUES = [
  { note:'C', label:'Do', freq:261.63 },
  { note:'D', label:'Ré', freq:293.66 },
  { note:'E', label:'Mi', freq:329.63 },
  { note:'C', label:'Do', freq:261.63 },
];

// ─── LESSON CONTENT ───────────────────────────────────────────
const LESSONS = [
  {
    id:1, icon:'🎸', color:'#5B9BD5', maxStars:1,
    title:'Ton premier accord',
    subtitle:"L'accord de Do",
    steps:[
      { type:'info',  text:"Un accord c'est quand tu joues<br>plusieurs cordes en même temps !" },
      { type:'chord', text:"Mets un doigt ici 👇", chord:'C' },
      { type:'strum', text:"Maintenant gratte toutes les cordes !", chord:'C' },
    ],
  },
  {
    id:2, icon:'🥁', color:'#F0854A', maxStars:2,
    title:'Le rythme',
    subtitle:'Gratte avec le battement',
    steps:[
      { type:'info', text:"La musique a un battement régulier.<br>Écoute, puis gratte avec moi !" },
      { type:'beat', text:"Gratte quand tu entends le battement !", bpm:58 },
    ],
  },
  {
    id:3, icon:'🎵', color:'#5CC877', maxStars:2,
    title:'Première mélodie',
    subtitle:'Une note à la fois',
    steps:[
      { type:'info',    text:"Une mélodie c'est des notes jouées<br>une par une. Essayons !" },
      { type:'note',    text:"Joue la <strong>2ᵉ corde à vide</strong> → Do", targetNote:'C', targetFreq:261.63 },
      { type:'note',    text:"Joue la <strong>1ʳᵉ corde à vide</strong> → Sol", targetNote:'G', targetFreq:392.00 },
      { type:'note',    text:"Joue la <strong>4ᵉ corde à vide</strong> → La",  targetNote:'A', targetFreq:440.00 },
    ],
  },
  {
    id:4, icon:'🌙', color:'#9B7ED9', maxStars:2,
    title:'Un nouvel accord',
    subtitle:'La mineur — ça sonne triste',
    steps:[
      { type:'chord', text:"Voici l'accord de La mineur.<br>Il sonne un peu triste...", chord:'Am' },
      { type:'strum', text:"Gratte-le !", chord:'Am' },
    ],
  },
  {
    id:5, icon:'🔄', color:'#E97A7A', maxStars:3,
    title:"On change d'accord !",
    subtitle:'Do puis La mineur',
    steps:[
      { type:'info',  text:"Super ! Tu connais 2 accords !<br>On va les alterner !" },
      { type:'strum', text:"D'abord : Do !", chord:'C' },
      { type:'strum', text:"Maintenant : La mineur !", chord:'Am' },
      { type:'strum', text:"Encore Do !", chord:'C' },
      { type:'strum', text:"Et La mineur ! Bravo !", chord:'Am' },
    ],
  },
  {
    id:6, icon:'🎶', color:'#F5C842', maxStars:3,
    title:'Frère Jacques',
    subtitle:'Ta première chanson !',
    steps:[
      { type:'info',   text:"On va jouer une vraie chanson :<br><strong>Frère Jacques</strong> !" },
      { type:'melody', text:"Joue ces 4 notes dans l'ordre !", notes:FRERE_JACQUES },
    ],
  },
  {
    id:7, icon:'🎤', color:'#F0854A', maxStars:2,
    title:"L'accord de Fa",
    subtitle:'Deux doigts !',
    steps:[
      { type:'chord', text:"Voici l'accord de Fa.<br>Deux doigts cette fois !", chord:'F' },
      { type:'strum', text:"Essaie de le gratter !", chord:'F' },
    ],
  },
  {
    id:8, icon:'🏆', color:'#F5C842', maxStars:3,
    title:'Ta première chanson',
    subtitle:'Do → La m → Fa → Sol7',
    steps:[
      { type:'info',  text:"Tu vas jouer 4 accords à la suite !<br>Tu es prêt(e) ?! 🎸" },
      { type:'strum', text:"Do !", chord:'C' },
      { type:'strum', text:"La mineur !", chord:'Am' },
      { type:'strum', text:"Fa !", chord:'F' },
      { type:'strum', text:"Sol 7 !", chord:'G7' },
      { type:'strum', text:"Et encore... Do !", chord:'C' },
    ],
  },
];

// ─── APP STATE ────────────────────────────────────────────────
const S = {
  screen:      'welcome',
  tuningStep:  0,
  tuningDone:  [false, false, false, false],
  lessonIndex: 0,
  stepIndex:   0,
  lessonStars: JSON.parse(localStorage.getItem('learner-stars') || '{}'),
};

function saveProgress() {
  localStorage.setItem('learner-stars', JSON.stringify(S.lessonStars));
}

// ─── DOM ──────────────────────────────────────────────────────
const appEl    = document.getElementById('app');
const fxCanvas = document.getElementById('fx');
const fxCtx    = fxCanvas.getContext('2d');

// ─── PARTICLES ───────────────────────────────────────────────
let _particles = [];
let _fxRaf = null;
const CONFETTI_COLORS = ['#F5C842','#5CC877','#5B9BD5','#F0854A','#E97A7A','#9B7ED9'];

function launchParticles() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (let i = 0; i < 70; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    _particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 7 + Math.random() * 10,
      alpha: 1,
      star: Math.random() > 0.5,
    });
  }
  if (!_fxRaf) _tickParticles();
}

function _tickParticles() {
  fxCanvas.width  = window.innerWidth;
  fxCanvas.height = window.innerHeight;
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  _particles = _particles.filter(p => p.alpha > 0.02);
  for (const p of _particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.alpha *= 0.96;
    fxCtx.save();
    fxCtx.globalAlpha = p.alpha;
    fxCtx.fillStyle = p.color;
    if (p.star) _drawStar(fxCtx, p.x, p.y, p.size * 0.4, p.size, 5);
    else { fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.size/2, 0, Math.PI*2); fxCtx.fill(); }
    fxCtx.restore();
  }
  _fxRaf = _particles.length > 0 ? requestAnimationFrame(_tickParticles) : null;
}

function _drawStar(ctx, cx, cy, ir, or, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? or : ir;
    const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
    else ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
  }
  ctx.closePath(); ctx.fill();
}

// ─── AUDIO PLAYBACK ──────────────────────────────────────────
let _playCtx = null;
function _ac() {
  if (!_playCtx || _playCtx.state === 'closed')
    _playCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_playCtx.state === 'suspended') _playCtx.resume();
  return _playCtx;
}

function playTone(freq, dur = 0.7, type = 'triangle') {
  const ctx = _ac();
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = type; osc.frequency.value = freq;
  g.gain.setValueAtTime(0.22, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + dur);
}

function playChordDemo(chordKey) {
  const chord = CHORDS[chordKey];
  STRINGS.forEach((str, i) => {
    const fret = chord.frets[i];
    if (fret < 0) return;
    const freq = str.freq * Math.pow(2, fret / 12);
    setTimeout(() => playTone(freq, 1.4, 'triangle'), i * 55);
  });
}

function playReward() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.35, 'sine'), i * 130));
}

function playClick() { playTone(900, 0.06, 'square'); }

function playMetronomeTick(accent = false) {
  playTone(accent ? 880 : 440, 0.08, 'square');
}

// ─── AUDIO DETECTION ─────────────────────────────────────────
let _detCtx = null, _detAnalyser = null, _detStream = null, _detRaf = null;
let _prevRMS = 0, _lastStrumMs = 0;
let _onStrum = null, _onNote = null;

const det = { freq:0, noteName:'', centsOff:0, rms:0 };

function _autocorr(buf, sr) {
  const SIZE = buf.length;
  const MAX_S = Math.floor(sr / 60);
  const MIN_S = Math.floor(sr / 1400);
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / SIZE) < 0.008) return -1;
  let best = -1, bestC = 0, lastC = 1, go = false;
  for (let off = MIN_S; off < MAX_S; off++) {
    let c = 0; const len = SIZE - MAX_S;
    for (let i = 0; i < len; i++) c += Math.abs(buf[i] - buf[i + off]);
    c = 1 - c / len;
    if (c > 0.9 && c > lastC) go = true;
    if (go && c < lastC) { if (c > bestC) { bestC = c; best = off - 1; } go = false; }
    lastC = c;
  }
  if (best === -1 || bestC < 0.9) return -1;
  const len = SIZE - MAX_S;
  let y1=0,y2=0,y3=0;
  for (let i = 0; i < len; i++) {
    y1 += Math.abs(buf[i]-buf[i+best-1]);
    y2 += Math.abs(buf[i]-buf[i+best]);
    y3 += Math.abs(buf[i]-buf[i+best+1]);
  }
  y1=1-y1/len; y2=1-y2/len; y3=1-y3/len;
  return sr / (best + (y3-y1)/(2*(2*y2-y1-y3)));
}

function _detLoop() {
  if (!_detAnalyser) return;
  const buf = new Float32Array(_detAnalyser.fftSize);
  _detAnalyser.getFloatTimeDomainData(buf);

  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i]*buf[i];
  rms = Math.sqrt(rms / buf.length);
  det.rms = rms;

  const now = Date.now();
  if ((rms - _prevRMS) > 0.055 && rms > 0.035 && _onStrum && (now - _lastStrumMs) > 600) {
    _lastStrumMs = now;
    _onStrum();
  }
  _prevRMS = rms;

  const freq = _autocorr(buf, _detCtx.sampleRate);
  if (freq > 0) {
    const midi    = 12 * Math.log2(freq / 440) + 69;
    const rounded = Math.round(midi);
    det.freq     = freq;
    det.centsOff = (midi - rounded) * 100;
    det.noteIndex = ((rounded % 12) + 12) % 12;
    det.noteName  = NOTE_NAMES[det.noteIndex];
    if (_onNote) _onNote(det.noteName, det.freq, det.centsOff);
  } else {
    det.freq = 0; det.noteName = ''; det.centsOff = 0;
    if (_onNote) _onNote('', 0, 0);
  }
  _detRaf = requestAnimationFrame(_detLoop);
}

async function startDetection() {
  if (_detCtx) return true;
  try {
    _detStream  = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
    _detCtx     = new (window.AudioContext || window.webkitAudioContext)();
    const src   = _detCtx.createMediaStreamSource(_detStream);
    _detAnalyser = _detCtx.createAnalyser();
    _detAnalyser.fftSize = 4096;
    src.connect(_detAnalyser);
    _detRaf = requestAnimationFrame(_detLoop);
    return true;
  } catch { return false; }
}

// ─── CANVAS DRAWING ──────────────────────────────────────────

function drawChordDiagram(canvas, chordKey) {
  const chord = CHORDS[chordKey];
  if (!chord) return;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const pX = 44, pY = 56;
  const nS = 4, nF = 5;
  const sS = (W - pX * 2) / (nS - 1);  // string spacing
  const fS = (H - pY * 2) / nF;         // fret spacing

  // Card bg
  ctx.fillStyle = '#FAFAFA';
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 16); ctx.fill();

  // Nut
  ctx.fillStyle = '#2D3436';
  ctx.fillRect(pX - 3, pY - 3, (nS-1)*sS + 6, 6);

  // Fret lines
  ctx.strokeStyle = '#D4D0C4'; ctx.lineWidth = 2;
  for (let f = 1; f <= nF; f++) {
    const y = pY + f * fS;
    ctx.beginPath(); ctx.moveTo(pX, y); ctx.lineTo(pX + (nS-1)*sS, y); ctx.stroke();
  }

  // String lines
  for (let s = 0; s < nS; s++) {
    ctx.strokeStyle = '#BDBDBD'; ctx.lineWidth = 1 + s * 0.35;
    const x = pX + s * sS;
    ctx.beginPath(); ctx.moveTo(x, pY); ctx.lineTo(x, pY + nF*fS); ctx.stroke();
  }

  // String labels at bottom
  const labels = ['G','C','E','A'];
  ctx.font = 'bold 12px Nunito, system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (let s = 0; s < nS; s++) {
    ctx.fillStyle = '#BDBDBD';
    ctx.fillText(labels[s], pX + s*sS, H - 6);
  }

  // Open/muted markers above nut
  for (let s = 0; s < nS; s++) {
    if (chord.frets[s] === 0) {
      ctx.fillStyle = '#9BA3AA';
      ctx.font = 'bold 14px Nunito, system-ui';
      ctx.fillText('○', pX + s*sS, pY - 10);
    }
  }

  // Finger dots
  ctx.textBaseline = 'middle';
  for (let s = 0; s < nS; s++) {
    const fret = chord.frets[s];
    if (fret <= 0) continue;
    const x = pX + s * sS;
    const y = pY + (fret - 0.5) * fS;
    ctx.fillStyle = chord.color;
    ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Nunito, system-ui';
    ctx.fillText(chord.fingers[s], x, y);
  }

  // Chord name
  ctx.fillStyle = chord.color;
  ctx.font = 'bold 15px Nunito, system-ui';
  ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(chord.name, W - 8, 22);
}

function drawTuningMeter(canvas, centsOff, targetLabel, inTune) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const mY = H * 0.72, mW = W * 0.72, mH = 18;

  // Big note name
  ctx.font = 'bold 64px Nunito, system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = inTune ? '#5CC877' : '#2D3436';
  ctx.fillText(targetLabel, cx, mY - 30);

  // Meter track
  ctx.fillStyle = '#EDEAE0';
  ctx.beginPath(); ctx.roundRect(cx - mW/2, mY - mH/2, mW, mH, 9); ctx.fill();

  // Green zone
  ctx.fillStyle = 'rgba(92,200,119,0.25)';
  ctx.fillRect(cx - mW*0.06, mY - mH/2, mW*0.12, mH);

  // Needle
  const clamp = Math.max(-50, Math.min(50, centsOff || 0));
  const nx = cx + (clamp / 50) * (mW / 2);
  const nc = inTune ? '#5CC877' : Math.abs(clamp) < 20 ? '#F5C842' : '#E97A7A';
  ctx.fillStyle = nc;
  ctx.beginPath(); ctx.roundRect(nx - 5, mY - mH/2 - 5, 10, mH + 10, 5); ctx.fill();

  // ♭ ♯ labels
  ctx.font = 'bold 16px Nunito, system-ui';
  ctx.fillStyle = '#BDBDBD';
  ctx.textAlign = 'left';  ctx.fillText('♭', cx - mW/2 - 18, mY + 5);
  ctx.textAlign = 'right'; ctx.fillText('♯', cx + mW/2 + 18, mY + 5);

  // Status
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 15px Nunito, system-ui';
  ctx.fillStyle = inTune ? '#5CC877' : '#BDBDBD';
  ctx.fillText(inTune ? '✓ En accord !' : (centsOff > 5 ? 'un peu trop aigu ↓' : centsOff < -5 ? 'un peu trop grave ↑' : 'Joue la corde…'), cx, mY + mH + 22);
}

function drawPegSchematic(canvas, stringIdx, centsOff) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H / 2;
  const hsW = 90, hsH = 110;
  const hsX = cx - hsW/2, hsY = cy - hsH/2;

  // Headstock body
  ctx.fillStyle = '#C8A96A';
  ctx.strokeStyle = '#9B7840'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(hsX, hsY, hsW, hsH, 10); ctx.fill(); ctx.stroke();

  // Neck stub
  ctx.fillStyle = '#C8A96A';
  ctx.fillRect(cx - 18, hsY + hsH, 36, 18);
  ctx.strokeStyle = '#9B7840'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx-18, hsY+hsH); ctx.lineTo(cx-18, hsY+hsH+18);
  ctx.moveTo(cx+18, hsY+hsH); ctx.lineTo(cx+18, hsY+hsH+18); ctx.stroke();

  // Peg positions (G top-left, C bot-left, E bot-right, A top-right)
  const pegs = [
    { x: hsX - 14, y: hsY + 22  }, // G
    { x: hsX - 14, y: hsY + hsH - 22 }, // C
    { x: hsX + hsW + 14, y: hsY + hsH - 22 }, // E
    { x: hsX + hsW + 14, y: hsY + 22 }, // A
  ];

  pegs.forEach((p, i) => {
    const active = i === stringIdx;
    // String line from headstock edge to peg
    ctx.strokeStyle = active ? '#5B9BD5' : '#BDBDBD'; ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    const edgeX = i < 2 ? hsX : hsX + hsW;
    ctx.moveTo(edgeX, p.y); ctx.lineTo(p.x, p.y); ctx.stroke();

    // Peg circle
    ctx.fillStyle   = active ? '#5B9BD5' : '#8B7355';
    ctx.strokeStyle = active ? '#3B7BB5' : '#6B5335'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    if (active) {
      // Rotation arrow showing which way makes it sharper
      // Left pegs: CCW = sharper; Right pegs: CW = sharper
      const leftPeg  = i < 2;
      const needSharp = centsOff < -5;
      const arrowCW  = leftPeg ? !needSharp : needSharp;

      ctx.strokeStyle = '#F5C842'; ctx.lineWidth = 3;
      const r = 19;
      const startA = arrowCW ? -Math.PI * 0.8 : Math.PI * 0.8;
      const endA   = arrowCW ?  Math.PI * 0.4 : Math.PI * 2.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, startA, endA, !arrowCW); ctx.stroke();

      // Arrowhead
      const headA  = arrowCW ? endA : endA;
      const tanA   = headA + (arrowCW ? Math.PI/2 : -Math.PI/2);
      const tipX   = p.x + Math.cos(headA)*r, tipY = p.y + Math.sin(headA)*r;
      ctx.fillStyle = '#F5C842';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX + Math.cos(tanA - 0.5)*8, tipY + Math.sin(tanA - 0.5)*8);
      ctx.lineTo(tipX + Math.cos(tanA + 0.5)*8, tipY + Math.sin(tanA + 0.5)*8);
      ctx.closePath(); ctx.fill();
    }
  });

  // String label
  const str = STRINGS[stringIdx];
  ctx.font = 'bold 13px Nunito, system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#5B9BD5';
  ctx.fillText(`${str.display} → ${str.label}`, cx, H - 6);
}

function drawSimpleFretboard(canvas) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const nS = 4, nF = 5, pX = 24, pY = 14;
  const sS = (W - pX*2)/(nS-1), fS = (H - pY*2)/nF;

  ctx.fillStyle = '#2D3436';
  ctx.fillRect(pX - 2, pY - 2, (nS-1)*sS+4, 5);

  for (let f = 1; f <= nF; f++) {
    ctx.fillStyle = '#9BA3AA';
    ctx.fillRect(pX - 2, pY + f*fS - 1, (nS-1)*sS+4, 3);
  }
  for (let s = 0; s < nS; s++) {
    ctx.strokeStyle = '#9BA3AA'; ctx.lineWidth = 1 + s*0.3;
    const x = pX + s*sS;
    ctx.beginPath(); ctx.moveTo(x, pY); ctx.lineTo(x, pY + nF*fS); ctx.stroke();
  }

  // Highlight fret 1 zone
  ctx.fillStyle = 'rgba(245,200,66,0.3)';
  ctx.fillRect(pX - 2, pY, (nS-1)*sS+4, fS);

  ctx.fillStyle = '#5B9BD5';
  ctx.beginPath(); ctx.arc(pX + sS, pY + fS*0.5, 10, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Nunito, system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('1', pX + sS, pY + fS*0.5);

  ctx.fillStyle = '#9BA3AA'; ctx.font = '11px Nunito, system-ui';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('← frette 1', pX + sS + 16, pY + fS*0.5);
}

// ─── NAVIGATION ───────────────────────────────────────────────
function goTo(screen, params = {}) {
  Object.assign(S, params);
  S.screen = screen;
  _onStrum = null; _onNote = null;
  if (_beatInterval) { clearInterval(_beatInterval); _beatInterval = null; }
  render();
}

function render() {
  ({
    welcome:       screenWelcome,
    instrument:    screenInstrument,
    string_count:  screenStringCount,
    tuning_intro:  screenTuningIntro,
    tuning:        screenTuning,
    fretboard_intro: screenFretboardIntro,
    lesson_map:    screenLessonMap,
    lesson:        screenLesson,
    reward:        screenReward,
  }[S.screen] || screenWelcome)();
}

// ─── SCREENS ──────────────────────────────────────────────────

function screenWelcome() {
  appEl.innerHTML = `
    <div class="screen">
      <div class="big-emoji">🎸</div>
      <div class="title" style="color:var(--blue)">Bonjour !</div>
      <div class="body-text">Tu vas apprendre<br>à jouer de la musique !</div>
      <button class="btn btn-primary" id="b-start">C'est parti ! →</button>
    </div>`;
  id('b-start').onclick = () => { playClick(); goTo('instrument'); };
}

function screenInstrument() {
  appEl.innerHTML = `
    <div class="screen">
      <div class="title">Quel instrument<br>as-tu ?</div>
      <div class="card-grid">
        <div class="card" id="inst-string"><div class="card-icon">🎸</div><div class="card-label">Cordes</div></div>
        <div class="card disabled"><div class="card-icon">🎺</div><div class="card-label">Vent<br><small style="font-size:11px;color:var(--muted)">bientôt</small></div></div>
        <div class="card disabled"><div class="card-icon">🥁</div><div class="card-label">Percussion<br><small style="font-size:11px;color:var(--muted)">bientôt</small></div></div>
        <div class="card disabled"><div class="card-icon">🎹</div><div class="card-label">Clavier<br><small style="font-size:11px;color:var(--muted)">bientôt</small></div></div>
      </div>
    </div>`;
  id('inst-string').onclick = () => { playClick(); goTo('string_count'); };
}

function screenStringCount() {
  appEl.innerHTML = `
    <div class="screen">
      <button class="back-btn" id="b-back">←</button>
      <div class="title">Combien de<br>cordes ?</div>
      <div class="card-grid">
        <div class="card" id="s4"><div class="card-icon">🎸</div><div class="card-label">4 cordes<br><small style="font-size:11px;color:var(--muted)">mini guitare</small></div></div>
        <div class="card disabled"><div class="card-icon">🎸</div><div class="card-label">6 cordes<br><small style="font-size:11px;color:var(--muted)">bientôt</small></div></div>
      </div>
    </div>`;
  id('b-back').onclick = () => { playClick(); goTo('instrument'); };
  id('s4').onclick = () => { playClick(); S.strings = 4; goTo('tuning_intro'); };
}

function screenTuningIntro() {
  appEl.innerHTML = `
    <div class="screen">
      <button class="back-btn" id="b-back">←</button>
      <div class="big-emoji" style="font-size:64px">🎵</div>
      <div class="title">Accordons<br>ta guitare !</div>
      <div class="body-text">Avant de jouer, chaque corde<br>doit sonner à la bonne hauteur.<br>J'ai besoin du micro pour t'aider !</div>
      <button class="btn btn-primary" id="b-go">Commençons !</button>
    </div>`;
  id('b-back').onclick = () => { playClick(); goTo('string_count'); };
  id('b-go').onclick = async () => {
    playClick();
    const ok = await startDetection();
    if (!ok) {
      appEl.querySelector('.body-text').innerHTML =
        "Autorise le micro dans ton navigateur<br>puis réessaie ! 🎤";
      return;
    }
    S.tuningStep = 0;
    S.tuningDone = [false, false, false, false];
    goTo('tuning');
  };
}

let _beatInterval = null;

function screenTuning() {
  const step   = S.tuningStep;
  const target = STRINGS[step];

  const circleHtml = STRINGS.map((s, i) => `
    <div class="string-item">
      <div class="string-circle ${i === step ? 'active' : S.tuningDone[i] ? 'done' : ''}">${S.tuningDone[i] ? '✓' : s.label}</div>
      <div class="string-label">Corde ${i+1}</div>
    </div>`).join('');

  appEl.innerHTML = `
    <div class="screen" style="gap:14px">
      <button class="back-btn" id="b-back">←</button>
      <div class="title" style="font-size:clamp(20px,5vw,28px)">Accorde la corde ${step+1}</div>
      <div class="string-list">${circleHtml}</div>
      <div style="display:flex;gap:10px;width:100%;max-width:340px">
        <div class="canvas-wrap" style="flex:1">
          <canvas id="meter-c" width="200" height="120"></canvas>
        </div>
        <div class="canvas-wrap" style="flex:1">
          <canvas id="peg-c" width="160" height="120"></canvas>
        </div>
      </div>
      <div id="t-status" class="tuning-status">🎤 Joue la corde…</div>
      <button class="btn btn-ghost" id="b-skip" style="font-size:15px;padding:12px 20px;max-width:220px">Passer →</button>
    </div>`;

  id('b-back').onclick = () => { playClick(); goTo('tuning_intro'); };
  id('b-skip').onclick = () => { playClick(); _advanceTuning(); };

  const meterC  = id('meter-c');
  const pegC    = id('peg-c');
  let inTuneCount = 0;

  drawTuningMeter(meterC, 0, target.label, false);
  drawPegSchematic(pegC, step, 0);

  _onNote = (noteName, freq, centsOff) => {
    const inTune = noteName === target.name && Math.abs(centsOff) < 12;
    drawTuningMeter(meterC, centsOff, target.label, inTune);
    drawPegSchematic(pegC, step, centsOff);

    const statusEl = id('t-status');
    if (inTune) {
      inTuneCount++;
      if (statusEl) { statusEl.className = 'tuning-status good'; statusEl.textContent = '✓ En accord !'; }
      if (inTuneCount > 20) { inTuneCount = 0; _advanceTuning(); }
    } else {
      inTuneCount = 0;
      if (statusEl) {
        statusEl.className = `tuning-status${Math.abs(centsOff) < 25 ? ' close' : ''}`;
        statusEl.textContent = noteName
          ? (centsOff > 5 ? '↓ Un peu trop aigu' : centsOff < -5 ? '↑ Un peu trop grave' : `J'entends ${NOTE_LABELS[NOTE_NAMES.indexOf(noteName)]}…`)
          : '🎤 Joue la corde…';
      }
    }
  };
}

function _advanceTuning() {
  _onNote = null;
  playTone(STRINGS[S.tuningStep].freq, 0.5);
  S.tuningDone[S.tuningStep] = true;
  if (S.tuningStep < 3) { S.tuningStep++; goTo('tuning'); }
  else { launchParticles(); playReward(); goTo('fretboard_intro'); }
}

function screenFretboardIntro() {
  appEl.innerHTML = `
    <div class="screen">
      <div class="big-emoji" style="font-size:64px;animation:none">👏</div>
      <div class="title" style="color:var(--green)">Bravo !</div>
      <div class="body-text">Ta guitare est accordée !<br>Regardons comment<br>elle fonctionne.</div>
      <div style="background:#fff;border-radius:16px;padding:14px 16px;width:100%;max-width:340px;border:3px solid var(--border)">
        <canvas id="fb-c" width="300" height="100"></canvas>
      </div>
      <div class="body-text" style="font-size:clamp(14px,3.8vw,19px)">
        Les barres métalliques s'appellent des <strong>frettes</strong>.<br>
        Tu poses tes doigts entre les frettes !
      </div>
      <button class="btn btn-primary" id="b-next">Compris ! →</button>
    </div>`;
  drawSimpleFretboard(id('fb-c'));
  id('b-next').onclick = () => { playClick(); goTo('lesson_map'); };
}

function screenLessonMap() {
  _onStrum = null; _onNote = null;
  const items = LESSONS.map((l, i) => {
    const stars  = S.lessonStars[l.id] || 0;
    const unlock = i === 0 || (S.lessonStars[LESSONS[i-1].id] > 0);
    const done   = stars > 0;
    const cls    = done ? 'done' : unlock ? 'active' : 'locked';
    const starStr = '⭐'.repeat(stars) + '☆'.repeat(l.maxStars - stars);
    return `<div class="lesson-card ${cls}" data-i="${i}">
      <div class="lesson-icon">${l.icon}</div>
      <div class="lesson-info"><div class="lesson-name">${l.title}</div><div class="lesson-sub">${l.subtitle}</div></div>
      <div class="lesson-stars">${starStr}</div>
    </div>`;
  }).join('');

  appEl.innerHTML = `
    <div class="screen" style="justify-content:flex-start;padding-top:20px">
      <div class="title" style="font-size:clamp(20px,5vw,30px)">Tes leçons 🎵</div>
      <div class="lesson-map" style="flex:1;overflow-y:auto;width:100%;max-width:420px;padding:6px 4px 20px">${items}</div>
    </div>`;

  appEl.querySelectorAll('.lesson-card:not(.locked)').forEach(el => {
    el.onclick = () => {
      playClick();
      S.lessonIndex = parseInt(el.dataset.i);
      S.stepIndex = 0;
      goTo('lesson');
    };
  });
}

function screenLesson() {
  _onStrum = null; _onNote = null;
  if (_beatInterval) { clearInterval(_beatInterval); _beatInterval = null; }

  const lesson = LESSONS[S.lessonIndex];
  const step   = lesson.steps[S.stepIndex];

  const dots = lesson.steps.map((_, i) =>
    `<div class="step-dot ${i < S.stepIndex ? 'done' : i === S.stepIndex ? 'active' : ''}"></div>`).join('');

  let content = '';
  if (step.type === 'info') {
    content = `
      <div class="big-emoji" style="font-size:64px">${lesson.icon}</div>
      <div class="body-text">${step.text}</div>
      <button class="btn btn-primary" id="b-ok">J'ai compris ! →</button>`;
  } else if (step.type === 'chord') {
    content = `
      <div class="body-text" style="font-size:clamp(15px,4vw,19px)">${step.text}</div>
      <div class="canvas-wrap"><canvas id="ch-c" width="260" height="240"></canvas></div>
      <button class="btn btn-primary" id="b-ok">C'est fait ! →</button>
      <button class="btn btn-ghost" id="b-demo" style="font-size:14px;padding:10px 18px;max-width:200px">🔊 Écouter l'accord</button>`;
  } else if (step.type === 'strum') {
    content = `
      <div class="body-text" style="font-size:clamp(15px,4vw,19px)">${step.text}</div>
      <div class="canvas-wrap"><canvas id="ch-c" width="260" height="240"></canvas></div>
      <div class="detect-ring listening" id="dr">🎸</div>
      <div id="st" class="body-text" style="font-size:16px;color:var(--muted)">Gratte les cordes !</div>
      <button class="btn btn-ghost" id="b-demo" style="font-size:14px;padding:10px 18px;max-width:200px">🔊 Écouter l'accord</button>`;
  } else if (step.type === 'note') {
    content = `
      <div class="body-text">${step.text}</div>
      <div class="detect-ring listening" id="dr">🎵</div>
      <div id="st" class="body-text" style="font-size:16px;color:var(--muted)">Joue la note…</div>
      <button class="btn btn-ghost" id="b-demo" style="font-size:14px;padding:10px 18px;max-width:200px">🔊 Écouter la note</button>`;
  } else if (step.type === 'beat') {
    content = `
      <div class="body-text">${step.text}</div>
      <div class="detect-ring listening" id="dr" style="font-size:52px;transition:transform 0.1s">🥁</div>
      <div id="st" class="body-text" style="font-size:16px;color:var(--muted)">Prêt(e) ? Ça commence dans…</div>`;
  } else if (step.type === 'melody') {
    content = `
      <div class="body-text" style="font-size:clamp(15px,4vw,19px)">${step.text}</div>
      <div id="mel-notes" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;width:100%;max-width:320px"></div>
      <div class="detect-ring listening" id="dr">🎵</div>
      <div id="st" class="body-text" style="font-size:16px;color:var(--muted)">Joue la première note…</div>
      <button class="btn btn-ghost" id="b-demo" style="font-size:14px;padding:10px 18px;max-width:200px">🔊 Écouter la mélodie</button>`;
  }

  appEl.innerHTML = `
    <div class="screen" style="gap:14px;padding-top:62px">
      <button class="back-btn" id="b-back">←</button>
      <div class="title" style="font-size:clamp(17px,4.5vw,26px);color:${lesson.color}">${lesson.title}</div>
      <div class="step-dots">${dots}</div>
      ${content}
    </div>`;

  id('b-back').onclick = () => { playClick(); goTo('lesson_map'); };

  // Chord canvas
  const chCanvas = id('ch-c');
  if (chCanvas && step.chord) drawChordDiagram(chCanvas, step.chord);

  // Demo button
  const dBtn = id('b-demo');
  if (dBtn) {
    if (step.chord) dBtn.onclick = () => playChordDemo(step.chord);
    else if (step.targetFreq) dBtn.onclick = () => playTone(step.targetFreq, 1.0, 'triangle');
    else if (step.notes) dBtn.onclick = () => step.notes.forEach((n, i) => setTimeout(() => playTone(n.freq, 0.45), i * 550));
  }

  // Info / chord next button
  const okBtn = id('b-ok');
  if (okBtn) okBtn.onclick = () => { playClick(); _advanceStep(); };

  // ── STRUM DETECTION
  if (step.type === 'strum') {
    _onStrum = () => {
      const dr = id('dr'), st = id('st');
      if (dr) { dr.className = 'detect-ring success'; dr.textContent = '✓'; setTimeout(() => { const d2 = id('dr'); if(d2){d2.className='detect-ring listening';d2.textContent='🎸';} }, 700); }
      if (st) st.textContent = '✓ Bien joué !';
      _onStrum = null;
      setTimeout(() => _advanceStep(), 900);
    };
  }

  // ── NOTE DETECTION
  if (step.type === 'note') {
    let goodFrames = 0;
    _onNote = (noteName, freq, centsOff) => {
      const dr = id('dr'), st = id('st');
      if (noteName === step.targetNote && Math.abs(centsOff) < 30) {
        goodFrames++;
        if (dr) dr.className = 'detect-ring success';
        if (st) { st.textContent = `✓ ${NOTE_LABELS[NOTE_NAMES.indexOf(noteName)]} !`; st.style.color = 'var(--green)'; }
        if (goodFrames > 10) { _onNote = null; setTimeout(() => _advanceStep(), 700); }
      } else {
        goodFrames = 0;
        if (dr) dr.className = 'detect-ring listening';
        if (st) {
          st.style.color = 'var(--muted)';
          st.textContent = noteName ? `J'entends ${NOTE_LABELS[NOTE_NAMES.indexOf(noteName)] || noteName}…` : 'Joue la note…';
        }
      }
    };
  }

  // ── BEAT / RHYTHM DETECTION
  if (step.type === 'beat') {
    let count = 0;
    const total = 4;
    const bpm = step.bpm || 60;
    const ms  = (60 / bpm) * 1000;

    _onStrum = () => {
      const dr = id('dr');
      if (dr) { dr.className = 'detect-ring success'; setTimeout(() => { const d = id('dr'); if(d) d.className='detect-ring listening'; }, 200); }
    };

    const startBeat = () => {
      _beatInterval = setInterval(() => {
        count++;
        const accent = count % 4 === 1;
        playMetronomeTick(accent);
        const dr = id('dr'), st = id('st');
        if (dr) { dr.style.transform = 'scale(1.2)'; setTimeout(() => { const d=id('dr'); if(d) d.style.transform='scale(1)'; }, 100); }
        if (st) st.textContent = `Gratte ! (${count}/${total})`;
        if (count >= total) { clearInterval(_beatInterval); _beatInterval = null; _onStrum = null; setTimeout(() => _advanceStep(), 600); }
      }, ms);
    };

    const st = id('st');
    let countdown = 3;
    if (st) st.textContent = `3…`;
    const tick = setInterval(() => {
      countdown--;
      const s = id('st');
      if (s) s.textContent = countdown > 0 ? `${countdown}…` : 'Go !';
      if (countdown <= 0) { clearInterval(tick); startBeat(); }
    }, 900);
  }

  // ── MELODY SEQUENCE DETECTION
  if (step.type === 'melody') {
    const notes = step.notes;
    let seqIdx = 0, goodFrames = 0;

    const notesEl = id('mel-notes');
    if (notesEl) {
      notesEl.innerHTML = notes.map((n, i) => `
        <div id="mn-${i}" style="
          width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          font-weight:900;font-size:17px;transition:all 0.3s;
          background:${i===0?'var(--blue)':'var(--border)'};color:${i===0?'#fff':'var(--text)'};
        ">${n.label}</div>`).join('');
    }

    _onNote = (noteName, freq, centsOff) => {
      if (seqIdx >= notes.length) return;
      const target = notes[seqIdx];
      const dr = id('dr'), st = id('st');
      if (noteName === target.note && Math.abs(centsOff) < 35) {
        goodFrames++;
        if (dr) dr.className = 'detect-ring success';
        if (st) { st.textContent = `✓ ${target.label} !`; st.style.color = 'var(--green)'; }
        if (goodFrames > 7) {
          goodFrames = 0;
          const mn = id(`mn-${seqIdx}`);
          if (mn) { mn.style.background = 'var(--green)'; mn.style.color = '#fff'; }
          seqIdx++;
          if (seqIdx >= notes.length) { _onNote = null; setTimeout(() => _advanceStep(), 800); }
          else {
            const next = id(`mn-${seqIdx}`);
            if (next) { next.style.background = 'var(--blue)'; next.style.color = '#fff'; }
            if (st) st.textContent = `Maintenant : ${notes[seqIdx].label} !`;
          }
        }
      } else {
        goodFrames = 0;
        if (dr) dr.className = 'detect-ring listening';
        if (st) { st.style.color = 'var(--muted)'; st.textContent = noteName ? `J'entends ${NOTE_LABELS[NOTE_NAMES.indexOf(noteName)] || noteName}…` : `Joue : ${target.label} !`; }
      }
    };

    // Play reference
    notes.forEach((n, i) => setTimeout(() => playTone(n.freq, 0.4, 'triangle'), i * 550));
  }
}

function _advanceStep() {
  const lesson = LESSONS[S.lessonIndex];
  if (S.stepIndex + 1 < lesson.steps.length) {
    S.stepIndex++;
    render();
  } else {
    S.lessonStars[lesson.id] = lesson.maxStars;
    saveProgress();
    launchParticles();
    playReward();
    goTo('reward');
  }
}

function screenReward() {
  const lesson = LESSONS[S.lessonIndex];
  const stars  = S.lessonStars[lesson.id] || 0;
  const isLast = S.lessonIndex >= LESSONS.length - 1;
  const starHtml = Array.from({length: lesson.maxStars}, (_, i) =>
    `<span class="star" id="star-${i}">⭐</span>`).join('');

  appEl.innerHTML = `
    <div class="screen" style="gap:20px">
      <div class="reward-badge">🎉</div>
      <div class="title" style="color:var(--yellow)">Bravo !!!</div>
      <div class="body-text">${lesson.title} terminée !</div>
      <div class="stars">${starHtml}</div>
      ${!isLast
        ? `<button class="btn btn-success" id="b-next">Prochaine leçon →</button>`
        : `<div class="body-text" style="color:var(--green)">🏆 Tu as tout terminé !<br>Tu es un(e) vrai(e) musicien(ne) !</div>`}
      <button class="btn btn-ghost" id="b-map">Voir les leçons</button>
    </div>`;

  // Animate stars in one by one
  for (let i = 0; i < stars; i++) {
    setTimeout(() => {
      const el = id(`star-${i}`);
      if (el) el.classList.add('earned');
    }, i * 350 + 300);
  }

  if (!isLast) {
    id('b-next').onclick = () => { playClick(); S.lessonIndex++; S.stepIndex = 0; goTo('lesson'); };
  }
  id('b-map').onclick = () => { playClick(); goTo('lesson_map'); };
}

// ─── HELPERS ──────────────────────────────────────────────────
function id(s) { return document.getElementById(s); }

// ─── INIT ─────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  fxCanvas.width  = window.innerWidth;
  fxCanvas.height = window.innerHeight;
});
fxCanvas.width  = window.innerWidth;
fxCanvas.height = window.innerHeight;

render();
