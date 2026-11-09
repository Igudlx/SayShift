import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readConverterBinary } from './converter-binary.mjs';
const root = fileURLToPath(new URL('../public/', import.meta.url));
let converter;
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml', '.wasm':'application/wasm', '.wav':'audio/wav', '.txt':'text/plain' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    if (file === path.join(root, 'vendor/ffmpeg/core/ffmpeg-core.wasm')) {
      converter ||= readConverterBinary().catch(error => { converter = null; throw error; });
      const bytes = await converter;
      res.writeHead(200, { 'Content-Type':'application/wasm', 'Content-Length':bytes.length, 'Cache-Control':'no-cache' });
      res.end(bytes);
      return;
    }
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
const portIndex = process.argv.indexOf('--port'), hostIndex = process.argv.indexOf('--host');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 3000);
const host = hostIndex >= 0 ? process.argv[hostIndex + 1] : '0.0.0.0';
server.listen(port, host, () => console.log(`Local: http://localhost:${server.address().port}`));
