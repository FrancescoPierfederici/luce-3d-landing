// Estrae le sequenze di frame dai video con ffmpeg.
// Uso: npm run frames            (tutte le sequenze)
//      npm run frames -- hero    (solo una)
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SEQUENCES = ['hero', 'ingredients'];

const PROFILES = {
  // ~150 frame a larghezza nativa (1916px): evito un upscale inutile a 1920
  desktop: { fps: 15, width: 1916, quality: 80 },
  // metà frame, metà risoluzione
  mobile: { fps: 7.5, width: 960, quality: 75 },
};

// ingredients: petali e particelle pesano di più; a 12 fps / q76 è identico a occhio e pesa ~35% in meno
const OVERRIDES = {
  ingredients: { desktop: { fps: 12, quality: 76 }, mobile: { fps: 6, quality: 72 } },
};

const only = process.argv[2];
const targets = only ? SEQUENCES.filter((s) => s === only) : SEQUENCES;

for (const name of targets) {
  const input = join('assets', 'video', `${name}.mp4`);

  for (const [profile, base] of Object.entries(PROFILES)) {
    const { fps, width, quality } = { ...base, ...OVERRIDES[name]?.[profile] };
    const outDir = join('public', 'frames', profile, name);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const args = [
      '-v', 'error', '-y',
      '-i', input,
      '-vf', `fps=${fps},scale=${width}:-2:flags=lanczos`,
      '-c:v', 'libwebp', '-quality', String(quality),
      '-compression_level', '6', '-preset', 'photo',
      join(outDir, '%04d.webp'),
    ];
    const res = spawnSync('ffmpeg', args, { stdio: 'inherit' });
    if (res.status !== 0) process.exit(res.status ?? 1);

    const files = readdirSync(outDir).filter((f) => f.endsWith('.webp')).sort();
    const bytes = files.reduce((sum, f) => sum + statSync(join(outDir, f)).size, 0);

    const probe = spawnSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
      join(outDir, files[0]),
    ], { encoding: 'utf8' });
    const [w, h] = probe.stdout.trim().split(',').map(Number);

    writeFileSync(
      join(outDir, 'manifest.json'),
      JSON.stringify({ count: files.length, width: w, height: h, ext: 'webp', pad: 4 }, null, 2),
    );
    console.log(`${profile}/${name}: ${files.length} frame, ${w}x${h}, ${(bytes / 1048576).toFixed(1)} MB`);
  }
}
