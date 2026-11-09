import { cp, mkdir, rm, stat } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
for (const file of ['public/index.html', 'public/vendor/mespeak/engine.js', 'public/vendor/ffmpeg/core/ffmpeg-core.wasm']) {
  await stat(new URL(file, root));
}
await rm(new URL('dist/', root), { recursive: true, force: true });
await mkdir(new URL('dist/', root), { recursive: true });
await cp(new URL('public/', root), new URL('dist/', root), { recursive: true });
console.log('SayShift is ready in dist/. No dependencies or API keys required.');
