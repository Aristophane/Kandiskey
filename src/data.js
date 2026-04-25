// ═══════════════════════════════════════════════════════════════════
// DATA — pure constants, no side-effects
// ═══════════════════════════════════════════════════════════════════

export const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export const TEMPERAMENTS = {
  equal: {
    name: 'Equal (12-TET)',
    cents: [0,100,200,300,400,500,600,700,800,900,1000,1100],
    ratios: ['1','2^¹⁄₁₂','2^²⁄₁₂','2^³⁄₁₂','2^⁴⁄₁₂','2^⁵⁄₁₂','2^⁶⁄₁₂','2^⁷⁄₁₂','2^⁸⁄₁₂','2^⁹⁄₁₂','2^¹⁰⁄₁₂','2^¹¹⁄₁₂'],
    desc: 'All semitones exactly 100¢. Free transposition. Standard for guitar.'
  },
  just: {
    name: 'Just Intonation (5-limit)',
    cents: [0,111.73,203.91,315.64,386.31,498.04,590.22,701.96,813.69,884.36,1017.60,1088.27],
    ratios: ['1/1','16/15','9/8','6/5','5/4','4/3','45/32','3/2','8/5','5/3','9/5','15/8'],
    desc: 'Pure integer ratios. Beatless consonances. Hear the difference in chords!'
  },
  pythagorean: {
    name: 'Pythagorean',
    cents: [0,113.69,203.91,294.13,407.82,498.04,611.73,701.96,815.64,905.87,996.09,1109.78],
    ratios: ['1/1','2187/2048','9/8','32/27','81/64','4/3','729/512','3/2','6561/4096','27/16','16/9','243/128'],
    desc: 'Built from stacked pure 5ths (3/2). Pure P4/P5, wider major thirds.'
  },
  meantone: {
    name: 'Quarter-comma Meantone',
    cents: [0,76.05,193.16,310.26,386.31,503.42,579.47,696.58,772.63,889.74,1006.84,1082.89],
    ratios: ['1/1','≈76¢','≈193¢','≈310¢','5/4','≈503¢','≈579¢','≈697¢','≈773¢','≈890¢','≈1007¢','≈1083¢'],
    desc: 'Pure major thirds (5/4), slightly flat 5ths. Renaissance standard tuning.'
  },
  werckmeister: {
    name: 'Werckmeister III',
    cents: [0,90.22,192.18,294.13,390.22,498.04,588.27,696.09,792.18,888.27,996.09,1092.18],
    ratios: ['1/1','≈90¢','≈192¢','≈294¢','≈390¢','4/3','≈588¢','≈696¢','≈792¢','≈888¢','16/9','≈1092¢'],
    desc: 'Bach\'s preferred well-temperament. Every key has its own character.'
  }
};

export const DEGREE_NAMES = ['P1','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7'];

export const SCALE_FAMILIES = {
  western: { name: 'Western Modes', scales: {
    'Major (Ionian)':          [0,2,4,5,7,9,11],
    'Dorian':                  [0,2,3,5,7,9,10],
    'Phrygian':                [0,1,3,5,7,8,10],
    'Lydian':                  [0,2,4,6,7,9,11],
    'Mixolydian':              [0,2,4,5,7,9,10],
    'Natural Minor (Aeolian)': [0,2,3,5,7,8,10],
    'Locrian':                 [0,1,3,5,6,8,10],
    'Harmonic Minor':          [0,2,3,5,7,8,11],
    'Locrian #6':              [0,1,3,5,6,9,10],
    'Ionian #5':               [0,2,4,5,8,9,11],
    'Dorian #4':               [0,2,3,6,7,9,10],
    'Lydian #2':               [0,3,4,6,7,9,11],
    'Melodic Minor (asc)':     [0,2,3,5,7,9,11],
    'Dorian b2':               [0,1,3,5,7,9,10],
    'Lydian Augmented':        [0,2,4,6,8,9,11],
    'Acoustic':                [0,2,4,6,7,9,10],
    'Mixolydian b6':           [0,2,4,5,7,8,10],
    'Locrian #2':              [0,2,3,5,6,8,10],
    'Altered':                 [0,1,3,4,6,8,10],
    'Neapolitan Major':        [0,1,3,5,7,9,11],
    'Neapolitan Minor':        [0,1,3,5,7,8,11],
    'Whole Tone':              [0,2,4,6,8,10],
    'Octatonic (H-W)':         [0,1,3,4,6,7,9,10],
    'Octatonic (W-H)':         [0,2,3,5,6,8,9,11],
    'Chromatic':               [0,1,2,3,4,5,6,7,8,9,10,11],
  }},
  pentatonic: { name: 'Pentatonic & Blues', scales: {
    'Major Pentatonic':        [0,2,4,7,9],
    'Minor Pentatonic':        [0,3,5,7,10],
    'Man Gong':                [0,3,5,8,10],
    'Blues (6-note)':          [0,3,5,6,7,10],
    'Egyptian':                [0,2,5,7,10],
    'Hirajoshi':               [0,2,3,7,8],
    'Iwato':                   [0,1,5,6,10],
    'In':                      [0,1,5,7,8],
    'Yo':                      [0,2,5,7,9],
    'Kumoi':                   [0,2,3,7,9],
    'Dominant Pentatonic':     [0,2,4,7,10],
    'Insen':                   [0,1,5,7,10],
  }},
  arabic: { name: 'Arabic Maqamat', scales: {
    'Ajam':              [0,2,4,5,7,9,11],
    'Shawq Afza':        [0,2,4,5,7,8,11],
    'Suznak':            [0,2,4,5,7,8,11],
    'Rast':              [0,2,4,5,7,9,10],
    'Sikah':             [0,2,3,5,7,9,10],
    'Husseini':          [0,2,3,5,7,8,10],
    'Bayati':            [0,1,3,5,7,8,10],
    'Kurd':              [0,1,3,5,7,8,10],
    'Bayati Shuri':      [0,1,3,5,6,8,10],
    'Hijaz':             [0,1,4,5,7,8,10],
    'Hijaz Kar':         [0,1,4,5,7,8,11],
    'Athar Kurd':        [0,1,3,6,7,8,11],
    'Nahawand':          [0,2,3,5,7,8,11],
    'Nahawand Murassah': [0,2,3,6,7,8,11],
    'Farahfaza':         [0,2,3,5,7,8,10],
    'Saba':              [0,1,3,4,5,6,10],
    'Saba Zemzem':       [0,1,3,4,5,8,10],
    'Nawa Athar':        [0,2,3,6,7,8,11],
    'Nikriz':            [0,2,3,6,7,9,10],
    'Chahargah':         [0,2,3,6,7,8,11],
    'Iraq':              [0,2,3,5,7,8,10],
  }},
  indian: { name: 'Indian Ragas', scales: {
    'Bilawal (Major)':         [0,2,4,5,7,9,11],
    'Yaman / Kalyan':          [0,2,4,6,7,9,11],
    'Khamaj':                  [0,2,4,5,7,9,10],
    'Kafi':                    [0,2,3,5,7,9,10],
    'Asavari':                 [0,2,3,5,7,8,10],
    'Bhairavi':                [0,1,3,5,7,8,10],
    'Bhairav':                 [0,1,4,5,7,8,11],
    'Purvi':                   [0,1,4,6,7,8,11],
    'Marwa (no Pa)':           [0,1,4,6,9,11],
    'Todi':                    [0,1,3,6,7,8,11],
    'Darbari Kanada':          [0,2,3,5,7,8,10],
    'Bhupali':                 [0,2,4,7,9],
    'Bageshree':               [0,2,3,5,7,8,10],
    'Shanmukhapriya':          [0,2,3,6,7,8,10],
  }},
  none: { name: '— None —', scales: {
    '— None —': []
  }}
};

// Authentic quarter-tone cent values for Arabic maqamat with neutral intervals.
// Scales not listed use all-semitone intervals → 12-TET is exact.
export const MAQAM_CENTS = {
  'Rast':           [0, 200, 350, 500, 700, 900, 1050],
  'Sikah':          [0, 200, 350, 500, 700, 900, 1050],
  'Suznak':         [0, 200, 350, 500, 700, 800, 1100],
  'Husseini':       [0, 150, 300, 500, 700, 800, 1050],
  'Bayati':         [0, 150, 300, 500, 700, 800, 1000],
  'Kurd':           [0, 100, 300, 500, 700, 800, 1000],
  'Bayati Shuri':   [0, 150, 300, 500, 600, 800, 1000],
  'Saba':           [0, 150, 300, 400, 500, 600, 1000],
  'Saba Zemzem':    [0, 150, 300, 400, 500, 800, 1000],
  'Iraq':           [0, 150, 300, 500, 700, 850, 1050],
};

export function neutralDegrees(scaleName) {
  const cents = MAQAM_CENTS[scaleName];
  if (!cents) return new Set();
  const neutral = new Set();
  cents.forEach((c, i) => {
    const nearest = Math.round(c / 100) * 100;
    if (Math.abs(c - nearest) > 25) neutral.add(i);
  });
  return neutral;
}

export const CHORDS = {
  '— None —':       null,
  'Major':          [0,4,7],
  'Minor':          [0,3,7],
  'Diminished':     [0,3,6],
  'Augmented':      [0,4,8],
  'Sus2':           [0,2,7],
  'Sus4':           [0,5,7],
  'Major 7th':      [0,4,7,11],
  'Minor 7th':      [0,3,7,10],
  'Dominant 7th':   [0,4,7,10],
  'Diminished 7th': [0,3,6,9],
  'Half-dim (ø7)':  [0,3,6,10],
  'Min/Maj 7th':    [0,3,7,11],
  'Power (5th)':    [0,7],
  'Add9':           [0,4,7,14],
  'Major 6th':      [0,4,7,9],
  'Minor 6th':      [0,3,7,9],
};

export const GUITAR_TUNINGS = {
  'Standard (EADGBE)': [40,45,50,55,59,64],
  'Drop D (DADGBE)':   [38,45,50,55,59,64],
  'Open G (DGDGBD)':   [38,45,50,55,59,62],
  'Open D (DADF#AD)':  [38,45,50,54,57,62],
  'Open E (EBEG#BE)':  [40,47,52,56,59,64],
  'DADGAD':            [38,45,50,55,57,62],
  'Open C (CGCGCE)':   [36,43,48,55,60,64],
};

export const FIFTHS_ORDER = [0,7,2,9,4,11,6,1,8,3,10,5];

export const PRESETS = {
  piano: {
    waveform: 'sine',
    attack: 0.008, decay: 0.30, sustain: 0.62, detune: 0, numHarmonics: 6,
    filterFreq: 4000, filterQ: 1.0,
    vibratoRate: 5.5, vibratoDepth: 0,
    harmonics: [[1,1.0,1.0],[2,0.44,0.72],[3,0.22,0.50],[4,0.11,0.35],[5,0.055,0.22],[6,0.022,0.14],[7,0.011,0.1],[8,0.006,0.07]],
  },
  cello: {
    waveform: 'sine',
    attack: 0.13, decay: 2.8, sustain: 0.75, detune: 0, numHarmonics: 6,
    filterFreq: 1300, filterQ: 1.6,
    vibratoRate: 5.2, vibratoDepth: 22,
    harmonics: [[1,1.0,1.0],[2,0.58,0.92],[3,0.40,0.78],[4,0.26,0.63],[5,0.18,0.49],[6,0.13,0.36],[7,0.011,0.1],[8,0.006,0.07]],
  },
};

export const RHYTHMS = {
  '8 steps':      { steps:  8, spb: 2 },
  '16 steps':     { steps: 16, spb: 4 },
  '32 steps':     { steps: 32, spb: 4 },
  'Triplets 12':  { steps: 12, spb: 3 },
  'Triplets 24':  { steps: 24, spb: 6 },
  '5/4 (20)':     { steps: 20, spb: 5 },
  '7/8 (14)':     { steps: 14, spb: 3.5 },
};
