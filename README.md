# Earth Jukebox

NASA Space Apps Challenge 2026 entry (NYC local event, NYU Tandon, Nov 14-15), challenge "The Earth Information Jukebox".

NASA's Earth Information Center animations, played as sound. An arcade machine in the browser with three Earths on its screen: lightning seen from the Space Station (SVS 5011), city lights at night 2012 to 2023 (SVS 5313) and sea surface temperature (SVS 3912). The data is read from the frames of NASA's animations and played as notes. Every line of latitude has a note, and cities, flashes and ocean fronts pluck it as the Earth turns. Built for blind and low-vision people first, and for anyone else.

Live: https://checocadena.github.io/earth-jukebox/

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

## Deadline
Global submission: Sun Nov 15, 11:59 pm ET. Needs a project page, a demo, and a statement of how AI tools were used.
