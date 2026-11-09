// SayShift audio processing. Copyright (C) 2026 Child Games. GPL-3.0-or-later.
export const SAMPLE_RATE = 24000;
export const MAX_SECONDS = 180;
export const PRESETS = {
  signature: { name: 'Signature', bands: 48, texture: 70, assist: 26, clarity: 12, formant: 0, pitch: 50, speed: 165, drive: 8, space: 8, gate: 12 },
  clean: { name: 'Clear speech', bands: 64, texture: 45, assist: 48, clarity: 30, formant: 0, pitch: 50, speed: 155, drive: 0, space: 0, gate: 10 },
  robot: { name: 'Robot radio', bands: 24, texture: 85, assist: 42, clarity: 5, formant: 1, pitch: 40, speed: 170, drive: 25, space: 5, gate: 15 },
  monster: { name: 'Bass creature', bands: 48, texture: 75, assist: 30, clarity: 12, formant: -5, pitch: 22, speed: 145, drive: 40, space: 16, gate: 12 },
  dream: { name: 'Dream machine', bands: 64, texture: 55, assist: 40, clarity: 18, formant: 3, pitch: 65, speed: 135, drive: 5, space: 35, gate: 8 },
  pure: { name: 'Pure source', bands: 64, texture: 100, assist: 0, clarity: 0, formant: 0, pitch: 50, speed: 160, drive: 0, space: 0, gate: 12 }
};

export class FFT {
  constructor(size) {
    if (size < 2 || (size & (size - 1))) throw new Error('FFT size must be a power of two.');
    this.size = size;
    this.reverse = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let x = i, r = 0;
      for (let j = 0; j < bits; j++) { r = (r << 1) | (x & 1); x >>>= 1; }
      this.reverse[i] = r;
    }
    this.cos = Float64Array.from({length: size / 2}, (_, i) => Math.cos(2 * Math.PI * i / size));
    this.sin = Float64Array.from({length: size / 2}, (_, i) => Math.sin(2 * Math.PI * i / size));
  }
  transform(real, imag, inverse = false) {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.reverse[i];
      if (j > i) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
    }
    for (let len = 2; len <= n; len *= 2) {
      const half = len / 2, stride = n / len;
      for (let start = 0; start < n; start += len) {
        for (let j = 0; j < half; j++) {
          const a = start + j, b = a + half, c = this.cos[j * stride], s = this.sin[j * stride] * (inverse ? 1 : -1);
          const tr = real[b] * c - imag[b] * s, ti = real[b] * s + imag[b] * c;
          real[b] = real[a] - tr; imag[b] = imag[a] - ti; real[a] += tr; imag[a] += ti;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { real[i] /= n; imag[i] /= n; }
  }
}

export function rms(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, data.length));
}
export function peak(data) {
  let p = 0;
  for (let i = 0; i < data.length; i++) p = Math.max(p, Math.abs(data[i]));
  return p;
}

// Short overlapping equal-power fades make the carrier repeat without hard joins.
export function loopSample(source, index, start = 0, end = source.length) {
  const length = end - start;
  if (length < 2) return source[start] || 0;
  const fade = Math.min(Math.floor(length * .08), 480);
  const period = length - fade;
  const pos = ((index % period) + period) % period;
  if (pos < fade && fade > 1) {
    const t = pos / fade;
    return source[start + period + pos] * Math.cos(t * Math.PI / 2) + source[start + pos] * Math.sin(t * Math.PI / 2);
  }
  return source[start + pos];
}

const mel = f => 2595 * Math.log10(1 + f / 700);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function interpolate(values, position) {
  const x = clamp(position, 0, values.length - 1), i = Math.floor(x);
  return values[i] + (values[Math.min(i + 1, values.length - 1)] - values[i]) * (x - i);
}

export function renderVocoder({ carrier, speech, settings, sampleRate = SAMPLE_RATE, start = 0, end = carrier.length }, onProgress = () => {}) {
  if (!carrier.length || !speech.length) throw new Error('Audio is empty.');
  if (speech.length > sampleRate * MAX_SECONDS) throw new Error(`Keep the spoken result under ${MAX_SECONDS} seconds. Shorten the text or increase the speed.`);
  if (end - start < sampleRate * .04) throw new Error('Select at least 0.04 seconds of source audio.');
  const sourceRms = rms(carrier.subarray(start, end));
  if (sourceRms < .00001) throw new Error('This source section is silent. Choose a section with audible sound.');
  const s = {...PRESETS.signature, ...settings};
  const n = 2048, hop = 256, half = n / 2, count = Number(s.bands);
  const fft = new FFT(n), window = Float64Array.from({length:n}, (_, i) => Math.sqrt(.5 - .5 * Math.cos(2 * Math.PI * i / n)));
  const cr = new Float64Array(n), ci = new Float64Array(n), mr = new Float64Array(n), mi = new Float64Array(n);
  const cenv = new Float64Array(count), menv = new Float64Array(count), weights = new Float64Array(count), coords = new Float64Array(half + 1);
  const smoothM = new Float64Array(count), smoothC = new Float64Array(count);
  const out = new Float32Array(speech.length), norm = new Float32Array(speech.length);
  const maxMel = mel(sampleRate / 2), gain = Math.min(25, .22 / sourceRms);
  const speechGain = Math.min(20, .18 / Math.max(.0001, rms(speech)));
  const assist = s.assist / 100, texture = s.texture / 100, clarity = s.clarity / 100;
  const f0 = 70 + Number(s.pitch) * 2.1;
  const shift = 2 ** (s.formant / 12);
  let rng = 186317, env = 0;
  for (let k = 0; k <= half; k++) {
    const p = coords[k] = mel(k * sampleRate / n) / maxMel * (count - 1), lo = Math.floor(p), hi = Math.min(count - 1, lo + 1), frac = p - lo;
    weights[lo] += 1 - frac; weights[hi] += frac;
  }
  const total = Math.ceil((speech.length + n - hop) / hop);
  let frame = 0;
  for (let pos = -n + hop; pos < speech.length; pos += hop) {
    cr.fill(0); ci.fill(0); mr.fill(0); mi.fill(0); cenv.fill(0); menv.fill(0);
    for (let j = 0; j < n; j++) {
      const at = pos + j;
      if (at < 0 || at >= speech.length) continue;
      rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
      const noise = (rng >>> 0) / 2147483648 - 1;
      const phase = (at * f0 / sampleRate) % 1;
      const harmonic = (2 * phase - 1) * .32 + noise * .16;
      cr[j] = (loopSample(carrier, at, start, end) * gain + harmonic * assist) * window[j];
      mr[j] = speech[at] * speechGain * window[j];
    }
    fft.transform(cr, ci); fft.transform(mr, mi);
    let energy = 0;
    for (let k = 0; k <= half; k++) {
      const p = coords[k], lo = Math.floor(p), hi = Math.min(count - 1, lo + 1), f = p - lo;
      const cm = Math.hypot(cr[k], ci[k]), mm = Math.hypot(mr[k], mi[k]);
      cenv[lo] += cm * (1 - f); cenv[hi] += cm * f;
      menv[lo] += mm * (1 - f); menv[hi] += mm * f;
      energy += mm * mm;
    }
    const active = Math.sqrt(energy / n / n) > .0004;
    for (let b = 0; b < count; b++) {
      const m = menv[b] / Math.max(1, weights[b]), c = cenv[b] / Math.max(1, weights[b]);
      smoothM[b] += (m - smoothM[b]) * (m > smoothM[b] ? .88 : .5);
      smoothC[b] += (c - smoothC[b]) * .3;
    }
    for (let k = 1; k < half; k++) {
      const freq = k * sampleRate / n;
      const modPos = mel(freq / shift) / maxMel * (count - 1);
      const m = interpolate(smoothM, modPos), c = interpolate(smoothC, coords[k]);
      // Texture retains the carrier's fine spectral detail; lower values whiten it.
      const ratio = Math.min(40, m / Math.max(.012, c));
      const cm = Math.hypot(cr[k], ci[k]);
      const whiten = Math.pow(Math.max(.15, c) / Math.max(.15, cm), (1 - texture) * .72);
      const lowCut = Math.min(1, (freq / 90) ** 2);
      const g = active ? ratio * whiten * lowCut : 0;
      cr[k] *= g; ci[k] *= g; cr[n - k] = cr[k]; ci[n - k] = -ci[k];
    }
    cr[0] = ci[0] = cr[half] = ci[half] = 0;
    fft.transform(cr, ci, true);
    for (let j = 0; j < n; j++) {
      const at = pos + j;
      if (at >= 0 && at < out.length) { out[at] += cr[j] * window[j]; norm[at] += window[j] ** 2; }
    }
    if ((frame++ & 31) === 0) onProgress(Math.min(.93, frame / total * .93));
  }
  const wetGain = .19 / Math.max(.002, rms(out.map((v, i) => v / Math.max(.01, norm[i]))));
  let prevIn = 0, prevOut = 0;
  for (let i = 0; i < out.length; i++) {
    const m = speech[i] * speechGain;
    env += (Math.abs(m) - env) * (Math.abs(m) > env ? .12 : .005);
    const gate = clamp(env / (.001 + s.gate * .00008), 0, 1);
    let v = out[i] / Math.max(.01, norm[i]) * wetGain * (1 - clarity * .5) * gate + m * clarity;
    const drive = 1 + s.drive / 18;
    v = Math.tanh(v * drive) / Math.sqrt(drive);
    const dc = v - prevIn + .995 * prevOut; prevIn = v; prevOut = dc;
    out[i] = dc;
  }
  // Small, deterministic echo network. Tail stays within the spoken duration.
  if (s.space > 0) {
    const amount = s.space / 100;
    for (const [seconds, level] of [[.073,.24],[.137,.19],[.211,.12]]) {
      const delay = Math.floor(seconds * sampleRate);
      for (let i = delay; i < out.length; i++) out[i] += out[i - delay] * level * amount;
    }
  }
  const p = peak(out), master = Math.min(4, .94 / Math.max(.01, p));
  const fade = Math.min(Math.floor(sampleRate * .008), Math.floor(out.length / 2));
  for (let i = 0; i < out.length; i++) out[i] *= master * Math.min(1, i / fade, (out.length - 1 - i) / fade);
  onProgress(1);
  return out;
}

export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const str = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = clamp(samples[i], -1, 1); view.setInt16(44 + i * 2, s * (s < 0 ? 32768 : 32767), true); }
  return buffer;
}
