import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { readConverterBinary } from './converter-binary.mjs';
const root = new URL('../', import.meta.url);
for (const file of ['public/index.html', 'public/vendor/mespeak/engine.js', 'vendor-parts/ffmpeg/manifest.json']) {
  await stat(new URL(file, root));
}
const converter = await readConverterBinary();
await rm(new URL('dist/', root), { recursive: true, force: true });
await mkdir(new URL('dist/', root), { recursive: true });
await cp(new URL('public/', root), new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/vendor/ffmpeg/core/ffmpeg-core.wasm', root), converter);
console.log('Reassembled and verified the audio converter from GitHub-friendly parts.');
console.log('SayShift is ready in dist/. No dependencies or API keys required.');
