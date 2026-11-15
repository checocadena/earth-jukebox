# Space Apps 2026 submission: Earth Jukebox

Draft only. Checo submits. Global deadline: Sun Nov 15, 11:59 pm ET.

## Before you submit

The Space Apps site would not load from the build machine, so the field names below come from the 2025 Project Submission Guide. Check them against the 2026 form. I also could not read the 2026 rules page, so read the rules on team size, AI use and NASA branding yourself before submitting.

- [ ] Make the repo public: GitHub, repo Settings, General, bottom of the page, Change visibility, Public.
- [x] Hosted on Netlify at https://earthjukebox.com/ (domain on Porkbun, DNS on Cloudflare).
- [ ] Open that link on your phone and laptop. Tap to start, fly into each world, check the sound.
- [ ] Record the demo (plan at the bottom). The 2025 guide caps it at 30 seconds and wants a public link, so upload it to YouTube or Vimeo.
- [ ] Paste the text below into the form. It is plain text on purpose.
- [ ] No NASA logo anywhere in the video or screenshots. NASA is credited in words.
- [ ] Submit before Sun Nov 15, 11:59 pm ET.

## Project name

Earth Jukebox

## High-level summary

Earth Jukebox plays NASA's pictures of the Earth as sound. NASA's Earth Information Center shows how the planet is changing, but almost all of it is visual, so blind and low-vision people are left out. I built an arcade machine you walk up to in the browser. Three Earths turn on its screen. One is lightning seen from the Space Station. The others are city lights at night and ocean temperature. Fly into one and it plays. The data is read straight from the frames of NASA's own animations, and each world turns it into notes in its own way. It runs from the keyboard, it tells a screen reader what's playing, NASA's original frame stays on screen next to the globe, and you can export the audio.

## Links

Demo video: (add after recording)
Final project: https://earthjukebox.com/
Code: https://github.com/checocadena/earth-jukebox

## Project details

Where the data comes from. Everything is read out of the frames of three NASA Earth Information Center animations by scripts in the tools folder. In the lightning animation each flash is a yellow dot, so a dot that appears in one frame and wasn't in the frame before is a new flash. That gives 2.7 million flashes with a place and a date. The animation speeds up and slows down, so the script works out the date of each frame from how long the dots stay lit and from the seasons repeating every year. For night lights it takes one frame per year from 2012 to 2023 and keeps the small bright points. For the ocean it takes 96 moments through one year and turns the colour of the water back into a temperature using NASA's colour bar. These are read from the pictures and not from the instrument files, so they show where and how much, and they are not measurements.

How it becomes sound. Every line of latitude has a note. A line near the pole is a shorter circle than the equator, so it sounds higher: the pitch is the equator's pitch divided by the cosine of the latitude. That puts 37 degrees a major third above the equator and 60 degrees an octave above it. Night lights is a music box. The Earth is the drum and the cities are the pins, and when a city crosses the middle of the globe it plucks the note for its latitude. Lightning works the same way, with a share of the flashes plucking the note of the nearest line, so stormy months play more notes. The ocean holds a quiet chord and rings a low bell when the edge between warm and cold water crosses the middle. The Earth turns while it plays and you hear the side that's facing you, with west in your left ear. There is reverb and an echo on all of it. The sound is made in the browser with the Web Audio API. There are no samples.

What you see. White outlines on black. You start at a child's height in front of an arcade machine, the camera rises and goes into the screen, and the three Earths orbit each other inside. Picking one flies you to it, and moving between them swings you along their orbit. The data is drawn in yellow on the globe at the same moment you hear it. NASA's own animation is shown beside the globe at the same date, and you can click it to see it large.

Accessibility. Every action works from the keyboard and focus is always visible. A live region tells a screen reader the date, which part of the world is facing you and what is happening there. If your device is set to reduce motion there is no camera movement and the globes stay still. Export audio saves what you hear as a WAV file.

## NASA data

Lightning Events Detected from the International Space Station (ISS) 2017-2023, NASA Scientific Visualization Studio, https://svs.gsfc.nasa.gov/5011/. Visualizers: Michala Garrison (SSAI), Greg Shirah (NASA/GSFC), Kel Elkins (USRA), Alex Kekesi (GST). Data shown: Lightning Imaging Sensor on the ISS, NASA GHRC.

Change in Night Lights between 2012 and 2023, EIC Version, NASA Scientific Visualization Studio, https://svs.gsfc.nasa.gov/5313/. Visualizer: Kel Elkins (USRA). Scientists: Zhuosen Wang (University of Maryland), Miguel Román (Leidos), Ranjay Shrestha (SSAI), Srija Chakraborty (USRA), Virginia Kalb (NASA). Data shown: NASA Black Marble, Suomi NPP VIIRS.

Global Sea Surface Currents and Temperature, NASA Scientific Visualization Studio, https://svs.gsfc.nasa.gov/3912/. Animators: Greg Shirah (NASA/GSFC), Horace Mitchell (NASA/GSFC), Eric Sokolowsky (GST). Producer: Michael Starobin (HTSI). Scientists: Hong Zhang (UCLA), Dimitris Menemenlis (NASA/JPL Caltech). Data shown: ECCO2 ocean and sea ice model (MIT/JPL).

All three are in the Earth Information Center resources listed for this challenge. The project uses their frames as its data and shows small copies of them, resized, beside the globe.

## Other data

Coastlines: Natural Earth 1:110m land, public domain.

## Use of AI

I built this in one day with Claude Code, Anthropic's AI coding assistant. It wrote the code: the scripts that read the data out of NASA's frames, the sound engine, the 3D drawing, the keyboard and screen reader support. It also drafted this text, which I edited. I directed it by voice the whole way and tested every version by ear and by eye. The decisions were mine: play the data itself and keep it musical, the white outline look, the arcade machine with the Earths inside it, which worlds to include, and what stayed or went after listening. The AI proposed the way data becomes notes, including the pitch from latitude and the cities plucking as they cross the middle of the globe, and I chose between versions and asked for changes. All sound is generated live by the code from NASA's data. There is no AI-generated audio, image, video or voice in the project or the demo.

(Checo: change anything here that isn't how it happened.)

## References

NASA Earth Information Center content database: https://svs.gsfc.nasa.gov/gallery/earth-information-center/
Natural Earth: https://www.naturalearthdata.com/
Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

## Demo video (30 seconds)

Screen-record on your laptop with sound on. Reload the page first so it starts at the machine.

0 to 6 s. The machine. Click to start, the camera rises and goes into the screen. Say: "I'm Checo, solo team. This is Earth Jukebox. It plays NASA's pictures of the Earth as sound."
6 to 14 s. Click Night lights. Let it turn and play. Say: "City lights at night. Every city plucks a note as it passes."
14 to 20 s. Click Lightning in the tabs. Say: "Lightning seen from the Space Station."
20 to 25 s. Click NASA's frame so it goes large, then close it. Say: "All of it read from NASA's own frames."
25 to 30 s. Click Ocean. Say: "Made so blind and low-vision people can hear it too."
