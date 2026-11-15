// The worlds in the jukebox. Each one is read out of the frames of a NASA
// Earth Information Center visualization (see tools/).
//   kind 'events'  things that happen at a time and a place (one click each)
//   kind 'field'   a map that changes from year to year (read as a waveform)

export const project = {
  title: 'Earth Jukebox',
  about:
    'I\'m Checo, a sound artist in New York. NASA\'s Earth Information Center shows how the planet is changing, mostly in pictures. ' +
    'I wanted to hear them, and I wanted people who can\'t see them to have a way in. ' +
    'Each world here is read straight from the frames of one NASA animation and played as sound.',
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
      'Lightning seen from the International Space Station, March 2017 to 2023. ' +
      'The station only flies over the tropics and the middle latitudes, so the far north and south are empty.',
    sound: [
      'It\'s rain on a music box. A flash plucks the note of the nearest line of latitude. There are thousands of flashes a second, so only a share of them pluck. Stormy months play more notes and quiet months play fewer. Under the notes, every flash is also a very soft click.',
      'The notes come from the shape of the planet. A line of latitude near the pole is a shorter circle than the equator, so it sounds higher. You hear the side of the Earth that\'s facing you, with west in your left ear.',
      'The slider moves through time. The line around the globe is a calendar with January at the top, and it rises when there\'s more lightning.',
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
      'City lights at night, one map a year from 2012 to 2023.',
    sound: [
      'This one is a music box too. The Earth is the drum and the cities are the pins. When a city crosses the middle of the globe it plucks the note for its latitude, and a brighter city plucks harder. The ocean is silent. Drag the globe to strum it.',
      'The notes come from the shape of the planet. Lines of latitude nearer the poles are shorter circles, so they sound higher. 37 degrees is a major third above the equator and 60 degrees is an octave.',
      'As the years go by there are more lights, so there are more notes.',
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
      'Sea surface temperature over one year, March 2007 to March 2008, from the ECCO2 ocean model. Brighter means warmer.',
    sound: [
      'A quiet chord with slow bells. Each line across the globe holds a note, and it gets louder where the water along it changes temperature. A bell rings when the edge between warm and cold water crosses the middle of the globe, like the Gulf Stream or the cold water off Peru.',
      'Same notes as the other worlds, lower.',
    ],
    quiet: 'The water on this side is close to one temperature.',
    speedKeys: 'Higher or lower pitch',
    timeKeys: 'Back or forward a few days',
    note: 'Temperatures are read from the colours of the picture, not from the model, so they show warm and cold, not measurements.',
  },
];
