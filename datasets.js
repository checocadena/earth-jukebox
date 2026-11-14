// What the jukebox can play. A dataset is a list of events, each with a time
// and a place on Earth, recovered from the frames of a NASA Earth Information
// Center visualization (see tools/).

export default [
  {
    id: 'lightning',
    title: 'Lightning',
    events: 'data/lightning.bin',
    unit: 'flashes',
    startDate: '2017-03-01',
    sourceTitle: 'Lightning Events Detected from the International Space Station (ISS) 2017-2023',
    sourceUrl: 'https://svs.gsfc.nasa.gov/5011/',
    credit:
      'NASA Scientific Visualization Studio. Visualizers: Michala Garrison (SSAI), Greg Shirah (NASA/GSFC), ' +
      'Kel Elkins (USRA), Alex Kekesi (GST). Data: Lightning Imaging Sensor on the International Space Station, ' +
      'quality controlled science data, NASA GHRC. Coastlines: Natural Earth.',
    about:
      'Every lightning flash the Lightning Imaging Sensor on the International Space Station saw from March 2017 to 2023. ' +
      'The station only passes over the tropics and middle latitudes, so the far north and south are silent.',
  },
];
