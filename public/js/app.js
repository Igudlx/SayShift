import { PRESETS, SAMPLE_RATE, MAX_SECONDS, rms, peak } from './dsp.js';
import { FORMATS, defaultFormat, exportAudio, decodeWithFFmpeg } from './codecs.js';

const $ = id => document.getElementById(id);
const sliders = ['speed','pitch','texture','clarity','assist','formant','drive','space','gate'];
const state = {source:null, result:null, preset:'signature', busy:false, loading:false, exporting:false, active:'remix', stale:false, player:null, offset:0, started:0, loop:false, generation:null, context:null, gain:null, playRequest:0};
const phrases = [
  'I used to be a sound. Now I have something to say.',
  'Child Games presents: the world’s most talkative sound effect.',
  'Breaking news. Your refrigerator has learned to speak.',
  'I have no mouth, and yet, here we are.',
  'This beat has been trying to reach you about your car’s extended warranty.',
  'Beep boop. I am definitely a very normal human being.',
  'Turn up the weird. We are just getting started.'
];
function time(seconds) { if (!Number.isFinite(seconds)) return '0:00'; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`; }
function durationLabel(seconds) {return `${seconds.toFixed(1)} s`;}
function message(text, success = false) { $('message').textContent = text; $('message').className = `message${success ? ' success' : ''}`; $('message').hidden = !text; }
let toastTimer;
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3600); }
function markStale() { if (!state.result) return; state.stale = true; $('result-badge').textContent = 'CHANGED · CREATE AGAIN TO UPDATE'; }
function settings() { return Object.fromEntries([...sliders,'bands'].map(id => [id,Number($(id).value)])); }
function updateControls() {
  const locked = state.busy || state.loading || state.exporting;
  $('create-button').disabled = locked || !state.source || !$('script-text').value.trim();
  $('create-button').textContent = state.busy ? 'Making it talk…' : 'Make it talk';
  if (!state.busy) $('create-button').insertAdjacentHTML('beforeend', '<svg aria-hidden="true"><use href="#i-arrow"/></svg>');
  $('ready-dot').style.background = state.source ? 'var(--accent)' : '#5b6555';
  $('create-hint').textContent = state.loading ? 'Reading your sound…' : state.busy ? 'Your sound is finding its voice' : state.exporting ? 'Preparing your download…' : state.source ? 'Ready for a little audio alchemy' : 'Add a sound to get started';
  for (const element of document.querySelectorAll('#file-input,#drop-zone,#replace-file,#clear-source,[data-demo],[data-preset],#script-text,#voice,#bands,#reset-settings,#surprise-text,#trim-start,#trim-end,.settings input')) element.disabled = locked;
  $('download-button').disabled = locked || !state.result;
  $('export-format').disabled = locked;
  for (const b of document.querySelectorAll('[data-track]')) b.disabled = state.exporting;
  $('preview-source').disabled = locked;
}
function updateSlider(id) {
  const v = Number($(id).value), suffix = id === 'speed' ? ' WPM' : id === 'formant' ? ' st' : id === 'pitch' ? '' : '%';
  $(`${id}-value`).textContent = `${v > 0 && id === 'formant' ? '+' : ''}${v}${suffix}`;
  $(id).style.background = `linear-gradient(to right,var(--accent) ${100 * (v - Number($(id).min)) / (Number($(id).max) - Number($(id).min))}%,#3c4a32 0)`;
}
function setPreset(name, changed = true) {
  state.preset = name;
  for (const [key,value] of Object.entries(PRESETS[name])) if ($(key)) $(key).value = value;
  for (const id of sliders) updateSlider(id);
  document.querySelectorAll('[data-preset]').forEach(b => { const active = b.dataset.preset === name; b.classList.toggle('active',active); b.setAttribute('aria-pressed',active); });
  $('preset-label').textContent = `${PRESETS[name].name} settings`;
  if (changed) markStale();
}
async function context() {
  if (!state.context) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('This browser does not support Web Audio. Try a recent Chrome, Edge, Firefox, or Safari.');
    state.context = new AudioCtx({sampleRate:SAMPLE_RATE});
    state.gain = state.context.createGain(); state.gain.gain.value = Number($('volume').value) / 100;
    state.gain.connect(state.context.destination);
  }
  if (state.context.state === 'suspended') await state.context.resume();
  return state.context;
}
async function monoFromBuffer(buffer) {
  const length = Math.round(buffer.duration * SAMPLE_RATE);
  if (buffer.sampleRate === SAMPLE_RATE) {
    const out = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) { const samples = buffer.getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += samples[i] / buffer.numberOfChannels; }
    // Avoid total cancellation in out-of-phase stereo sources.
    if (rms(out) < .00001 && rms(buffer.getChannelData(0)) > .0001) out.set(buffer.getChannelData(0));
    return out;
  }
  const offline = new OfflineAudioContext(1,length,SAMPLE_RATE), input = offline.createBufferSource(); input.buffer = buffer; input.connect(offline.destination); input.start();
  return (await offline.startRendering()).getChannelData(0).slice();
}
async function loadFile(file) {
  if (!file || state.busy || state.loading || state.exporting) return;
  if (file.size > 60 * 1024 * 1024) {message('This file is bigger than 60 MB. Trim or compress it and try again.'); return;}
  if (!file.size) {message('That file is empty. Choose an audio file with sound in it.'); return;}
  stop(); state.loading = true; updateControls(); message('Reading your audio…');
  try {
    const ctx = await context();
    let buffer;
    try { buffer = await ctx.decodeAudioData(await file.arrayBuffer()); }
    catch { buffer = await ctx.decodeAudioData(await decodeWithFFmpeg(file, text => message(text))); }
    if (buffer.duration > 600) throw new Error('Keep your source under 10 minutes. You only need a short section for it to loop.');
    const samples = await monoFromBuffer(buffer);
    if (samples.length < SAMPLE_RATE * .04) throw new Error('Choose a clip at least 0.04 seconds long.');
    if (rms(samples) < .00001) throw new Error('This file is silent. Try a source with audible sound.');
    setSource({samples,name:file.name,bytes:file.size,format:defaultFormat(file.name),originalRate:buffer.sampleRate,channels:buffer.numberOfChannels,demo:false});
    const ext = file.name.split('.').pop().toLowerCase();
    const fallback = defaultFormat(file.name) === 'wav' && !['wav','wave'].includes(ext);
    $('format-note').textContent = fallback ? 'This source format has no matching export option; WAV was selected. Choose any format below.' : `Default download: ${defaultFormat(file.name).toUpperCase()}, matching your source. Change it anytime.`;
    message('');
  } catch (error) { message(error.message || 'Could not open that audio file. Try WAV or MP3.'); }
  finally { state.loading = false; $('file-input').value = ''; updateControls(); }
}
function setSource(source) {
  state.source = source; markStale();
  $('drop-zone').hidden = true; $('source-loaded').hidden = false;
  $('file-name').textContent = source.name;
  $('file-meta').textContent = `${durationLabel(source.samples.length / SAMPLE_RATE)} · ${source.format.toUpperCase()} · ${(source.bytes / (1024 * 1024)).toFixed(2)} MB`;
  $('source-time').textContent = time(source.samples.length / SAMPLE_RATE);
  $('trim-start').value = '0'; $('trim-end').value = String(source.samples.length / SAMPLE_RATE);
  $('trim-start').max = $('trim-end').max = source.samples.length / SAMPLE_RATE;
  $('export-format').value = source.format;
  document.querySelectorAll('[data-demo]').forEach(b => b.classList.toggle('selected', b.dataset.demo === source.demo));
  requestAnimationFrame(() => drawWave($('source-canvas'),source.samples));
}
function demo(type) {
  if (state.busy || state.loading || state.exporting) return;
  stop();
  const samples = new Float32Array(SAMPLE_RATE * 3); let seed = 37137, low = 0;
  const notes = type === 'bass' ? [65.406,65.406,77.782,58.27] : [130.81,164.81,196,174.61];
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE, note = notes[Math.floor(t * 4) % notes.length];
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 2147483648 - 1;
    if (type === 'noise') {low = low * .86 + noise * .14; samples[i] = noise * .20 + low * .4;}
    else {
      const f = type === 'bass' ? note : note * .5;
      const saw = 2 * ((t * f) % 1) - 1, second = 2 * ((t * f * 1.008) % 1) - 1;
      samples[i] = (saw * .21 + second * .13 + noise * .025) * (.7 + .3 * Math.sin(t * Math.PI * 2 * 2));
    }
  }
  setSource({samples,name:`${{synth:'Analog synth',bass:'Electric bass',noise:'Textured noise'}[type]}.wav`,bytes:samples.length * 2 + 44,format:'wav',channels:1,originalRate:SAMPLE_RATE,demo:type});
  $('format-note').textContent = 'Demo sources default to WAV. Pick MP3 or any other format below.';
  message(''); updateControls();
}
function drawWave(canvas,data) {
  if (!data || !canvas) return;
  const width = canvas.getBoundingClientRect().width;
  if (!width) return;
  const height = canvas.getBoundingClientRect().height, dpr = Math.min(2,devicePixelRatio || 1);
  canvas.width = width * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr); ctx.clearRect(0,0,width,height);
  ctx.strokeStyle = '#2c3b22'; ctx.lineWidth = .5;
  for (let x = 0; x < width; x += width / 8) {ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();
  const bars = Math.max(1,Math.floor(width / 4)), block = Math.max(1,Math.floor(data.length / bars)), p = Math.max(.01,peak(data));
  const gradient = ctx.createLinearGradient(0,0,width,0); gradient.addColorStop(0,'#789b4b');gradient.addColorStop(.45,'#d0f593');gradient.addColorStop(1,'#a5d663');ctx.fillStyle = gradient;
  for (let b = 0; b < bars; b++) {
    let max = 0;
    for (let i = b * block; i < Math.min(data.length,(b + 1) * block); i++) max = Math.max(max,Math.abs(data[i]));
    const h = Math.max(2,Math.pow(max / p,.72) * height * .79);
    ctx.fillRect(b * 4 + 1,(height - h)/2,2,h);
  }
}
function runWorker(url, payload, job, onProgress = () => {}) {
  return new Promise((resolve,reject) => {
    const worker = new Worker(new URL(url,import.meta.url), url.includes('render-') ? {type:'module'} : {});
    let settled = false;
    const finish = (fn,value) => {if (settled) return;settled = true;clearTimeout(timer);worker.terminate();job.cancelers.delete(cancel);fn(value);};
    const cancel = () => finish(reject,new DOMException('Cancelled','AbortError'));
    const timer = setTimeout(() => finish(reject,new Error('This render took too long. Try a shorter phrase or fewer bands.')),90000);
    job.cancelers.add(cancel);
    worker.onmessage = ({data}) => {if (data.type === 'progress') onProgress(data.progress);else if (data.type === 'done') finish(resolve,data);else if (data.type === 'error') finish(reject,new Error(data.message));};
    worker.onerror = event => {event.preventDefault();finish(reject,new Error('The audio worker could not run. Check that the js and vendor folders are deployed together.'));};
    worker.postMessage(payload);
  });
}
function progress(label, amount) { $('render-label').textContent = label; $('render-progress').value = amount; }
function trimSpeech(samples) {
  let end = samples.length - 1;
  while (end > 0 && Math.abs(samples[end]) < .0002) end--;
  return samples.slice(0,Math.min(samples.length,end + Math.floor(SAMPLE_RATE * .16)));
}
async function create() {
  if (state.busy || state.loading || state.exporting || !state.source) return;
  const text = $('script-text').value.trim();
  if (!text) {message('Give your sound a few words first.');return;}
  const source = state.source, params = settings(), voice = $('voice').value;
  const startSeconds = Number($('trim-start').value), endSeconds = Number($('trim-end').value);
  const start = Math.round(startSeconds * SAMPLE_RATE), end = Math.round(endSeconds * SAMPLE_RATE);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || start < 0 || end > source.samples.length || end - start < SAMPLE_RATE * .04) {message('Set a valid loop section with at least 0.04 seconds between start and end.');return;}
  stop(); state.busy = true; state.generation = {cancelers:new Set(),cancelled:false};
  const job = state.generation;
  updateControls();message('');$('render-status').hidden = false;progress('Giving the words a voice…',.04);
  try {
    const ctx = await context();
    const {wav} = await runWorker('./speech-worker.js',{text,voice,pitch:params.pitch,speed:params.speed},job);
    if (job.cancelled) throw new DOMException('Cancelled','AbortError');
    progress('Reading the speech shape…',.2);
    const guide = trimSpeech(await monoFromBuffer(await ctx.decodeAudioData(wav)));
    if (job.cancelled) throw new DOMException('Cancelled','AbortError');
    if (guide.length > SAMPLE_RATE * MAX_SECONDS) throw new Error('The spoken result is over 3 minutes. Shorten the text or increase speaking speed.');
    progress('Teaching your sound to talk…',.26);
    const {samples} = await runWorker('./render-worker.js',{carrier:source.samples,speech:guide,settings:params,start,end},job, p => progress(`Shaping ${params.bands} frequency bands… ${Math.round(p * 100)}%`,.26 + p * .72));
    if (job.cancelled) throw new DOMException('Cancelled','AbortError');
    state.result = {remix:samples,guide,source:source.samples.slice(start,end),text,sourceName:source.name,sourceFormat:source.format,settings:params,preset:state.preset,voice,seconds:samples.length/SAMPLE_RATE,loops:Math.ceil(samples.length / Math.max(1,end - start - Math.min(Math.floor((end-start)*.08),480)))};
    state.stale = false;state.offset = 0;state.active = 'remix';
    $('result-empty').hidden = true;$('result-content').hidden = false;$('result-badge').textContent = 'READY TO MAKE SOME NOISE';
    refreshTrack();progress('Your sound has something to say.',1);
    toast('Your talking remix is ready. Press play.');
    $('result-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'nearest'});
  } catch (error) {if (error.name === 'AbortError') message('Render cancelled. Your previous result is still available.');else message(error.message || 'The sound could not be generated. Try a different source.');}
  finally {job.cancelers.forEach(cancel => cancel());state.busy = false;state.generation = null;$('render-status').hidden = true;updateControls();}
}
function trackData() {return state.result?.[state.active] || null;}
function refreshTrack() {
  const data = trackData();if (!data) return;
  document.querySelectorAll('[data-track]').forEach(b => {const active = b.dataset.track === state.active;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  $('track-description').textContent = {remix:'Your talking remix',guide:'Plain text-to-speech guide',source:'Original selected source section'}[state.active];
  const r = state.result;
  $('result-details').textContent = `${durationLabel(data.length/SAMPLE_RATE)} · 24 kHz mono · ${state.active === 'remix' ? `${r.settings.bands} bands · source ${r.loops === 1 ? 'used once' : `looped ×${r.loops}`}` : state.active === 'guide' ? 'Unprocessed guide voice' : 'Before vocoder processing'}`;
  $('wave-midpoint').textContent = time(data.length/SAMPLE_RATE/2);$('wave-duration').textContent = time(data.length/SAMPLE_RATE);
  requestAnimationFrame(() => {drawWave($('result-canvas'),data);updatePlayhead();});
}
function currentOffset() {
  if (!state.player) return state.offset;
  const position = state.offset + (state.context.currentTime - state.started) * Number($('playback-speed').value);
  const duration = state.playData.length / SAMPLE_RATE;
  return state.playLoop ? position % duration : Math.min(duration,position);
}
function setPlayIcon(playing) { $('play-button').setAttribute('aria-label',playing ? 'Pause audio' : 'Play audio');$('play-button').innerHTML = `<svg aria-hidden="true"><use href="#i-${playing ? 'pause' : 'play'}"/></svg>`;$('preview-source').innerHTML = `<svg aria-hidden="true"><use href="#i-${playing && state.previewing ? 'pause' : 'play'}"/></svg>${playing && state.previewing ? 'Stop preview' : 'Preview source'}`; }
function stop(reset = true) {
  state.playRequest++;
  const at = currentOffset();
  if (state.player) {state.player.onended = null;try {state.player.stop();}catch{}state.player.disconnect();state.player = null;}
  state.offset = reset ? 0 : at;state.previewing = false;setPlayIcon(false);updatePlayhead();
}
async function startPlayback(data,preview = false) {
  if (!data) return;
  const request = ++state.playRequest;
  try {
    const ctx = await context();
    if (request !== state.playRequest) return;
    const buffer = ctx.createBuffer(1,data.length,SAMPLE_RATE);buffer.copyToChannel(data,0);
    const source = ctx.createBufferSource();source.buffer = buffer;source.connect(state.gain);
    source.playbackRate.value = Number($('playback-speed').value);
    source.loop = !preview && state.loop;
    if (state.offset >= buffer.duration || preview) state.offset = 0;
    state.playData = data;state.playLoop = source.loop;state.previewing = preview;state.started = ctx.currentTime;state.player = source;
    source.onended = () => {if (state.player !== source) return;state.player = null;state.offset = 0;state.previewing = false;source.disconnect();setPlayIcon(false);updatePlayhead();};
    source.start(0,state.offset);setPlayIcon(true);
  } catch (error) {message(error.message || 'Audio playback failed. Try the download instead.');}
}
function updatePlayhead() {
  const data = trackData(); if (!data) return;
  const duration = data.length / SAMPLE_RATE, position = state.previewing ? 0 : Math.min(duration,currentOffset());
  $('playback-time').innerHTML = `${time(position)} <span>/ ${time(duration)}</span>`;
  $('seek').value = duration ? position / duration * 1000 : 0;$('playhead').style.left = `${duration ? position/duration * 100 : 0}%`;
}
function tick() {if (state.player && !document.hidden) updatePlayhead();requestAnimationFrame(tick);}
async function download() {
  if (!state.result || state.exporting || state.busy || state.loading) return;
  const samples = trackData(), format = $('export-format').value, active = state.active;
  state.exporting = true;updateControls();$('export-status').hidden = false;$('export-status').textContent = 'Preparing your audio…';
  try {
    const blob = await exportAudio(samples,format,text => $('export-status').textContent = text);
    const name = state.result.text.slice(0,42).replace(/[^a-z0-9 _-]/gi,'').trim().replace(/\s+/g,'-').toLowerCase() || 'my-sound';
    const link = document.createElement('a'), url = URL.createObjectURL(blob);link.href = url;link.download = `sayshift-${active}-${name}.${FORMATS[format].ext}`;document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url),60000);
    $('export-status').textContent = `Ready: ${format.toUpperCase()} · ${(blob.size/1024).toFixed(0)} KB. Your download has started.`;
    toast(`${format.toUpperCase()} download ready.`);
  } catch (error) {$('export-status').textContent = error.message || 'Export failed. Try WAV, which needs no converter.';}
  finally {state.exporting = false;updateControls();}
}

$('drop-zone').addEventListener('click',() => $('file-input').click());$('replace-file').addEventListener('click',() => $('file-input').click());
$('file-input').addEventListener('change',event => loadFile(event.target.files[0]));
const drop = $('drop-zone');
for (const name of ['dragenter','dragover']) drop.addEventListener(name,event => {event.preventDefault();if (!drop.disabled) drop.classList.add('dragging');});
for (const name of ['dragleave','drop']) drop.addEventListener(name,event => {event.preventDefault();drop.classList.remove('dragging');});
drop.addEventListener('drop',event => loadFile(event.dataTransfer.files[0]));
document.addEventListener('dragover',event => {if (event.dataTransfer.types.includes('Files')) event.preventDefault();});
document.addEventListener('drop',event => {if (event.dataTransfer.types.includes('Files')) event.preventDefault();});
document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click',() => demo(button.dataset.demo)));
$('clear-source').addEventListener('click',() => {stop();state.source = null;$('drop-zone').hidden = false;$('source-loaded').hidden = true;document.querySelectorAll('[data-demo]').forEach(b => b.classList.remove('selected'));markStale();updateControls();});
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click',() => setPreset(button.dataset.preset)));
$('reset-settings').addEventListener('click',() => setPreset('signature'));
for (const id of sliders) $(id).addEventListener('input',() => {updateSlider(id);state.preset = 'custom';$('preset-label').textContent = 'Your custom mix';document.querySelectorAll('[data-preset]').forEach(b => {b.classList.remove('active');b.setAttribute('aria-pressed','false');});markStale();});
for (const id of ['voice','bands','trim-start','trim-end']) $(id).addEventListener('change',markStale);
$('script-text').addEventListener('input',() => {$('char-count').textContent = `${$('script-text').value.length} / 1200`;markStale();updateControls();});
$('script-text').addEventListener('keydown',event => {if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {event.preventDefault();create();}});
$('surprise-text').addEventListener('click',() => {const candidates = phrases.filter(p => p !== $('script-text').value);$('script-text').value = candidates[Math.floor(Math.random()*candidates.length)];$('script-text').dispatchEvent(new Event('input'));});
$('create-button').addEventListener('click',create);
$('cancel-render').addEventListener('click',() => {if (state.generation) {state.generation.cancelled = true;state.generation.cancelers.forEach(cancel => cancel());}});
$('preview-source').addEventListener('click',async () => {if (state.previewing) {stop();return;}stop();await startPlayback(state.source?.samples,true);});
$('play-button').addEventListener('click',async () => {if (state.player && !state.previewing) {stop(false);return;}if (state.previewing) stop();await startPlayback(trackData());});
$('stop-button').addEventListener('click',() => stop());
document.querySelectorAll('[data-track]').forEach(button => button.addEventListener('click',() => {stop();state.active = button.dataset.track;refreshTrack();$('export-status').hidden = true;}));
$('seek').addEventListener('input',async () => {const fraction = Number($('seek').value)/1000;const playing = !!state.player && !state.previewing;stop();const data = trackData();if (!data) return;state.offset = fraction * data.length/SAMPLE_RATE;updatePlayhead();if (playing) await startPlayback(data);});
$('volume').addEventListener('input',() => {if (state.gain) state.gain.gain.setTargetAtTime(Number($('volume').value)/100,state.context.currentTime,.025);});
$('playback-speed').addEventListener('change',async () => {if (!state.player) return;const data = state.playData, preview = state.previewing;const oldRate = state.player.playbackRate.value;const duration = data.length/SAMPLE_RATE;const position = state.offset + (state.context.currentTime-state.started)*oldRate;stop();state.offset = state.playLoop ? position%duration : Math.min(duration,position);await startPlayback(data,preview);});
$('loop-result').addEventListener('click',() => {state.loop = !state.loop;$('loop-result').setAttribute('aria-pressed',state.loop);if (state.player && !state.previewing) {state.offset = currentOffset();state.started = state.context.currentTime;state.player.loop = state.loop;state.playLoop = state.loop;}});
$('download-button').addEventListener('click',download);
$('export-format').addEventListener('change',() => {$('format-note').textContent = `Download as ${$('export-format').value.toUpperCase()}. This applies to the selected audio tab.`;$('export-status').hidden = true;});
const observer = new ResizeObserver(() => {if (state.source) drawWave($('source-canvas'),state.source.samples);if (state.result) drawWave($('result-canvas'),trackData());});
observer.observe($('source-canvas'));observer.observe($('result-canvas'));
window.addEventListener('pagehide',() => {stop();state.generation?.cancelers.forEach(cancel => cancel());});
setPreset('signature',false);$('char-count').textContent = `${$('script-text').value.length} / 1200`;updateControls();tick();
