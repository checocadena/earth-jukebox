# Space Apps 2026 submission: Earth Jukebox

Draft only. Checo submits. Global deadline: Sun Nov 15, 11:59 pm ET.

## Checklist

The challenge text and resource list were pasted in by Checo on Sat Nov 14 (the site would not load from the build machine). The submission fields below come from the 2025 Project Submission Guide, so open the 2026 form and check each field name before pasting.

- [ ] Make the GitHub repo public (needed for the project link and for GitHub Pages). Ask: OK to make it public?
- [ ] Turn on GitHub Pages: repo Settings, Pages, "Deploy from a branch", branch `main`, folder `/ (root)`. Live link will be https://checocadena.github.io/earth-jukebox/
- [ ] Open the live link on your phone and press Play once.
- [ ] Settle the sound settings in `config.js` (click colour, levels, effects or none).
- [ ] Record the demo video (plan below). The 2025 guide limits it to 30 seconds. Upload to YouTube (unlisted is fine if public link works) or Vimeo. The Space Apps site does not host video, so it needs a public link.
- [ ] Fill in the form: project name, high-level summary, demo link, final project link, project details, use of AI, NASA data, references.
- [ ] Team page: solo team, NYC local event. Local judging is skipped.
- [ ] Do not use the NASA logo or NASA "meatball" on the page or video. Credit NASA data in words.
- [ ] Submit before Sun Nov 15, 11:59 pm ET.

## Project name

Earth Jukebox

## High-level summary

Earth Jukebox plays NASA's pictures of the Earth as sound. You walk up to an arcade machine, pick one of three turning worlds, and listen. Each world is read out of the frames of one NASA Earth Information Center animation, and in each one the data is the sound itself. In Lightning, every flash the Space Station saw from 2017 to 2023 is one click, and time can be sped up until a year lasts two thousandths of a second and the seasons become a tone. In Night lights and Ocean, lines of latitude are voices: a read head runs along each line and the city lights or water temperatures it passes are the waveform. Lines nearer the poles are shorter circles, so they sound higher, and the intervals between them come from the shape of the planet. The Earth turns while it plays, so you hear what faces you. It is built for blind and low-vision listeners first: it runs by keyboard, speaks the date, the place and what is happening, shows NASA's own frame beside the sound, and saves what you hear as a WAV file.

## Links

- Demo video: (to add after recording)
- Final project: https://checocadena.github.io/earth-jukebox/ (after Pages is on)
- Code: https://github.com/checocadena/earth-jukebox

## How it works

Reading the frames. Three scripts in `tools/` turn NASA's animations into data.
- Lightning (SVS 5011): each flash is a yellow dot. A dot lit in one frame and not in the frame before is a new event, stored with its frame and a one-degree map cell. That gives 2.7 million events. The animation eases in and out, so the script also works out the date of every frame from the animation itself: a dot stays lit for a fixed window of data, so how many frames it lasts tells how fast time is moving, and the length of the window comes from the seasons repeating every 365.25 days.
- Night lights (SVS 5313): one frame from the middle of each year, 2012 to 2023. The script keeps the small bright points that stand out from the land around them and sums them into one-degree cells. Snow and rock that only look like lights are removed with a colour test.
- Ocean (SVS 3912): 96 moments through one model year. The colour of each current line is turned back into a temperature with NASA's colour bar and averaged per cell.
These are read from the pictures, not from the instrument or model files, so they show where and how much, not exact measurements.

Making the sound. Everything runs in the browser with the Web Audio API, in an AudioWorklet. There are no samples, scales or instruments.
- Events (Lightning): audification. One flash is one click, placed at its own moment and played back faster than it happened. At high speeds, where thousands of flashes fall inside one audio sample, the engine reads the count per frame as a curve, which is the same signal. An optional setting passes the clicks through five resonators at the Schumann resonance frequencies (7.83 to 33.8 Hz, the frequencies at which lightning makes the atmosphere ring), moved up five octaves.
- Maps (Night lights, Ocean): each chosen line of latitude is a wavetable voice. The table is the data along that line, one value per degree of longitude, weighted by the side of the Earth facing the listener. All read heads move at the same ground speed, so a line's pitch is the equator pitch divided by the cosine of its latitude: 36.87 degrees is a major third up, 48.19 a fifth, 60 an octave.
- In every world the globe turns while it plays, left on the globe is the left ear, and the far side is quiet. Every setting is in one file, `config.js`.

The picture. White outline on black: an arcade cabinet for the way in, then an outline globe. Data is yellow, as in NASA's lightning frames. In Lightning each flash leaves a mark that fades with the data. In the map worlds each sounding line is drawn on the globe and rises where its data is, so the waveform is visible on the Earth. A button shows NASA's own animation beside the globe, kept at the same moment.

Accessibility. Everything works from the keyboard and every key has a visible control. A live region tells screen readers the date, which part of the world is facing the listener and what is happening there, and repeats as things change. Focus is always visible. People who ask their device for less motion get no intro and no turning. The WAV file is made with the same code as the live sound.

## NASA data used

All three are in the Earth Information Center resources listed for this challenge.
- Lightning Events Detected from the International Space Station (ISS) 2017-2023, NASA SVS, https://svs.gsfc.nasa.gov/5011/. Visualizers: Michala Garrison (SSAI), Greg Shirah (NASA/GSFC), Kel Elkins (USRA), Alex Kekesi (GST). Data shown: Lightning Imaging Sensor on the ISS, quality controlled science data, NASA GHRC.
- Change in Night Lights between 2012 and 2023, EIC Version, NASA SVS, https://svs.gsfc.nasa.gov/5313/. Visualizer: Kel Elkins (USRA). Scientists: Zhuosen Wang (University of Maryland), Miguel Román (Leidos), Ranjay Shrestha (SSAI), Srija Chakraborty (USRA), Virginia Kalb (NASA). Data shown: NASA Black Marble, Suomi NPP VIIRS.
- Global Sea Surface Currents and Temperature, NASA SVS, https://svs.gsfc.nasa.gov/3912/. Animators: Greg Shirah (NASA/GSFC), Horace Mitchell (NASA/GSFC), Eric Sokolowsky (GST). Producer: Michael Starobin (HTSI). Scientists: Hong Zhang (UCLA), Dimitris Menemenlis (NASA/JPL Caltech). Data shown: ECCO2 ocean and sea ice model (MIT/JPL).
- The project uses the frames of these animations as its data, and shows small copies of them (resized, no other changes) beside the globe.

## Other data

- Coastlines: Natural Earth 1:110m land (public domain), through the world-atlas package.

## Use of AI

I used Claude Code (Anthropic), an AI coding assistant, to write most of the code: the scripts that read data out of NASA's frames, the audio engine, the drawing, the keyboard controls, the screen reader descriptions and the WAV export. I also used it to draft this project text, which I then edited. The direction is mine: play the data itself with no musical mapping, following earlier work of my own; the outline look; the arcade machine and the worlds inside it; the Earth turning as the thing that moves the sound. I chose the NASA visualizations and made the sound decisions by ear. The sound is produced by the code in real time from data read out of NASA's frames. No AI-generated audio, images, video or voice are used in the project or the demo.

(Checo: edit this to match what you actually did and decided.)

## References

- NASA SVS 5011, 5313 and 3912 (links above)
- NASA Earth Information Center content database: https://svs.gsfc.nasa.gov/gallery/earth-information-center/
- Natural Earth: https://www.naturalearthdata.com/
- Web Audio API, MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

## Demo video plan (30 seconds)

Record with your phone's screen recorder, sound on. Reload the page so the intro plays.

| Time | Screen | Voice or caption |
|---|---|---|
| 0 to 5 s | The arcade machine, camera rising into the screen | "I'm Checo, solo team. This is Earth Jukebox: NASA's pictures of the Earth, played as sound." |
| 5 to 8 s | Tap the Lightning planet, it zooms in. Tap Play. | "Six years of lightning. One flash, one click." |
| 8 to 14 s | Drag the speed slider slowly to the top | "Speed time up and the seasons become a tone." |
| 14 to 22 s | Tap Night lights in the tabs. Let it turn. | "City lights. Every line of latitude is a voice." |
| 22 to 27 s | Tap NASA to show the source frame | "Read straight from NASA's frames." |
| 27 to 30 s | Tap Ocean | "Built for blind and low-vision listeners first." |
