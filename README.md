# SayShift · by Child Games

**Make any sound say anything.** A complete browser audio studio that uses your uploaded audio as a vocoder carrier and a local text-to-speech voice as its modulator.

## Deploy with GitHub → Vercel

1. Extract this ZIP into a **fresh folder**. Do not merge it into an older extracted copy, which may still contain the oversized file.
2. Create a GitHub repository and use **Add file → Upload files** to upload the **contents** of this project. `package.json`, `vercel.json`, `public`, `scripts`, and `vendor-parts` must be at the repository root. Keep both `public/vendor` and `vendor-parts` complete.
3. In Vercel, choose **Add New → Project**, then import the GitHub repository.
4. Use these settings if Vercel asks:

   | Setting | Value |
   | --- | --- |
   | Framework preset | Other |
   | Root directory | The folder containing `package.json` |
   | Build command | `npm run build` |
   | Output directory | `dist` |
   | Install command | Default; no application dependencies are required |
   | Environment variables | None |

5. Click **Deploy**. The included `vercel.json` already sets the build and output directory.
6. Your later GitHub commits can deploy automatically through Vercel's Git integration.

Do not upload the ZIP itself as the website. Extract it and upload its contents. If you upload the containing folder instead, set that folder as Vercel's Root Directory. **Every source file is under 9 MB**, so the GitHub browser uploader can accept them individually. The large WebAssembly converter is stored as four parts of at most 8 MiB in `vendor-parts/ffmpeg`. Vercel's build automatically joins them and verifies their SHA-256 hashes. You do not need GitHub Desktop, Git LFS, an external download, or a manual joining step. Do not upload an old `dist` folder or the old unsplit `.wasm` file from an earlier copy.

## Use it

1. Drop an audio file into **The source**, browse for one, or try a built-in Synth, Bass, or Noise demo.
2. Type up to 1,200 characters in **Give it words**.
3. Choose a preset or open **Fine-tune the sound**.
4. Press **Make it talk**. `Ctrl+Enter` / `Cmd+Enter` also generates.
5. In the result, press Play. Switch between **Talking remix**, **Plain TTS**, and **Original source** to compare them.
6. Choose a download format, then press **Download audio**. The selected audio tab is what downloads.

The format dropdown defaults to the uploaded file's extension, including aliases such as `.aif` → AIFF and `.mp4` → M4A. Unmatched input formats default to WAV with a visible explanation. A new source resets that default; you can change it freely afterward.

## Audio formats

| Export | Codec / quality |
| --- | --- |
| WAV | 16-bit PCM, lossless relative to the processed signal |
| MP3 | LAME, 192 kbps |
| FLAC | Lossless relative to the processed signal |
| OGG | Vorbis, quality 5 |
| Opus | Opus, 128 kbps |
| M4A | AAC, 192 kbps |
| AAC | AAC / ADTS, 192 kbps |
| WebM | Opus, 128 kbps |
| AIFF | 16-bit big-endian PCM |
| WMA | WMAv2, 128 kbps |

Uploads first use the browser's audio decoder. If that fails, the bundled FFmpeg converter tries decoding locally. MP3, WAV, FLAC, OGG, M4A, AAC, WebM, Opus, AIFF, and WMA are common examples; no app can promise every codec, encrypted/DRM file, or damaged file will decode.

The first non-WAV download loads the bundled 31 MB converter. Later exports reuse it. No CDN, paid service, API key, server upload endpoint, or cross-origin isolation headers are needed. A download preserves the selected file type, **not** the source's original bit rate, channels, or sample rate. The vocoder processes at 24 kHz mono; some export codecs resample as required. Playback speed and listening volume only affect monitoring, not the downloaded render. Speaking speed, guide pitch, and the other fine-tune settings are baked into a new render.

## Presets and controls

- **Signature:** a balance of source identity and speech detail.
- **Clear speech:** more harmonic support and a stronger audible guide blend.
- **Robot radio:** fewer bands and some gritty saturation.
- **Bass creature:** dark resonances and a low guide pitch.
- **Dream machine:** brighter formants and a little space.
- **Pure source:** no harmonic assist and no actual TTS mixed into the output.

| Control | What it does |
| --- | --- |
| Guide language | English US/UK, Spanish, French, or German pronunciation |
| Spectral detail | 24, 48, or 64 speech-shaping bands |
| Speaking speed | 110–260 words per minute |
| Guide pitch | Changes the local TTS guide and harmonic-assist pitch |
| Source character | Preserves more fine spectral texture from the uploaded clip |
| Guide voice blend | Mixes some actual TTS audio into the remix; set zero for none |
| Harmonic assist | Adds broadband harmonics to help sparse sounds carry speech |
| Mouth shape | Shifts the speech envelope's resonances by up to 8 semitones |
| Distortion | Soft saturation |
| Space | Short echo network |
| Pause cleanup | Stronger gating between words |

## What the effect really does

Simple volume changes alone cannot force an arbitrary sound to pronounce any sentence. SayShift uses a spectral vocoder: it analyzes the generated guide's frequency envelope, reshapes the carrier's frequency bands, and follows the speech rhythm. It loops the source with short overlapping fades for as long as the guide needs. The uploaded clip remains the main source of texture.

This produces a stylized talking sound, not a neural voice clone or guaranteed natural human speech. A rich synth, noisy sound, or music typically carries speech more clearly than a sine wave or a sparse kick drum. **Guide voice blend explicitly mixes in real TTS audio.** For a transformation using only the uploaded audio, choose **Pure source**, or set both Guide voice blend and Harmonic assist to zero; clarity then depends heavily on the source. The **Plain TTS** tab is the unprocessed synthetic guide and can be played or downloaded separately.

## Local preview

Install Node.js 20 or newer, open a terminal in this folder, and run:

```sh
npm start
```

Open `http://localhost:3000`. No `npm install` is necessary because runtime assets are bundled and the scripts use Node's built-in modules. Do not double-click `index.html`: workers, fetches, and WebAssembly need HTTP/HTTPS rather than a `file://` URL.

```sh
npm test
npm run test:codecs
npm run build
```

`npm test` checks the FFT, speech engine, looping, silence handling, peak limits, WAV encoding, and default-format mapping. `test:codecs` reconstructs the exact bundled FFmpeg core, tests every non-WAV export encoder, and decodes its result. The build copies `public/` into `dist/` and reconstructs the converter there. The local preview server also reconstructs it automatically when requested.

## Practical limits and privacy

- Source: up to **60 MB** and **10 minutes**. You can select a shorter loop section.
- Text: **1,200 characters**. Generated speech: **3 minutes maximum**.
- Render and export run in workers. Cancel is available during generation.
- Your selected audio and text stay in the browser. This app has no upload endpoint or analytics. The hosting provider still handles ordinary requests for the website's static files.
- Files and results are kept in memory for the current page; refreshing clears them.
- Use a recent Chrome, Edge, Firefox, or Safari. Phones with limited memory may need shorter sources and phrases.

## Project map

```text
public/index.html                 Studio interface
public/styles.css                 Responsive styling
public/js/app.js                  UI, upload, transport, and render flow
public/js/dsp.js                  FFT vocoder, looping, presets, WAV output
public/js/render-worker.js        Background vocoder renderer
public/js/speech-worker.js        Local speech-generation worker
public/js/codecs.js               Download formats and fallback decoding
public/vendor/mespeak/            Bundled meSpeak engine and voices
public/vendor/ffmpeg/             Bundled single-thread FFmpeg WebAssembly
vendor-parts/ffmpeg/              Four small converter parts + integrity manifest
scripts/converter-binary.mjs      Joins and verifies the converter automatically
scripts/build.mjs                Dependency-free static build
scripts/serve.mjs                Local preview server
tests/                           Audio and codec verification
vercel.json                      Vercel configuration
```

## Credits and source

Copyright © 2026 Child Games. This project is provided under GPL-3.0-or-later; see `LICENSE` and `THIRD_PARTY_NOTICES.md` for the bundled engines' notices and source references. The credits apply to code and dependencies; uploaded recordings remain subject to their own rights.

Technical references: [meSpeak source/API](https://github.com/mikolalysenko/mespeak), [ffmpeg.wasm source](https://github.com/ffmpegwasm/ffmpeg.wasm), [ffmpeg.wasm usage](https://ffmpegwasm.netlify.app/docs/getting-started/usage/), and [Vercel build settings](https://vercel.com/docs/builds/configure-a-build).
