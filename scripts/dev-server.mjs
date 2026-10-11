// Local dev server. Not published (Vercel serves web/ only). Run: node scripts/dev-server.mjs [port]
// Serves web/ at /, and fixtures/expected/*.json at /fixtures/expected/ for the page's fixture mode.
// POST /api/scan is not served here: fixture mode makes no API call.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEB = join(ROOT, 'web');
const FIX = join(ROOT, 'fixtures', 'expected');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };

function resolvePath(urlPath) {
  const p = decodeURIComponent(urlPath);
  const [base, rel] = p.startsWith('/fixtures/expected/') ? [FIX, p.slice('/fixtures/expected/'.length)] : [WEB, p === '/' ? 'index.html' : p.slice(1)];
  const full = normalize(join(base, rel));
  return full.startsWith(base + sep) ? full : null;
}

// Same security headers as production (vercel.json), so a CSP violation shows up here first.
async function siteHeaders() {
  try {
    const v = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
    return Object.fromEntries((v.headers ?? []).flatMap((h) => h.headers).map((h) => [h.key.toLowerCase(), h.value]));
  } catch { return {}; }
}

const server = createServer(async (req, res) => {
  try {
    const full = resolvePath(new URL(req.url, 'http://localhost').pathname);
    if (!full) { res.writeHead(403).end('Forbidden'); return; }
    const body = await readFile(full);
    res.writeHead(200, { ...(await siteHeaders()), 'content-type': TYPES[extname(full)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

const port = Number(process.argv[2] ?? 5173);
server.listen(port, '127.0.0.1', () => console.log(`dev server: http://localhost:${port}/?fixture=npm-start-drift`));
