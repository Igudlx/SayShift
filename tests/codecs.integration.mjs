// Exercises the exact bundled WebAssembly core, outside a browser.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import createCore from '../public/vendor/ffmpeg/core/ffmpeg-core.js';
import { encodeWav, SAMPLE_RATE } from '../public/js/dsp.js';
import { FORMATS } from '../public/js/codecs.js';
globalThis.self = {location:{href:new URL('../public/vendor/ffmpeg/core/ffmpeg-core.js',import.meta.url).href}};
const core = await createCore({wasmBinary:await readFile(new URL('../public/vendor/ffmpeg/core/ffmpeg-core.wasm',import.meta.url))});
const logs=[];
core.setLogger(({message})=>logs.push(message));
const samples=Float32Array.from({length:SAMPLE_RATE},(_,i)=>.2*Math.sin(i*2*Math.PI*440/SAMPLE_RATE));
core.FS.writeFile('input.wav',new Uint8Array(encodeWav(samples)));
for (const [format,info] of Object.entries(FORMATS)) {
  if(format==='wav') continue;
  const output=`output.${info.ext}`;logs.length=0;
  core.exec('-y','-hide_banner','-loglevel','error','-i','input.wav','-map_metadata','-1','-vn',...info.args,output);
  assert.equal(core.ret,0,`${format} encode failed: ${logs.join('\n')}`);core.reset();
  assert.ok(core.FS.readFile(output).length>100,`${format} is empty`);
  core.exec('-y','-hide_banner','-loglevel','error','-i',output,'-ac','1','-ar',String(SAMPLE_RATE),'-c:a','pcm_s16le','roundtrip.wav');
  assert.equal(core.ret,0,`${format} decode failed: ${logs.join('\n')}`);core.reset();
  const bytes=core.FS.readFile('roundtrip.wav');
  assert.ok(bytes.length>40000 && bytes.length<70000,`${format} has an unexpected duration`);
  core.FS.unlink(output);core.FS.unlink('roundtrip.wav');
  console.log(`PASS ${format.toUpperCase()} encode + decode`);
}
console.log('All bundled export codecs passed.');
