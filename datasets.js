// The worlds in the jukebox. Each one is read out of the frames of a NASA
// Earth Information Center visualization (see tools/).
//   kind 'events'  things that happen at a time and a place (one click each)
//   kind 'field'   a map that changes from year to year (read as a waveform)

export const project = {
  title: 'Earth Jukebox',
  about:
    'NASA\'s Earth Information Center shows how the planet is changing, in pictures. Earth Jukebox plays those pictures as sound, ' +
    'so they can be heard as well as seen. Each world here is read out of the frames of one NASA animation. ' +
    'Nothing is turned into notes: the data itself is the waveform.',
};

export default [
  {
    id: 'lightning',
    kind: 'events',
    title: 'Lightning',
    events: 'data/lightning.bin',
    startDate: '2017-03-01',
    view: { lon: 10, lat: 10 },
    video: { src: 'media/lightning-nasa.mp4', fps: 60, label: 'NASA SVS 5011' },   // original frame f is at f / fps seconds
    sourceTitle: 'Lightning Events Detected from the International Space Station (ISS) 2017-2023',
    sourceUrl: 'https://svs.gsfc.nasa.gov/5011/',
    credit:
      'NASA Scientific Visualization Studio. Visualizers: Michala Garrison (SSAI), Greg Shirah (NASA/GSFC), ' +
      'Kel Elkins (USRA), Alex Kekesi (GST). Data: Lightning Imaging Sensor on the International Space Station, ' +
      'quality controlled science data, NASA GHRC. Coastlines: Natural Earth.',
    about:
      'Every lightning flash the Lightning Imaging Sensor on the International Space Station saw from March 2017 to 2023. ' +
      'The station only passes over the tropics and middle latitudes, so the far north and south are silent.',
    sound: [
      'One flash is one strike. Lightning makes the space between the ground and the upper atmosphere resonate at 7.8, 14, 20, 27 and 33 hertz. Here every flash strikes those five pitches, moved up five octaves so you can hear them. The pitches are the planet\'s. How long they ring is our choice: the real resonance dies away faster.',
      'Left on the globe is your left ear. You hear the side of the Earth that faces you, and the Earth turns while it plays. The slider is how fast time runs. Slow, you hear single flashes. Faster, they merge into a chord that swells each summer. Fastest, a whole year passes in a few thousandths of a second and the seasons themselves become the pitch.',
      'The line around the rim is the calendar: January at the top, going clockwise. Its height is how much lightning the visible side had, and the bright dot is now. Flashes leave a mark that fades, so you can watch lightning move north and south with the seasons.',
    ],
    speedKeys: 'Faster or slower',
    timeKeys: 'Back or forward one month',
    note: 'Dates are read back from the animation and may be off by a few weeks.',
  },
  {
    id: 'lights',
    kind: 'field',
    title: 'Night lights',
    maps: 'data/nightlights.bin',
    view: { lon: 78, lat: 27 },
    video: { src: 'media/lights-nasa.mp4', fps: 30, frames: [3, 18, 36, 53, 71, 88, 106, 123, 141, 158, 176, 215], label: 'NASA SVS 5313' },
    sourceTitle: 'Change in Night Lights between 2012 and 2023 - EIC Version',
    sourceUrl: 'https://svs.gsfc.nasa.gov/5313/',
    credit:
      'NASA Scientific Visualization Studio. Visualizer: Kel Elkins (USRA). Scientists: Zhuosen Wang (University of Maryland), ' +
      'Miguel Román (Leidos), Ranjay Shrestha (SSAI), Srija Chakraborty (USRA), Virginia Kalb (NASA). ' +
      'Data: NASA Black Marble, Suomi NPP VIIRS. Coastlines: Natural Earth.',
    about:
      'The lights of towns and cities at night, as a yearly average, from 2012 to 2023. More light mostly means more people, more roads and more power.',
    sound: [
      'A music box. The Earth is the drum and the cities are its pins. Each bright line across the globe has a note. When a city on that line crosses the middle of the globe, it plucks the note, louder for a brighter city. Dark ocean plays nothing. Drag the globe and you strum it.',
      'The notes come from the shape of the planet. Lines nearer the poles are shorter circles, so they sound higher: 37 degrees is a major third above the equator, 48 degrees a fifth, 60 degrees an octave.',
      'The Earth turns while it plays, so Asia, Europe and the Americas each bring their own tune, and the Pacific is nearly silent. As the years pass there are more lights, and more notes.',
    ],
    compare: 'Lights',
    quiet: 'Mostly dark on this side.',
    speedKeys: 'Higher or lower pitch',
    timeKeys: 'Back or forward one year',
    note: 'Lights are read from the picture, not from the measurements, so they show where and how much, not exact brightness.',
  },
  {
    id: 'ocean',
    kind: 'field',
    title: 'Ocean',
    maps: 'data/ocean.bin',
    view: { lon: -150, lat: 5 },
    video: { src: 'media/ocean-nasa.mp4', fps: 30, label: 'NASA SVS 3912' },       // frames come from the data file
    stepsPerSecond: 2,
    lift: 4,
    anomaly: true,          // sound and line show the difference from each line's average temperature
    sourceTitle: 'Global Sea Surface Currents and Temperature',
    sourceUrl: 'https://svs.gsfc.nasa.gov/3912/',
    credit:
      'NASA Scientific Visualization Studio. Animators: Greg Shirah (NASA/GSFC), Horace Mitchell (NASA/GSFC), Eric Sokolowsky (GST). ' +
      'Producer: Michael Starobin (HTSI). Scientists: Hong Zhang (UCLA), Dimitris Menemenlis (NASA/JPL Caltech). ' +
      'Data: ECCO2 High Resolution Ocean and Sea Ice Model (MIT/JPL). Coastlines: Natural Earth.',
    about:
      'The temperature of the sea surface through one year, March 2007 to March 2008, from the ECCO2 ocean model. Bright is warm. ' +
      'The warm water moves north and south with the sun, and currents carry it along the edges of the continents.',
    sound: [
      'A slow held chord. Each line across the globe is a voice, and the water temperature along it shapes the voice. Where a line crosses a warm current next to cold water the voice grows, and where the water is all one temperature it fades. Land adds nothing.',
      'The notes come from the shape of the planet, as in Night lights, but lower and with no plucking: lines nearer the poles are shorter circles, so they sound higher. The Earth turns while it plays and the year goes by, so the chord shifts as the warm water moves.',
    ],
    quiet: 'The water on this side is close to one temperature along each line.',
    speedKeys: 'Higher or lower pitch',
    timeKeys: 'Back or forward a few days',
    note: 'Temperatures are read from the colours of the picture, not from the model, so they show warm and cold, not measurements.',
  },
];
