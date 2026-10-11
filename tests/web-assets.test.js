// Static checks on what web/ publishes: the page loads only its own files, the mascot, favicons and social card
// are real PNGs of the right size, and vercel.json serves web/ with a CSP that keeps scripts and styles to the site itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { MOODS } from '../web/view-model.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MASCOTS = [...MOODS, 'tilt'];

test('index.html: no inline script, no inline style, no remote resource, every local file it names exists', () => {
  const html = read('web/index.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'inline script');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'inline style attribute');
  assert.doesNotMatch(html, /<style[\s>]/i, 'style element');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event handler');
  // Resources the page loads (script, link, img, iframe, source) must be local. Plain <a> links may point anywhere.
  const loaders = [...html.matchAll(/<(script|link|img|iframe|source|embed|object)\b[^>]*>/gi)].map((m) => m[0]);
  assert.ok(loaders.length >= 7, 'expected the script and the five stylesheets and the icon');
  for (const tag of loaders) assert.doesNotMatch(tag, /(?:src|href|data)\s*=\s*["']\s*(?:https?:)?\/\//i, `remote resource: ${tag}`);
  const local = loaders.flatMap((t) => [...t.matchAll(/(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)].map((m) => m[1]));
  assert.ok(local.length >= 7);
  for (const f of local) assert.ok(existsSync(new URL(`../web/${f}`, import.meta.url)), `${f} is missing`);
});
// PNG header: 8-byte signature, then the IHDR chunk with width and height as 32-bit numbers at bytes 16 and 20.
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function png(path) {
  const buf = readFileSync(new URL(`../${path}`, import.meta.url));
  return { ok: buf.subarray(0, 8).equals(SIGNATURE), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
}

test('the five clew PNGs exist, are square and sharp enough for 120 px, and no SVG mascot is left', () => {
  for (const m of MASCOTS) {
    const p = png(`web/mascot/${m}.png`);
    assert.equal(p.ok, true, `${m}.png is not a PNG`);
    assert.equal(p.w, p.h, `${m}.png must be square (the page sets width and height 120)`);
    assert.ok(p.w >= 120 && p.w <= 512, `${m}.png is ${p.w}px`);
    assert.ok(p.bytes < 300 * 1024, `${m}.png is ${p.bytes} bytes`);
    assert.equal(existsSync(new URL(`../web/mascot/${m}.svg`, import.meta.url)), false, `old ${m}.svg should be deleted`);
  }
  assert.deepEqual(readdirSync(new URL('../web/mascot/', import.meta.url)).sort(), MASCOTS.map((m) => `${m}.png`).sort());
});
test('render.js shows the mascot as a 120 px PNG with width, height, and short mood alt text', () => {
  const src = read('web/render.js');
  assert.match(src, /src: `mascot\/\$\{pose\.file\}\.png`/);
  assert.match(src, /alt: `The clew, \$\{st\.mood\}`/);
  assert.match(src, /width: '120', height: '120'/);
  assert.doesNotMatch(src, /\.svg|rotate/);
  assert.doesNotMatch(read('web/layout.css'), /\.clew\.rotate/);
});
test('favicons: 32 and 16 px PNG icons, a 180 px apple-touch-icon, and no SVG favicon', () => {
  const html = read('web/index.html');
  assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="favicon-32\.png">/);
  assert.match(html, /<link rel="icon" type="image\/png" sizes="16x16" href="favicon-16\.png">/);
  assert.match(html, /<link rel="apple-touch-icon" href="favicon-180\.png">/);
  assert.doesNotMatch(html, /rel="icon"[^>]*svg|\.svg"/i);
  for (const [f, size] of [['favicon-16', 16], ['favicon-32', 32], ['favicon-180', 180]]) {
    const p = png(`web/${f}.png`);
    assert.deepEqual([p.ok, p.w, p.h], [true, size, size], f);
  }
});
test('social card: og and twitter tags use the production address, and the card is a 1200x630 PNG', () => {
  const html = read('web/index.html');
  const meta = (k, v) => html.match(new RegExp(`<meta ${k}="${v}" content="([^"]*)">`))?.[1];
  assert.equal(meta('property', 'og:title'), 'README Clew 2 // Claim Ledger');
  assert.equal(meta('property', 'og:description'), 'Checks whether a GitHub README matches its code.');
  assert.equal(meta('property', 'og:image'), 'https://readme-clew-2.vercel.app/social-card.png'); // absolute, never relative
  assert.equal(meta('property', 'og:url'), 'https://readme-clew-2.vercel.app/');
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.match(meta('property', 'og:image'), /^https:\/\//);
  const card = png('web/social-card.png');
  assert.deepEqual([card.ok, card.w, card.h], [true, 1200, 630]); // Shara swaps the picture under this name
  assert.ok(card.bytes < 2 * 1024 * 1024, 'keep the card under 2 MB so link previews load');
});
test('the CSS follows the style guide: tokens defined, zero border-radius, no gradients except the scanline overlay, no remote url()', () => {
  const css = ['tokens', 'layout', 'findings', 'chrome', 'pages'].map((n) => read(`web/${n}.css`)).join('\n');
  for (const t of ['--bg: #0A1214', '--panel: #0E1C1F', '--rule: #3CA89C', '--text: #4FE3D1', '--label: #79C7C5', '--muted: #9BB0AD', '--contradicted: #FF7A6B', '--missing: #F2C14E']) {
    assert.ok(css.includes(t), `${t} missing`);
  }
  assert.doesNotMatch(css, /border-radius\s*:\s*[^0\s]/i); // only "border-radius: 0" is allowed
  assert.match(css, /border-radius:\s*0;/);
  assert.doesNotMatch(css, /url\(/i);
  assert.equal((css.match(/gradient\(/g) ?? []).length, 1, 'only the scanline overlay may use a gradient');
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*2px solid var\(--text\)/);
});
test('vercel.json: web/ is the site root, the scan function keeps its limit, and the CSP forbids inline and remote code', () => {
  const v = JSON.parse(read('vercel.json'));
  assert.equal(v.outputDirectory, 'web');
  assert.equal(v.functions['api/scan.js'].maxDuration, 60);
  const csp = v.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
  for (const d of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "connect-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
    assert.ok(csp.includes(d), `CSP is missing ${d}`);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*|https?:/);
});
test('nothing the page publishes holds a key, and web/ holds no fixture mode data path outside localhost', () => {
  const js = ['app', 'render', 'render-sections', 'view-model', 'fixture-mode', 'ui-state', 'tabs', 'disclosure', 'dom', 'site'].map((n) => read(`web/${n}.js`)).join('\n');
  assert.doesNotMatch(js, /GLASSER|ANTHROPIC|GITHUB_TOKEN|process\.env|sk-ant|api[_-]?key/i);
  assert.match(read('web/fixture-mode.js'), /isDevHost\(hostname\)/);
});
