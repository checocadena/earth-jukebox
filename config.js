// Earth Jukebox: every sound and picture setting lives in this file.
//
// The sound is an audification. One data event (one lightning flash) is one
// click, and time is played back faster than it happened. Nothing is mapped to
// notes or scales. Values marked PLACEHOLDER are working defaults that Checo
// has not chosen yet.

export default {
  // ---- Time --------------------------------------------------------------
  // Speed is days of data per second of sound.
  speed: {
    start: 23,          // PLACEHOLDER. 23 days/s plays 2017 to 2023 in about 100 s, like the NASA animation.
    min: 0.05,          // about one click a second: single flashes
    max: 200000,        // a year lasts 1.8 ms: the seasons become a 548 Hz tone
  },
  loop: {
    enabled: true,
    // Above this speed the loop covers whole years only, so the loop point
    // does not add a buzz of its own to the tone.
    wholeYearsAboveSpeed: 365,
  },

  // ---- Sound -------------------------------------------------------------
  // PLACEHOLDER levels (0 to 1, where 1 is full scale).
  //   click  peak of one flash heard alone
  //   hiss   loudness (RMS) once flashes are too dense to tell apart
  //   tone   loudness (RMS) of the seasonal waveform at the highest speeds
  // hissInTone keeps a little of the hiss under the tone, as the data has it.
  level: { click: 0.6, hiss: 0.07, tone: 0.16, hissInTone: true },
  // PLACEHOLDER click colour. A flash is a single-sample click through a
  // low-pass filter. 20000 = raw click, thin and bright. 1500 = a soft thud.
  click: { lowpassHz: 5000 },
  highpassHz: 20,       // removes the inaudible slow offset
  master: 0.9,
  // Above this many events per sample the engine reads the per-frame rate
  // curve and stops adding single clicks (same signal, far less work).
  curveAboveEventsPerSample: 6,

  // PLACEHOLDER: off. The chord. Lightning makes the space between the ground
  // and the upper atmosphere resonate at 7.83, 14.3, 20.8, 27.3 and 33.8 Hz
  // (the Schumann resonances). Moved up `octavesUp` octaves these are five
  // audible pitches, and every click strikes all five.
  //   mix           0 = clicks only. The Chord button switches to `onMix`.
  //   onMix         1 = chord only, lower leaves some of the click in.
  //   decaySeconds  how long a struck pitch rings. Long = smooth held tones.
  //                 Short (0.02) = closer to the real, dull resonance, and buzzy.
  // Try from the address bar: ?chord=1  or  ?chord=0.7&decay=1.5&octaves=6
  ring: { mix: 0, onMix: 0.9, octavesUp: 5, modesHz: [7.83, 14.3, 20.8, 27.3, 33.8], decaySeconds: 0.8 },

  // PLACEHOLDER: no effects. Checo is undecided. 0 = off, 1 = fully wet.
  // Try them from the address bar: ?reverb=0.3&delay=0.2  (also ?click=1500 for click colour)
  effects: { reverb: 0, reverbSeconds: 3.5, delay: 0, delaySeconds: 0.36, delayFeedback: 0.35 },

  // ---- Map worlds (maps without events, such as night lights) -----------
  // PLACEHOLDER mapping. Each line of latitude is a voice. A read head runs
  // along every line at the same ground speed, and what it passes over on the
  // side of the Earth facing you is that voice's waveform. Lines nearer the
  // poles are shorter circles, so the head gets round them sooner and they
  // sound higher: pitch = equator pitch / cos(latitude). That makes 36.87
  // degrees a major third above the equator, 48.19 a fifth and 60 an octave.
  // Nobody chose those intervals; they are the shape of the planet. Which
  // lines sound is the choice: these give a five-note scale with no clashes.
  scan: {
    startHz: 110, minHz: 40, maxHz: 440,                     // pitch of the equator line
    linesDegrees: [60, 53.13, 48.19, 36.87, 27.27, 0, -27.27, -36.87],
    bandDegrees: 1.5,         // each line is this many degrees wide on each side
    level: 0.3,               // loudness (RMS) of the busiest line with its busiest side facing you
    backLevel: 0.1,           // how loud the far side of the Earth is (0 = silent, 1 = same as the near side)
    harmonics: 24,            // tone colour: how much fine detail of the map is kept in the wave
    stepsPerSecond: 0.25,     // how fast the years (or months) pass while playing
    crossfadeSeconds: 0.2,
  },

  // ---- The Earth turns ---------------------------------------------------
  // PLACEHOLDER. While playing, the globe turns by itself and you hear what
  // comes round. Dragging or the arrow keys still turn it by hand.
  spin: { secondsPerTurn: 48, holdAfterTouchSeconds: 2.5 },

  // ---- Listening position -----------------------------------------------
  // You hear the half of the Earth that faces you. Left of the globe is the
  // left ear. `falloff` fades flashes near the edge (0 = no fade).
  view: { lon: 10, lat: 10, falloff: 1, stepDegrees: 15 },

  // ---- Picture -----------------------------------------------------------
  // PLACEHOLDER look. `yellow` follows NASA's own frames: grey Earth, yellow
  // flashes. `green` is the oscilloscope look of checocadena.com.
  // Try from the address bar: ?look=green
  look: 'yellow',
  looks: {
    //        coast and rim        its glow                 flashes, rim line     their glow             text       sliders, focus
    yellow: { line: '208,214,224', lineGlow: '120,140,175', data: '255,232,120', dataGlow: '255,190,0', ink: '#eef1f5', accent: '#ffd84a' },
    green:  { line: '225,255,236', lineGlow: '80,255,150',  data: '225,255,236', dataGlow: '80,255,150', ink: '#e1ffec', accent: '#e1ffec' },
  },
  scope: {
    persistence: 0.1,          // how fast a flash fades (higher = shorter afterglow)
    markHalfLifeDays: 12,      // a flash leaves a mark that halves after this many days of data
    markHalfLifePausedSeconds: 1.2,   // and after this long when paused
    maxBlipsPerFrame: 900,
    coastAlpha: 0.6,
  },

  // ---- Spoken descriptions ----------------------------------------------
  describeEverySeconds: 12,

  render: { sampleRate: 48000, maxSeconds: 120, toneSeconds: 20 },
};
