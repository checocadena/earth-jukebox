# Earth Jukebox

NASA Space Apps Challenge 2026 entry (NYC local event, NYU Tandon, Nov 14-15), challenge "The Earth Information Jukebox".

A web page where you pick one of NASA's Earth Information Center visualizations and hear it while it plays. Each frame's colours and brightness, region by region, drive pitch, density and timbre inside a musical scale, so it sounds like music and not noise. Built for blind and low-vision people first, and for anyone else.

Status: working. Plays NASA SVS "Arctic Sea Ice Minimum 2026" (https://svs.gsfc.nasa.gov/5677/) as sound. Building started Sat Nov 14, after the 10:00 am ET start time in the rules.

Run locally: any static server that supports byte ranges, for example `npx http-server -p 8123`, then open http://localhost:8123/. Sound settings: `config.js`. Submission draft: `SUBMISSION.md`.

## Plan
- Visuals to sound in the browser (Web Audio), one NASA visualization to start, more if time allows.
- Accessible: full keyboard control, screen-reader descriptions of what is playing, a downloadable audio file per visualization.
- Static site, no server. Hosted on GitHub Pages from `main`.
- Sound mapping choices (scale, which data drives which sound) are Checo's; the code keeps them in one config file.

## Deadline
Global submission: Sun Nov 15, 11:59 pm ET. Needs a project page, a demo, and a statement of how AI tools were used.
