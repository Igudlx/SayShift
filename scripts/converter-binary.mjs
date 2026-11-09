import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Small source files fit GitHub's browser uploader. The build joins them back
// into the exact upstream WebAssembly binary used by the existing app.
export async function readConverterBinary() {
  const base = new URL('../vendor-parts/ffmpeg/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  if (!Array.isArray(manifest.parts) || !manifest.parts.length) throw new Error('The audio converter manifest is empty.');
  const parts = await Promise.all(manifest.parts.map(async part => {
    if (!/^ffmpeg-core\.wasm\.part\d{3}$/.test(part.name)) throw new Error('Invalid audio converter part name.');
    let bytes;
    try { bytes = await readFile(new URL(part.name, base)); }
    catch { throw new Error(`Missing audio converter part: vendor-parts/ffmpeg/${part.name}. Upload the complete vendor-parts folder.`); }
    if (bytes.length !== part.bytes || createHash('sha256').update(bytes).digest('hex') !== part.sha256) {
      throw new Error(`Audio converter part ${part.name} is incomplete or corrupted. Replace it from the ZIP.`);
    }
    return bytes;
  }));
  const binary = Buffer.concat(parts);
  if (binary.length !== manifest.bytes || createHash('sha256').update(binary).digest('hex') !== manifest.sha256) {
    throw new Error('The rebuilt audio converter failed its integrity check. Re-upload the vendor-parts folder.');
  }
  return binary;
}
