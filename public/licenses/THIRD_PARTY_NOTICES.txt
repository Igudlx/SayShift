# Third-party notices

The SayShift application source is Copyright © 2026 Child Games and is licensed under GNU GPL version 3 or later. The full license is in `LICENSE`.

## meSpeak / eSpeak / speak.js

- Bundled npm package: `mespeak@2.0.2` (upstream JavaScript header identifies the meSpeak engine as v1.9.6).
- meSpeak modifications: Copyright 2011–2014 Norbert Landsteiner, [masswerk.at](https://www.masswerk.at/mespeak/).
- Based on [speak.js](https://github.com/kripken/speak.js) and [eSpeak](https://espeak.sourceforge.net/).
- License: GNU GPL; the included upstream README states GPL. The upstream meSpeak project is distributed under GPL v3.
- Package source and API: https://github.com/mikolalysenko/mespeak
- Exact distribution: https://registry.npmjs.org/mespeak/-/mespeak-2.0.2.tgz
- SHA-1 of npm tarball: `dff76ac51c1f9373c2306a5c19b17c4c20323869`
- The complete, unminified engine JavaScript is included in `public/vendor/mespeak/engine.js`. The adaptation wraps the two CommonJS modules for worker use and preserves their source and upstream notices. Configuration and the selected voice files are included alongside it. The upstream README and package metadata are in `third-party/`.

## FFmpeg WebAssembly core

- Bundled package: `@ffmpeg/core@0.12.10`, single-thread ESM build.
- Package license: GPL-2.0-or-later; full text in `third-party/GPL-2.0.txt`.
- FFmpeg is Copyright the FFmpeg developers; the core also includes libraries with their respective upstream notices and licenses.
- Source, pinned component versions, Docker build files, and build instructions: https://github.com/ffmpegwasm/ffmpeg.wasm
- FFmpeg source: https://ffmpeg.org/download.html
- Exact npm distribution: https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz
- SHA-1 of npm tarball: `3177e88852bfbfaad5d258e9e0ac1fd9dffd3223`
- Package metadata is retained in `third-party/ffmpeg-core-package.json`. The supplied `ffmpeg-core.js` is unchanged. The original `ffmpeg-core.wasm` is stored as four byte-for-byte parts under `vendor-parts/ffmpeg` to fit GitHub's browser upload limit; the build reconstructs the unchanged binary and verifies its SHA-256 hash. Source availability and redistribution obligations of those upstream licenses remain applicable to those components.

## FFmpeg browser API wrapper

- Bundled package: `@ffmpeg/ffmpeg@0.12.15`.
- Copyright © Jerome Wu and ffmpeg.wasm contributors.
- License: MIT.
- Source: https://github.com/ffmpegwasm/ffmpeg.wasm
- Exact distribution: https://registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-0.12.15.tgz
- SHA-1 of npm tarball: `e5b05c2b5c946f3464b3aa85461e4654a4649d80`

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Other assets

The icons, favicon, styling, demo sound generators, vocoder implementation, and application UI are supplied as part of SayShift. No external fonts or stock recordings are used. Uploaded audio has its own rights and is not included in the project.
