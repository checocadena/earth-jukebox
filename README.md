# Earth Jukebox

NASA Space Apps Challenge 2026 entry (NYC local event, NYU Tandon, Nov 14-15), challenge "The Earth Information Jukebox".

Hear NASA's Earth Information Center animation of lightning seen from the International Space Station (SVS 5011, https://svs.gsfc.nasa.gov/5011/). One flash is one click. Nothing is mapped to notes: the only control over the sound is how fast time runs, from single clicks to a tone whose waveform is the yearly rise and fall of lightning. The picture is a radar scope. Built for blind and low-vision people first, and for anyone else.

Status: working. Building started Sat Nov 14, after the 10:00 am ET start time in the rules.

## Run it
Any static server that supports byte ranges, for example `npx http-server -p 8123`, then open http://localhost:8123/.

## Files
- `config.js`: every sound and picture setting.
- `datasets.js`: what the jukebox can play.
- `js/dsp.js`: the audio engine (AudioWorklet and offline WAV render).
- `js/scope.js`, `js/geo.js`: the scope and the globe maths.
- `tools/extract_lightning.py`: reads the flashes and the dates out of NASA's frames into `data/lightning.bin`.
- `SUBMISSION.md`: submission checklist and draft text.
- `notes/`: working notes.

## Deadline
Global submission: Sun Nov 15, 11:59 pm ET. Needs a project page, a demo, and a statement of how AI tools were used.
