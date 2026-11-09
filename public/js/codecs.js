import { encodeWav, SAMPLE_RATE } from './dsp.js';

export const FORMATS = {
  wav: {mime:'audio/wav', ext:'wav', args:[]},
  mp3: {mime:'audio/mpeg', ext:'mp3', args:['-c:a','libmp3lame','-b:a','192k']},
  flac: {mime:'audio/flac', ext:'flac', args:['-c:a','flac','-compression_level','5']},
  ogg: {mime:'audio/ogg', ext:'ogg', args:['-c:a','libvorbis','-q:a','5']},
  opus: {mime:'audio/ogg; codecs=opus', ext:'opus', args:['-c:a','libopus','-b:a','128k','-ar','48000']},
  m4a: {mime:'audio/mp4', ext:'m4a', args:['-c:a','aac','-b:a','192k','-movflags','+faststart']},
  aac: {mime:'audio/aac', ext:'aac', args:['-c:a','aac','-b:a','192k','-f','adts']},
  webm: {mime:'audio/webm', ext:'webm', args:['-c:a','libopus','-b:a','128k','-ar','48000','-f','webm']},
  aiff: {mime:'audio/aiff', ext:'aiff', args:['-c:a','pcm_s16be','-f','aiff']},
  wma: {mime:'audio/x-ms-wma', ext:'wma', args:['-c:a','wmav2','-b:a','128k','-ar','44100','-f','asf']}
};
export function defaultFormat(filename = '') {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {aif:'aiff', aifc:'aiff', wave:'wav', mp4:'m4a', m4b:'m4a', oga:'ogg', mpeg:'mp3', mpga:'mp3'};
  const format = map[ext] || ext;
  return Object.hasOwn(FORMATS, format) ? format : 'wav';
}
let engine, loading;
async function getEngine(onStatus) {
  if (engine?.loaded) return engine;
  if (!loading) {
    loading = (async () => {
      onStatus('Loading the local format converter (31 MB, first time only)…');
      const {FFmpeg} = await import('../vendor/ffmpeg/ffmpeg/classes.js');
      engine = new FFmpeg();
      await engine.load({
        coreURL:new URL('../vendor/ffmpeg/core/ffmpeg-core.js', import.meta.url).href,
        wasmURL:new URL('../vendor/ffmpeg/core/ffmpeg-core.wasm', import.meta.url).href
      });
      return engine;
    })().catch(error => { loading = null; engine?.terminate(); engine = null; throw new Error(`The converter could not load. WAV downloads still work. ${error.message || ''}`); });
  }
  return loading;
}
let sequence = 0;
export async function exportAudio(samples, format, onStatus = () => {}, sampleRate = SAMPLE_RATE) {
  if (!FORMATS[format]) throw new Error('Choose a supported download format.');
  const wav = new Uint8Array(encodeWav(samples, sampleRate));
  if (format === 'wav') return new Blob([wav], {type:FORMATS.wav.mime});
  const ff = await getEngine(onStatus), id = ++sequence, input = `input-${id}.wav`, output = `output-${id}.${FORMATS[format].ext}`;
  const onProgress = ({progress}) => onStatus(`Encoding ${format.toUpperCase()}… ${Math.min(99, Math.max(0, Math.floor(progress * 100)))}%`);
  ff.on('progress', onProgress);
  try {
    onStatus(`Encoding ${format.toUpperCase()} on your device…`);
    await ff.writeFile(input, wav);
    const code = await ff.exec(['-y','-hide_banner','-loglevel','error','-i',input,'-map_metadata','-1','-vn',...FORMATS[format].args,output], 120000);
    if (code !== 0) throw new Error(`Could not encode ${format.toUpperCase()}. Try WAV or MP3.`);
    const bytes = await ff.readFile(output);
    return new Blob([bytes], {type:FORMATS[format].mime});
  } finally {
    ff.off('progress', onProgress);
    for (const file of [input, output]) { try { await ff.deleteFile(file); } catch {} }
  }
}

export async function decodeWithFFmpeg(file, onStatus = () => {}) {
  const ff = await getEngine(onStatus), id = ++sequence;
  const extension = file.name.split('.').pop().replace(/[^a-z0-9]/gi, '').slice(0,8) || 'audio';
  const input = `decode-${id}.${extension}`, output = `decoded-${id}.wav`;
  try {
    onStatus('Decoding this file with the local format converter…');
    await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    const code = await ff.exec(['-y','-hide_banner','-loglevel','error','-i',input,'-vn','-t','601','-ac','1','-ar',String(SAMPLE_RATE),'-c:a','pcm_s16le',output], 120000);
    if (code !== 0) throw new Error('This file could not be decoded. Try converting it to WAV or MP3 first.');
    const bytes = await ff.readFile(output);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } finally {
    for (const item of [input, output]) { try { await ff.deleteFile(item); } catch {} }
  }
}
