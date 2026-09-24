// Converte le immagini PNG in AVIF + WebP a due larghezze.
// Uso: npm run images
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const SRC = join('assets', 'images');
const OUT = join('public', 'images');
const WIDTHS = [1600, 800];
// il lifestyle va a tutto schermo: su retina serve una variante più grande
const EXTRA = { lifestyle: [2400] };
// anchor.png è solo il riferimento di forma per il flacone 3D: non va pubblicata
const SKIP = new Set(['anchor']);

mkdirSync(OUT, { recursive: true });

const run = (args) => {
  const res = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

for (const file of readdirSync(SRC).filter((f) => extname(f) === '.png')) {
  const name = basename(file, '.png');
  if (SKIP.has(name)) continue;
  const input = join(SRC, file);

  for (const w of [...(EXTRA[name] ?? []), ...WIDTHS]) {
    const scale = `scale=${w}:-2:flags=lanczos`;
    const webp = join(OUT, `${name}-${w}.webp`);
    const avif = join(OUT, `${name}-${w}.avif`);

    run(['-i', input, '-vf', scale, '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', webp]);
    run([
      '-i', input, '-vf', `${scale},format=yuv420p10le`,
      '-c:v', 'libaom-av1', '-still-picture', '1', '-crf', '30', '-cpu-used', '4', avif,
    ]);

    const kb = (p) => (statSync(p).size / 1024).toFixed(0);
    console.log(`${name}-${w}: webp ${kb(webp)} KB, avif ${kb(avif)} KB`);
  }
}
