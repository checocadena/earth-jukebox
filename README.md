# Earth Jukebox

NASA Space Apps Challenge 2026 entry (NYC local event, NYU Tandon, Nov 14-15), challenge "The Earth Information Jukebox".

NASA's Earth Information Center animations, played as sound. An arcade machine in the browser with three Earths on its screen: lightning seen from the Space Station (SVS 5011), city lights at night 2012 to 2023 (SVS 5313) and sea surface temperature (SVS 3912). The data is read from the frames of NASA's animations and played as notes. Every line of latitude has a note, and cities, flashes and ocean fronts pluck it as the Earth turns. Built for blind and low-vision people first, and for anyone else.

Live: https://earthjukebox.com/

Status: working. Building started Sat Nov 14, after the 10:00 am ET start time in the rules.

## Run it
Any static server that supports byte ranges, for example `npx http-server -p 8123`, then open http://localhost:8123/.

## Files
- `config.js`: every sound and picture setting.
- `datasets.js`: the worlds.
- `js/dsp.js`: the audio engines (AudioWorklet and offline WAV render).
- `js/world-events.js`, `js/world-field.js`: the two kinds of world.
- `js/scope.js`, `js/geo.js`: the globe and its maths.
- `js/scene.js`: the 3D scene (arcade machine, menu, camera flights).
- `tools/extract_*.py`: read the data out of NASA's frames into `data/`.
- `media/`: small copies of the NASA animations, shown beside the globe.
- `SUBMISSION.md`: submission checklist and draft text.
- `notes/`: working notes.

## Info panel and accessibility (Nov 15)
- Info now names the challenge (NASA Space Apps Challenge 2026, "The Earth Information Jukebox", https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/), quotes one line of NASA's brief, sums up what it asks for, says how Earth Jukebox answers it and links the three NASA SVS sources.
- For deaf and hard-of-hearing visitors: a captions strip above the date slider says what each world's sound stands for and what is playing now (the whoosh into the machine and the fades between worlds get captions too). A two-bar meter beside it follows the left and right channels and keeps moving when the sound is muted. There is no narration or voice, so the captions are the full transcript.
- Sound controls: Mute (M) and a Volume slider (hidden on phones). Captions and the meter are off by default; the Accessibility button next to Mute (or C) turns them on. All three are remembered in the browser. Screen reader announcements run either way.
- Keyboard: focus lands on the globe after every flight, Esc closes Info and the large NASA frame, and the Info panel lists the new keys. Unselected tabs are brighter for contrast. With reduced motion on, the NASA frame's fades are off as well.
- Sound design is unchanged: the master volume sits after the room effects.

## Deadline
Global submission: Sun Nov 15, 11:59 pm ET. Needs a project page, a demo, and a statement of how AI tools were used.
