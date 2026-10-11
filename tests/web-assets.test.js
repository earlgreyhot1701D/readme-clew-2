// Static checks on what web/ publishes: the page loads only its own files, the mascot SVGs are safe line art,
// and vercel.json serves web/ with a CSP that keeps scripts and styles to the site itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
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
test('the five clew SVGs exist, are line art with no fill, and contain no script, link, image, or event handler', () => {
  for (const m of MASCOTS) {
    const svg = read(`web/mascot/${m}.svg`);
    assert.match(svg, /<svg[^>]+viewBox=/, m);
    assert.match(svg, /fill="none"/, m);
    assert.match(svg, /stroke="#4FE3D1"/, m);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|<use|<a[\s>]|\son[a-z]+\s*=|href\s*=|xlink|url\(/i, `${m} has an unsafe element`);
    assert.match(svg, /<title>/, `${m} needs a title`);
  }
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
