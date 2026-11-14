// Earth Jukebox: every sound mapping choice lives in this file.
//
// Values marked PLACEHOLDER are working defaults so the page makes sound.
// They are NOT Checo's musical choices yet. Change them here (or ask Claude
// to) and reload the page; nothing else in the code needs to change.

export default {
  // ---- Pitch space -------------------------------------------------------
  // PLACEHOLDER: scale and root not chosen yet.
  scale: 'dorian',          // any key of `scales` below
  root: 'D',                // C, C#, D, D#, E, F, F#, G, G#, A, A#, B
  lowestOctave: 3,          // D3 is the lowest note
  octaveSpan: 3,            // notes spread over this many octaves

  scales: {
    major:            [0, 2, 4, 5, 7, 9, 11],
    minor:            [0, 2, 3, 5, 7, 8, 10],
    dorian:           [0, 2, 3, 5, 7, 9, 10],
    lydian:           [0, 2, 4, 6, 7, 9, 11],
    majorPentatonic:  [0, 2, 4, 7, 9],
    minorPentatonic:  [0, 3, 5, 7, 10],
    wholeTone:        [0, 2, 4, 6, 8, 10],
  },

  // ---- Time --------------------------------------------------------------
  // PLACEHOLDER tempo. One "step" reads one column of the image.
  bpm: 96,
  stepsPerBeat: 2,          // 2 = eighth notes

  // ---- How the image is read --------------------------------------------
  // The frame is cut into a grid. Each step plays one column, left to right,
  // so a full sweep of the picture takes `columns` steps.
  grid: { columns: 8, rows: 5 },

  // Features available for each region:
  //   ice        share of the region covered by sea ice (bluish white)
  //   snow       share covered by other white (snow on land, ice sheet, cloud)
  //   ocean      share that is open water (dark blue)
  //   brightness average brightness, 0 dark to 1 white
  //   saturation average colour strength, 0 grey to 1 vivid
  //   hue        average hue, 0 to 1 around the colour wheel
  //   row        vertical position, 1 = top (north in most views), 0 = bottom
  //   column     horizontal position, 0 = left, 1 = right

  // PLACEHOLDER: which feature sets the note inside the scale (0 low, 1 high).
  // Any mapping can take `range: [lo, hi]` to stretch a narrow feature to 0..1.
  pitch: { source: 'row' },

  // A region plays a note on its step when this feature passes the threshold.
  trigger: { source: 'ice', threshold: 0.15 },

  // How many regions in the column may sound at once. The density feature
  // (averaged over the column) scales between 1 and maxNotes.
  density: { source: 'ice', maxNotes: 4 },

  // Loudness of each note.
  velocity: { source: 'ice', min: 0.2, max: 0.9 },

  // Timbre: this feature opens the filter and blends in a brighter wave.
  timbre: { source: 'brightness', cutoffMin: 500, cutoffMax: 6000 },

  // Stereo position follows the column being read.
  pan: { width: 0.8 },

  // Note shape (seconds).
  note: { attack: 0.01, decay: 0.6, lengthInSteps: 1.5, waveSoft: 'triangle', waveBright: 'sawtooth' },

  // ---- Drone -------------------------------------------------------------
  // A held chord on the root and fifth. Its level follows the total of
  // `source` in the whole frame, so it thins out as the ice melts.
  drone: { enabled: true, source: 'ice', range: [0, 0.4], gainMax: 0.18, cutoffMin: 200, cutoffMax: 1400, smoothing: 0.8 },

  // ---- Calendar ----------------------------------------------------------
  // A soft high bell on the first day of each month, so you always know
  // where you are in the season without looking.
  monthBell: { enabled: true, gain: 0.25, octaveAboveRoot: 3 },

  // ---- Output ------------------------------------------------------------
  master: 0.7,
  render: { sampleRate: 44100 },

  // ---- Spoken descriptions ----------------------------------------------
  // Screen readers get an update about every this many days of animation.
  describeEveryDays: 21,
};
