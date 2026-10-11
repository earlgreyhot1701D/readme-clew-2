// Site basics (Phase D): robots.txt, sitemap.xml, canonical and theme-color, the 404 page, and Vercel Analytics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SITE_URL, withoutRepoParam } from '../web/site.js';

const read = (p) => readFileSync(new URL(`../web/${p}`, import.meta.url), 'utf8');
const html = read('index.html');
const notFound = read('404.html');
const BANNED = /[\u2014\u2013]|\b(delve|landscape|straightforward|genuinely|honestly|seamless|robust)\b/i;

test('robots.txt: everyone may crawl, /api/ is off limits, and the sitemap line points at the production URL', () => {
  const lines = read('robots.txt').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(lines, ['User-agent: *', 'Allow: /', 'Disallow: /api/', `Sitemap: ${SITE_URL}/sitemap.xml`]);
  assert.ok(!lines.some((l) => /^Disallow:\s*\/?\s*$/.test(l)), 'a bare "Disallow: /" would block the whole site');
});
test('sitemap.xml: valid, and it lists exactly the one production URL', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), [`${SITE_URL}/`]);
  assert.doesNotMatch(xml, /vercel\.app\/[^<]/); // no deep links, no preview URLs
  assert.equal((xml.match(/<url>/g) ?? []).length, 1);
});
test('canonical, description, and theme-color are in the page head, with the production URL and the page background', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes(`<link rel="canonical" href="${SITE_URL}/">`));
  assert.equal((head.match(/rel="canonical"/g) ?? []).length, 1);
  assert.match(head, /<meta name="description" content="[^"]{20,160}">/);
  assert.ok(head.includes('<meta name="theme-color" content="#0A1214">'));
  assert.match(read('tokens.css'), /--bg:\s*#0A1214/); // theme-color is the same colour as --bg
  assert.ok(head.includes(`<meta property="og:url" content="${SITE_URL}/">`));
});
test('no preview address or local address appears in robots, sitemap, canonical, or the 404 page', () => {
  for (const [name, text] of [['robots.txt', read('robots.txt')], ['sitemap.xml', read('sitemap.xml')], ['404.html', notFound]]) {
    assert.doesNotMatch(text, /[a-z0-9-]+-[a-z0-9]{8,}-[a-z0-9-]+\.vercel\.app/i, name);
    assert.doesNotMatch(text, /localhost|127\.0\.0\.1/, name);
  }
});
test('404.html: the site style, the clew, a link home, and root-absolute paths so it works at any depth', () => {
  assert.match(notFound, /<title>404 \/\/ README Clew 2<\/title>/);
  assert.match(notFound, /404 \/\/ NO SUCH PAGE/);
  assert.match(notFound, /<a class="btn" href="\/">GO TO THE HOME PAGE<\/a>/);
  assert.match(notFound, /<img class="clew" src="\/mascot\/curious\.png" alt="The clew, curious" width="120" height="120">/);
  assert.match(notFound, /<meta name="robots" content="noindex">/);
  assert.match(notFound, /<meta name="theme-color" content="#0A1214">/);
  // a 404 is served for /a/b/c too, so every file it loads must start with "/"
  const refs = [...notFound.matchAll(/<(?:link|img|script)\b[^>]*?(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 6);
  for (const r of refs) assert.ok(r.startsWith('/'), `${r} is relative and would break on /a/b/c`);
  for (const r of refs) assert.ok(existsSync(new URL(`../web${r}`, import.meta.url)), `${r} is missing`);
  assert.doesNotMatch(notFound, /<script|\sstyle\s*=|<style|\son[a-z]+\s*=/i); // fits the CSP: no inline anything
  assert.doesNotMatch(notFound.replace(/<!--[\s\S]*?-->/g, ''), BANNED);
});
test('Vercel Analytics: one same-origin deferred script, no third-party analytics, and the CSP still says self', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(scripts.includes('<script defer src="/_vercel/insights/script.js">'));
  assert.equal(scripts.length, 2, 'app.js and the Analytics script, nothing else');
  assert.ok(scripts.every((s) => !/src="(?:https?:)?\/\//.test(s)), 'no script from another origin');
  const csp = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /script-src 'self'(?:;|$)/);
  assert.match(csp, /connect-src 'self'(?:;|$)/); // the Analytics beacon goes to the same origin
  assert.doesNotMatch(csp, /vercel-scripts|va\.vercel|vitals|googletagmanager|google-analytics/i);
});
test('honest privacy copy: the ABOUT line is exact, and the input hint no longer claims "nothing is stored"', () => {
  assert.ok(html.includes('Anonymous page-view counts through Vercel Analytics. No cookies. Scans are never stored.'));
  assert.ok(html.includes('<p class="hint">PUBLIC REPOS ONLY. SCANS ARE NEVER STORED.</p>'));
  assert.doesNotMatch(html, /NOTHING IS STORED/);
  const body = html.slice(html.indexOf('<body>'));
  assert.doesNotMatch(body.replace(/<[^>]+>/g, ' '), /\bNothing is stored\b/i);
});
test('withoutRepoParam: drops only ?repo=, keeps other parameters, and an empty result is ""', () => {
  assert.equal(withoutRepoParam('?repo=o/r'), '');
  assert.equal(withoutRepoParam('?repo=o%2Fr&fixture=npm-start-drift'), '?fixture=npm-start-drift');
  assert.equal(withoutRepoParam('?fixture=x&repo=a/b&z=1'), '?fixture=x&z=1');
  assert.equal(withoutRepoParam('?fixture=x'), '?fixture=x');
  assert.equal(withoutRepoParam(''), '');
  assert.equal(withoutRepoParam('?repo='), '');
  assert.equal(withoutRepoParam(null), ''); // junk in, nothing out
});

test('home: GET IT strip has the extension release, the source repo, and a button that opens ABOUT', () => {
  const strip = html.slice(html.indexOf('class="strip get-it"'), html.indexOf('</section>', html.indexOf('class="strip get-it"')));
  assert.ok(strip.includes('href="https://github.com/earlgreyhot1701D/readme-clew-2/releases/tag/v0.1.0"'));
  assert.ok(strip.includes('href="https://github.com/earlgreyhot1701D/readme-clew-2"'));
  assert.ok(strip.includes('data-goto-tab="about"'));
});
