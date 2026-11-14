# Space Apps 2026 submission: Earth Jukebox

Draft only. Checo submits. Global deadline: Sun Nov 15, 11:59 pm ET.

## Checklist

The Space Apps site (spaceappschallenge.org) was down or refusing connections from this build machine on Sat Nov 14, so the fields below come from the 2025 Project Submission Guide and past years. Open the 2026 submission form and check each field name before pasting.

- [ ] Make the GitHub repo public (needed for the project link and for GitHub Pages). Ask: OK to make it public?
- [ ] Turn on GitHub Pages: repo Settings, Pages, "Deploy from a branch", branch `main`, folder `/ (root)`. Live link will be https://checocadena.github.io/earth-jukebox/
- [ ] Open the live link on your phone and press Play once.
- [ ] Choose the sound settings (scale, root, pitch source, tempo) so the placeholder note can come off.
- [ ] Record the demo video (plan below). The 2025 guide limits it to 30 seconds. Upload to YouTube (unlisted is fine if public link works) or Vimeo. The Space Apps site does not host video, so it needs a public link.
- [ ] Fill in the form: project name, high-level summary, demo link, final project link, project details, use of AI, NASA data, references.
- [ ] Team page: solo team, NYC local event. Local judging is skipped.
- [ ] Do not use the NASA logo or NASA "meatball" on the page or video. Credit NASA data in words.
- [ ] Submit before Sun Nov 15, 11:59 pm ET.

## Project name

Earth Jukebox

## High-level summary

Earth Jukebox plays NASA animations of the planet as music. The first one is NASA's daily view of Arctic sea ice from its largest extent on 15 March 2026 to its smallest on 12 September 2026. The page reads every frame of the animation in the browser, region by region, and turns what it finds into notes: wherever there is sea ice a note sounds, placed in pitch by where the ice is and coloured by how bright it is. A low chord underneath fades as the ice melts. A bell marks each new month. A screen reader hears the date and how much of the visible Earth is covered by ice. It works by keyboard alone, has a sound-only mode, and can save the whole piece as a WAV file. It is made first for blind and low-vision people, who are usually left out of these animations, and it is also a way for anyone to hear a season of melt in under a minute.

## Links

- Demo video: (to add after recording)
- Final project: https://checocadena.github.io/earth-jukebox/ (after Pages is on)
- Code: https://github.com/checocadena/earth-jukebox

## How it works

The page is a single static website with no server. It loads the NASA animation as a video and, on every frame, draws it into a small hidden canvas. The frame is cut into a grid of 8 columns and 5 rows. For each region the code measures the share of sea ice (bluish white), other white such as snow on land, open ocean (dark blue), plus average brightness and colour. Black space around the globe and the burned-in date label are left out.

Sound is made live with the Web Audio API. The player reads one column per beat, left to right, and pans the sound to match, so the picture is swept across the stereo field. Each region with enough ice plays a note from a fixed musical scale, so the result stays in tune. The number of notes per beat follows how much ice is in the column. Brighter ice opens the filter and adds a brighter waveform. A held chord on the root and fifth follows the total ice in view, so it thins out over the season.

Every mapping choice (scale, root, tempo, which feature drives pitch, density, loudness and tone) lives in one file, `config.js`, so it can be changed without touching the rest of the code.

Accessibility:
- Full keyboard control with visible focus. Space plays and pauses, arrow keys move through time and change volume, D describes the current frame, S switches to sound only, W makes the WAV file. Every key also has a button.
- A live region tells screen readers the date, the percent of the visible Earth covered by sea ice and how that changed, where the ice sits in the picture, and which part of the globe is in view. Updates come about every three weeks of animation time and can be turned off.
- Sound-only mode hides the picture and keeps the sound and the descriptions.
- The WAV file is rendered offline with the same sound engine, so the download matches what the page plays. It works for people who want to listen away from the screen or use the piece elsewhere.

## NASA data used

- Arctic Sea Ice Minimum 2026, NASA Scientific Visualization Studio, https://svs.gsfc.nasa.gov/5677/
  - Animator: Trent L. Schindler (USRA). Producer: James Riordon (NASA/GSFC). Scientist: Walt Meier (NASA/GSFC).
  - Sea ice data: AMSR2 10 km daily sea ice concentration and 89 GHz brightness temperature, courtesy of the Japan Aerospace Exploration Agency (JAXA).
  - Land: Blue Marble Next Generation, courtesy of Reto Stockli (NASA/GSFC).
- The video was resized to 960 by 540 for the web. No other changes.

## Space agency partner data

JAXA AMSR2 sea ice data, as used inside the NASA visualization above.

## Use of AI

I used Claude Code (Anthropic), an AI coding assistant, to write most of the code for this project: the frame analysis, the Web Audio sound engine, the WAV export, the keyboard controls and the screen reader descriptions. I also used it to draft this project text, which I then edited. I chose the concept and the NASA visualization, and I made the musical decisions: the scale, the root, which part of the data drives pitch, and the tempo. The sound is made by the code in real time from the NASA video. No AI-generated audio, images, video or voice are used in the project or the demo.

(Checo: edit this to match what you actually did and decided. If the musical settings are still the placeholders when you submit, change the last part.)

## References

- NASA Scientific Visualization Studio, Arctic Sea Ice Minimum 2026: https://svs.gsfc.nasa.gov/5677/
- Web Audio API, MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- NSIDC Arctic Sea Ice News: https://nsidc.org/arcticseaicenews/

## Demo video plan (30 seconds)

Record on Sunday from Oaxaca with your phone's screen recorder, sound on, phone in landscape. Open the live link first so the video is loaded.

| Time | Screen | Voice or caption |
|---|---|---|
| 0 to 4 s | Page title and the globe | "I'm Checo, solo team, Earth Jukebox." |
| 4 to 8 s | Tap Play | "This is NASA's Arctic sea ice for 2026, played as sound." |
| 8 to 20 s | Let it play. The yellow box sweeps the picture. | No voice. Let the music carry it. Optional caption: "Each region with ice plays a note. The low chord fades as the ice melts." |
| 20 to 25 s | Tap Sound only, then Describe now | Let the screen reader or the on-page text show "Sea ice covers 12 percent of the visible Earth". |
| 25 to 30 s | Tap Make WAV file, show the download | "Made for blind and low-vision listeners first. It runs by keyboard and screen reader, and saves a WAV file." |

If the form allows longer than 30 seconds, add 20 seconds of uninterrupted playback from March to September in the middle. Turn on VoiceOver for the "Describe now" part if you can (triple-click the side button if you set that shortcut).
