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

Earth Jukebox lets you hear NASA's picture of lightning on Earth. It takes the Earth Information Center animation of every flash the Lightning Imaging Sensor on the International Space Station saw from 2017 to 2023, reads the flashes back out of its frames, and plays each one as a single click. Nothing is turned into notes. The only control over the sound is how fast time runs. Slowed down, you hear single flashes, left and right as they sit on the globe. Faster, they merge into a hiss that swells every summer. At the top speed a year lasts two thousandths of a second, and the yearly rise and fall of lightning becomes the waveform of a tone. Turn the globe and the tone changes, because each side of the Earth has its own seasons. The picture is a radar scope with the coastlines in outline. It is built for blind and low-vision listeners first: it runs by keyboard, speaks the date, the place and the amount of lightning, and saves what you hear as a WAV file.

## Links

- Demo video: (to add after recording)
- Final project: https://checocadena.github.io/earth-jukebox/ (after Pages is on)
- Code: https://github.com/checocadena/earth-jukebox

## How it works

Reading the frames. NASA's animation (SVS 5011, flat map version) shows each flash as a yellow dot on a grey map. A script (`tools/extract_lightning.py`) goes through all 6,002 frames, finds the dots that are lit in one frame and were not lit in the frame before, and records each as an event with a frame and a one-degree map cell. That gives 2.7 million events. The animation does not run at a steady speed, so the script also works out the date of every frame from the animation itself. Each dot stays lit for a fixed window of data, so how many frames a dot lasts tells how fast time is moving at that point. The length of the window comes from the seasons, which have to repeat every 365.25 days. The dates agree with themselves to a few days from year to year and may be off by a few weeks overall.

Making the sound. This is audification: the data is played back faster than it happened, and one event is one click. The Web Audio code runs in an AudioWorklet. At low speeds it places each click at its own moment. At high speeds, where thousands of flashes fall inside one audio sample, it reads the count per frame as a curve, which is the same signal with less work. You hear the half of the Earth that faces you. Left on the globe is the left ear, and flashes near the edge are quieter. There are no scales, no instruments and no effects by default. Every setting is in one file, `config.js`.

The picture. A radar scope drawn on a canvas: the rim of the Earth, coastlines in outline, and a blip for each flash that fades like phosphor. The hand is the calendar. One turn is one year. The line it leaves around the rim is how much lightning the visible side had through the year, which is also the shape of the wave you hear at top speed.

Accessibility. Everything works from the keyboard and every key has a visible control. A live region tells screen readers the month and year, which part of the world is facing the listener, and whether lightning there is below, near or above its usual level. At the highest speeds it says how long a year lasts and what pitch that makes. Focus is always visible. The WAV file is made with the same code as the live sound.

## NASA data used

- Lightning Events Detected from the International Space Station (ISS) 2017-2023, NASA Scientific Visualization Studio, https://svs.gsfc.nasa.gov/5011/. It is in the Earth Information Center content database and is listed in the challenge resources.
  - Visualizers: Michala Garrison (SSAI), Greg Shirah (NASA/GSFC), Kel Elkins (USRA), Alex Kekesi (Global Science and Technology, Inc.).
  - Data shown in it: Quality Controlled Lightning Imaging Sensor (LIS) on International Space Station (ISS) Science Data V1, NASA GHRC.
- The project uses the frames of the flat map version of the animation as its data. It does not use the LIS data files directly.

## Other data

- Coastlines: Natural Earth 1:110m land (public domain), through the world-atlas package.

## Use of AI

I used Claude Code (Anthropic), an AI coding assistant, to write most of the code: the script that reads the flashes out of NASA's frames, the audio engine, the scope drawing, the keyboard controls, the screen reader descriptions and the WAV export. I also used it to draft this project text, which I then edited. The concept is mine: play the data itself, sped up, with no musical mapping, on a radar scope, following earlier work of my own. I chose the NASA visualization and made the sound decisions. The sound is produced by the code in real time from the NASA frames. No AI-generated audio, images, video or voice are used in the project or the demo.

(Checo: edit this to match what you actually did and decided.)

## References

- NASA Scientific Visualization Studio, Lightning Events Detected from the ISS 2017-2023: https://svs.gsfc.nasa.gov/5011/
- NASA Earth Information Center content database: https://svs.gsfc.nasa.gov/gallery/earth-information-center/
- Natural Earth: https://www.naturalearthdata.com/
- Web Audio API, MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

## Demo video plan (30 seconds)

Record with your phone's screen recorder, sound on. Open the live link first so the data is loaded.

| Time | Screen | Voice or caption |
|---|---|---|
| 0 to 4 s | Scope at rest | "I'm Checo, solo team. This is Earth Jukebox." |
| 4 to 10 s | Tap Play at 23 days per second | "Six years of lightning seen from the Space Station. One flash, one click." |
| 10 to 16 s | Drag speed down to about 0.5 days per second | No voice. Single clicks, left and right. |
| 16 to 25 s | Drag speed slowly all the way up | "Speed time up and the seasons become a tone." |
| 25 to 30 s | At top speed, drag the globe from Africa to South America | "Turn the Earth and the tone changes." |

If there is room, end on the Info panel or a screen reader reading the description.
