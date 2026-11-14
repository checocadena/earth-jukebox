// NASA visualizations the jukebox can play.
// Each entry: where the video came from, how to read its date, and what is on
// screen at each point, for the spoken descriptions.

export default [
  {
    id: 'arctic-sea-ice-2026',
    title: 'Arctic Sea Ice Minimum 2026',
    video: 'media/arctic-sea-ice-2026.mp4',
    poster: 'media/arctic-sea-ice-2026.jpg',
    features: 'data/arctic-sea-ice-2026.json',
    sourceUrl: 'https://svs.gsfc.nasa.gov/5677/',
    credit:
      'NASA Scientific Visualization Studio. Animator: Trent L. Schindler (USRA). ' +
      'Producer: James Riordon (NASA/GSFC). Scientist: Walt Meier (NASA/GSFC). ' +
      'AMSR2 sea ice data courtesy of the Japan Aerospace Exploration Agency (JAXA). ' +
      'Blue Marble Next Generation courtesy of Reto Stockli (NASA/GSFC).',
    summary:
      'Daily Arctic sea ice seen from space, from the yearly maximum on 15 March 2026 ' +
      'to the minimum on 12 September 2026. Sea ice is bluish white over dark blue ocean.',
    // Video time (seconds) to days after startDate, read off the burned-in date.
    startDate: '2026-03-15',
    dateKeys: [[0, 0], [5, 20], [10, 45], [20, 96], [30, 147], [34, 167], [36, 178], [37, 181]],
    // Areas of the frame to ignore (fractions of width and height): the date label.
    exclude: [{ x: 0.78, y: 0, w: 0.22, h: 0.12 }],
    // What the camera shows, by video time.
    views: [
      { from: 0, text: 'Greenland is in the centre, Canada to the left, Europe to the right.' },
      { from: 14, text: 'The globe turns. Alaska and Canada are at the bottom, Greenland to the right, Siberia at the top left.' },
      { from: 27, text: 'Siberia is to the left, Alaska at the bottom, Greenland at the top right.' },
      { from: 37, text: 'Minimum reached on 12 September. Siberia runs along the bottom. A yellow line marks the average minimum for 1981 to 2010, and the ice now sits well inside it.' },
    ],
  },
];
