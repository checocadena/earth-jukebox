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
      'One flash is one click. Left on the globe is your left ear. You hear the side of the Earth that faces you, and the Earth turns while it plays. The main control is how fast time runs. Slow, you hear single flashes. Faster, they merge into a hiss that swells each summer. Fastest, a whole year passes in a few thousandths of a second and the seasons themselves become the pitch.',
      'Chord: lightning makes the space between the ground and the upper atmosphere resonate at 7.8, 14, 20, 27 and 33 hertz. With Chord on, every flash strikes those five pitches, moved up five octaves so you can hear them. The pitches are the planet\'s. How long they ring is our choice: the real resonance dies away faster.',
      'The line around the rim is the calendar: January at the top, going clockwise. Its height is how much lightning the visible side had, and the bright dot is now. At top speed that line is the waveform you hear. Flashes leave a faint mark that fades, so you can watch lightning move north and south with the seasons.',
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
    sourceTitle: 'Change in Night Lights between 2012 and 2023 - EIC Version',
    sourceUrl: 'https://svs.gsfc.nasa.gov/5313/',
    credit:
      'NASA Scientific Visualization Studio. Visualizer: Kel Elkins (USRA). Scientists: Zhuosen Wang (University of Maryland), ' +
      'Miguel Román (Leidos), Ranjay Shrestha (SSAI), Srija Chakraborty (USRA), Virginia Kalb (NASA). ' +
      'Data: NASA Black Marble, Suomi NPP VIIRS. Coastlines: Natural Earth.',
    about:
      'The lights of towns and cities at night, as a yearly average, from 2012 to 2023. More light mostly means more people, more roads and more power.',
    sound: [
      'Each bright line across the globe is a voice. A read head runs along it, and the lights it passes on the side of the Earth facing you are that voice\'s waveform: dark ocean is silence, a city is a spike. The line rises where the lights are, so you can see the wave you hear.',
      'All the read heads move over the ground at the same speed. Lines nearer the poles are shorter circles, so they come round sooner and sound higher. That fixes the intervals: 37 degrees is a major third above the equator, 48 degrees a fifth, 60 degrees an octave. The notes are the shape of the planet.',
      'The Earth turns while it plays. Asia, Europe and the Americas each bring their own chord, and the Pacific is nearly silent. As the years pass the lights grow, and the sound gets brighter and louder.',
    ],
    compare: 'Lights',
    quiet: 'Mostly dark on this side.',
    speedKeys: 'Higher or lower pitch',
    timeKeys: 'Back or forward one year',
    note: 'Lights are read from the picture, not from the measurements, so they show where and how much, not exact brightness.',
  },
];
