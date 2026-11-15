// Ashworks: Ember Yard — the hand-in program for threejs-fps-02.
//
// The game itself is the static site under game/ (ES modules, vendored
// three.js 0.187.0, no build step). This program copies game/ and
// screenshots/ into the output directory and writes dossier.json with the
// kit's buildDossier, so the dossier is exactly the one the scorer rebuilds.
// Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// Caps mirror the gate's own limits (reference/gate.json): the dossier text
// is cut at 160 KiB, screenshots at 4 files of 256 KiB, game/ at 993 entries
// and 48 MiB.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
