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
  click: { lowpassHz: 280 },
  highpassHz: 20,       // removes the inaudible slow offset
  master: 0.9,
  // Above this many events per sample the engine reads the per-frame rate
  // curve and stops adding single clicks (same signal, far less work).
  curveAboveEventsPerSample: 6,

  // OFF (mix 0): Checo found it too eerie. The chord now comes from plucked notes (see `worlds`).
  // Set mix to 0.9 to hear it again. What it is: Lightning makes the space between the ground
  // and the upper atmosphere resonate at 7.83, 14.3, 20.8, 27.3 and 33.8 Hz
  // (the Schumann resonances). Moved up `octavesUp` octaves these are five
  // audible pitches, and every click strikes all five.
  //   mix           1 = chord only, lower leaves some of the click in, 0 = clicks only.
  //   decaySeconds  how long a struck pitch rings. Long = smooth held tones.
  //                 Short (0.02) = closer to the real, dull resonance, and buzzy.
  // Try from the address bar: ?chord=1  or  ?chord=0.7&decay=1.5&octaves=6
  ring: { mix: 0, onMix: 0.9, octavesUp: 5, modesHz: [7.83, 14.3, 20.8, 27.3, 33.8], decaySeconds: 0.8 },

  // PLACEHOLDER amounts. Space around the sound: a long reverb and an echo that
  // bounces from side to side. 0 = none, 1 = as much echo or reverb as direct sound.
  effects: { reverb: 0.55, reverbSeconds: 5, delay: 0.3, delaySeconds: 0.42, delayFeedback: 0.42 },

  // PLACEHOLDER. A whoosh as the camera flies into the arcade screen after "Click to start".
  // It is noise through a filter, made live (no recording). It swells as the camera speeds up and
  // dies away as the worlds appear, then rings on in the reverb and the echo for a few seconds.
  // It only plays on that first flight.
  //   level        loudness at its peak before the mix below (0 = no whoosh)
  //   dry          how much is heard straight, with no space around it
  //   reverb echo  how much goes into the reverb and into the side to side echo (the same ones
  //                the music uses). Raise these and lower dry for a farther, more spacey sound.
  //   fromHz toHz  the filter rises from fromHz to toHz on the way in, so it gets brighter
  //   q            how narrow the filter is: higher whistles more, lower is more breath
  //   peakAt       when it is loudest, as a share of the flight (the flight is 3.4 s, set in js/app.js)
  //   tailSeconds  how long the whoosh itself takes to die away after the worlds appear
  //   reducedMotionLevel  level when the system asks for less motion. There is no flight then, so 0.
  whoosh: { level: 0.32, dry: 0.6, reverb: 1.4, echo: 3.5, fromHz: 180, toHz: 1500, q: 0.9, peakAt: 0.82, tailSeconds: 0.7, reducedMotionLevel: 0 },

  // ---- Map worlds (night lights, ocean) --------------------------------
  // PLACEHOLDER mapping. Each chosen line of latitude has a pitch. All read
  // heads move over the ground at the same speed, and lines nearer the poles
  // are shorter circles, so they sound higher: pitch = root / cos(latitude).
  // That makes 36.87 degrees a major third above the equator, 48.19 a fifth
  // and 60 an octave. The intervals are the shape of the planet; which lines
  // are used is the choice (these give a five-note scale with no clashes).
  scan: {
    linesDegrees: [60, 53.13, 48.19, 36.87, 27.27, 0, -27.27, -36.87],
    bandDegrees: 1.5,         // each line is this many degrees wide on each side
    backLevel: 0.1,           // how loud the far side of the Earth is in the held voices (0 = silent)
    harmonics: 24,            // default tone colour of the held voices (each world sets its own below)
    stepsPerSecond: 0.25,     // how fast the years (or months) pass while playing
    crossfadeSeconds: 0.2,
    minHz: 40, maxHz: 880,    // range of the pitch slider
  },
  // How each map world sounds. PLACEHOLDERS.
  //   rootHz   pitch of the equator line
  //   pad      held voices: one per line, shaped by the data along the line on the near side.
  //            level 0 = none. harmonics low = soft and round, high = bright and buzzy.
  //            octave moves the held voices up or down against the plucked ones.
  //   pluck    a music box: the Earth is the drum and the data are the pins. `on` says what
  //            plucks: 'peak' = a bright place, 'front' = a sharp change along the line.
  //            It plucks that line's note as it crosses the middle of the globe. null = none.
  worlds: {
    // Lightning: flashes pluck notes, like rain on a music box. A flash plucks the note of the
    // line of latitude nearest to it. Only some flashes pluck (there are thousands a second):
    // about `perSecond` at the starting speed, more in stormy months, fewer in quiet ones.
    // bed = level of the click-per-flash sound underneath (0 = none, 1 = as it was).
    lightning: { rootHz: 293.66, bed: 0.1, pluck: { level: 0.19, decaySeconds: 1.0, perSecond: 9, maxPerSecond: 24 } },
    // Night lights: a music box. Cities pluck as they cross the middle of the globe.
    lights: { rootHz: 220, pad: { level: 0.05, harmonics: 3, octave: -1 }, pluck: { on: 'peak', level: 0.36, threshold: 0.25, decaySeconds: 1.8, octave: 0 } },
    // Ocean: a held chord, with slow low bells where a line crosses from warm water to cold.
    // threshold = how big the step must be, as a share of the whole range (0.04 is about 1.3 C).
    ocean:  { rootHz: 73.42, pad: { level: 0.13, harmonics: 3, octave: 0 }, pluck: { on: 'front', level: 0.24, threshold: 0.04, decaySeconds: 3.5, octave: 1 } },
  },

  // ---- The Earth turns ---------------------------------------------------
  // PLACEHOLDER. While playing, the globe turns by itself and you hear what
  // comes round. Dragging or the arrow keys still turn it by hand.
  // After a drag the globe keeps the speed you gave it and settles back to its own over `settleSeconds`.
  spin: { secondsPerTurn: 48, settleSeconds: 1.6 },

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
