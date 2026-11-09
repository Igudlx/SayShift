import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FFT, renderVocoder, encodeWav, rms, peak, loopSample, SAMPLE_RATE, PRESETS } from '../public/js/dsp.js';
import { defaultFormat, FORMATS } from '../public/js/codecs.js';

test('FFT inverse reconstructs a signal', () => {
  const n=2048, fft=new FFT(n), real=Float64Array.from({length:n},(_,i)=>Math.sin(i*.177)+.2*Math.cos(i*.03)), original=real.slice(), imag=new Float64Array(n);
  fft.transform(real,imag);fft.transform(real,imag,true);
  assert.ok(real.every((v,i)=>Math.abs(v-original[i])<1e-10));
});
test('WAV is a valid mono 16-bit PCM file with the correct duration', () => {
  const audio=Float32Array.from([-2,-1,-.25,0,.25,1,2]), buffer=encodeWav(audio), view=new DataView(buffer);
  assert.equal(Buffer.from(buffer).subarray(0,4).toString(),'RIFF');
  assert.equal(view.getUint32(24,true),SAMPLE_RATE);assert.equal(view.getUint32(40,true),14);
  assert.equal(view.getInt16(44,true),-32768);assert.equal(view.getInt16(56,true),32767);
});
test('default exports follow the uploaded extension, with explicit aliases', () => {
  for (const ext of Object.keys(FORMATS)) assert.equal(defaultFormat(`my.track.${ext.toUpperCase()}`),ext);
  assert.equal(defaultFormat('music.mp4'),'m4a');assert.equal(defaultFormat('sound.aif'),'aiff');assert.equal(defaultFormat('unusual.caf'),'wav');
});
test('short carrier loops for the complete guide duration, without clipping', () => {
  const carrier=Float32Array.from({length:2400},(_,i)=>.2*(2*((i*140/SAMPLE_RATE)%1)-1));
  const speech=Float32Array.from({length:SAMPLE_RATE*2},(_,i)=>i<12000||i>18000 ? .2*Math.sin(i*2*Math.PI*210/SAMPLE_RATE)*(1+.4*Math.sin(i*.005)):0);
  const result=renderVocoder({carrier,speech,settings:PRESETS.signature});
  assert.equal(result.length,speech.length);assert.ok(rms(result.subarray(24000))>.01);
  assert.ok(result.every(Number.isFinite));assert.ok(peak(result)<=.941);assert.ok(rms(result.subarray(13000,17000))<rms(result.subarray(24000))*.25);
  assert.equal(result[0],0);assert.equal(result.at(-1),0);
  assert.equal(loopSample(carrier,13000),loopSample(carrier,13000+(carrier.length-Math.min(Math.floor(carrier.length*.08),480))));
});
test('silence and invalid source sections fail with actionable errors', () => {
  const speech=new Float32Array(3000).fill(.1),carrier=new Float32Array(3000);
  assert.throws(()=>renderVocoder({carrier,speech,settings:PRESETS.pure}),/silent/);
  carrier.fill(.2);assert.throws(()=>renderVocoder({carrier,speech,settings:PRESETS.pure,start:0,end:40}),/at least/);
});
test('the bundled TTS generates real PCM WAV without external services', () => {
  const ctx=vm.createContext({console:{log(){},warn(){}},setTimeout,clearTimeout,atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64')});
  vm.runInContext(readFileSync(new URL('../public/vendor/mespeak/engine.js',import.meta.url),'utf8'),ctx,{timeout:15000});
  ctx.meSpeak.loadConfig(JSON.parse(readFileSync(new URL('../public/vendor/mespeak/config.json',import.meta.url),'utf8')));
  ctx.meSpeak.loadVoice(JSON.parse(readFileSync(new URL('../public/vendor/mespeak/voices/en/en-us.json',import.meta.url),'utf8')));
  const wav=ctx.meSpeak.speak('This sound can talk.',{rawdata:true,speed:165,pitch:50,voice:'en/en-us'});
  assert.ok(wav.byteLength>24000);assert.equal(Buffer.from(wav).subarray(0,4).toString(),'RIFF');
  assert.ok(Buffer.from(wav).subarray(44).some(v=>v>0));
});
