# Idea: data oscillator (Eurorack module)

Date: 2026-11-14. Source: Checo, while testing Earth Jukebox on his phone. Transcribed from voice ("URAC", taken to mean Eurorack).

## The idea

An oscillator whose waveform is a dataset. Any data with a cycle in it (a year of lightning, a day of tides, a solar rotation) is played fast enough that one cycle becomes one period of the wave. The data is the timbre. Pitch is how fast time runs.

## Where it came from

Earth Jukebox, built for NASA Space Apps 2026. Six years of lightning seen from the Space Station, one click per flash. Sped up until a year lasts a few milliseconds, the seasonal rise and fall of lightning becomes a tone. Turning the globe changes the timbre, because each side of the Earth has its own seasons. That end of the speed range was the part that held attention. The middle of the range is plain hiss.

## What makes it an oscillator and not a sample player

- One cycle of the data is one period, so it tracks pitch like a wavetable.
- Each year is a different single-cycle wave, so the years are a wavetable to scan. Scanning position is time in the data.
- A second axis is place: which region of the Earth is summed into the wave.
- The loop is only what sustains it. The pitch comes from the cycle in the data.

## As a module

- Inputs: 1V/oct, wavetable position (year), a second position (region or dataset), FM, sync.
- Data loaded from SD card as plain tables. A desktop tool turns a dataset into tables.
- Possible sets: lightning, CO2, sea ice, sea surface temperature, tides, seismic noise, solar wind.
- A slow mode where the same data runs as an LFO or a trigger stream (one event, one trigger). That is the click end of Earth Jukebox.

## Open questions

- Is the difference between datasets audible enough once each is one cycle, or do they all read as "a slightly odd sine"? Lightning has a strong second harmonic near the equator (two rainy seasons a year), which is promising.
- Name.

## Code to start from

`js/dsp.js` and `js/geo.js` in checocadena/earth-jukebox.
