// Precompute the feature track for each visualization, so sound-only mode and
// the WAV render start instantly. Uses the same analysis code as the page.
//   python3 -m http.server 8123   (in the repo root, in another terminal)
//   node tools/build-features.mjs [http://localhost:8123/]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')); }
import { writeFileSync } from 'node:fs';
import visualizations from '../visualizations.js';

const base = process.argv[2] || 'http://localhost:8123/';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
for (const v of visualizations) {
  await page.goto(base + '#' + v.id);
  const json = await page.evaluate(() => window.__buildFeatures());
  writeFileSync(new URL('../' + v.features, import.meta.url), JSON.stringify(json));
  console.log(v.id, json.frames.length, 'frames');
}
await browser.close();
