#!/usr/bin/env node
// Minimal static file server for app/ (no dependencies).
// Usage: node tools/serve.mjs [port]   → http://localhost:8080/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

export function startServer(port = 0, root = APP_DIR) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(root, path));
      if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end(); return; }
      const st = await stat(file).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = await startServer(Number(process.argv[2]) || 8080);
  console.log(`Serving app/ at http://localhost:${server.address().port}/`);
}
