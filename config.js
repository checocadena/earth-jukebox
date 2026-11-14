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

  // PLACEHOLDER: off. The ring. Lightning makes the space between the ground
  // and the upper atmosphere resonate at 7.83, 14.3, 20.8, 27.3 and 33.8 Hz
  // (the Schumann resonances). Moved up `octavesUp` octaves these are audible
  // pitches, and every click strikes them. mix 0 = clicks only, 1 = ring only.
  // The real resonance is dull (q about 5). A higher q makes it ring like a
  // bell, which is a choice, not a measurement.
  // Try from the address bar: ?ring=1  or  ?ring=0.6&q=80&octaves=6
  ring: { mix: 0, octavesUp: 5, modesHz: [7.83, 14.3, 20.8, 27.3, 33.8], q: 40 },

  // PLACEHOLDER: no effects. Checo is undecided. 0 = off, 1 = fully wet.
  // Try them from the address bar: ?reverb=0.3&delay=0.2  (also ?click=1500 for click colour)
  effects: { reverb: 0, reverbSeconds: 3.5, delay: 0, delaySeconds: 0.36, delayFeedback: 0.35 },

  // ---- Listening position -----------------------------------------------
  // You hear the half of the Earth that faces you. Left of the globe is the
  // left ear. `falloff` fades flashes near the edge (0 = no fade).
  view: { lon: 10, lat: 10, falloff: 1, stepDegrees: 15 },

  // ---- Picture -----------------------------------------------------------
  scope: {
    phosphor: '225,255,236',   // line colour, same as checocadena.com
    glow: '80,255,150',
    persistence: 0.1,          // how fast a flash fades (higher = shorter afterglow)
    maxBlipsPerFrame: 900,
    coastAlpha: 0.6,
  },

  // ---- Spoken descriptions ----------------------------------------------
  describeEverySeconds: 12,

  render: { sampleRate: 48000, maxSeconds: 120, toneSeconds: 20 },
};
