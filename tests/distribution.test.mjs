import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import { readConverterBinary } from '../scripts/converter-binary.mjs';

test('all distributed source files fit comfortably below the GitHub browser upload limit', async () => {
  const root = new URL('../', import.meta.url);
  const ignored = new Set(['dist', 'node_modules', '.git', '.openai']);
  async function check(directory) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      if (ignored.has(entry.name)) continue;
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await check(url);
      else assert.ok((await stat(url)).size < 9_000_000, `Oversized source file: ${url.pathname}`);
    }
  }
  await check(root);
});

test('the converter parts reconstruct the exact valid upstream WebAssembly binary', async () => {
  const binary = await readConverterBinary();
  assert.equal(binary.length, 32_232_419);
  assert.deepEqual([...binary.subarray(0,8)], [0,97,115,109,1,0,0,0]);
  assert.ok(WebAssembly.validate(binary));
});
