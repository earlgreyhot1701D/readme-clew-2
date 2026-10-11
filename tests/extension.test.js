// Block 6: the Chrome extension popup. Offline checks: manifest, permissions, the tab-address parser, what the popup shows,
// the shared-file sync, that every import resolves inside extension/, and the rules (no scan on open, text only, 400 px wide).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoFromTabUrl } from '../extension/tab-url.js';
import { popupRows, POPUP_ROWS, FULL_REPORT_NOTE, POPUP_TEXT } from '../extension/popup-model.js';
import { SHARED_JS, SHARED_CSS, MASCOTS, plan, drift } from '../scripts/sync-extension.mjs';
import { SITE_URL } from '../web/site.js';
import { runFixture } from './helpers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ext = (p) => readFileSync(join(ROOT, 'extension', p), 'utf8');
const manifest = JSON.parse(ext('manifest.json'));
const popupJs = ext('popup.js');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ---- the manifest ----
test('manifest: MV3, the agreed name and version, a popup, and icons that exist at the right sizes', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'README Clew 2');
  assert.equal(manifest.version, '0.1.0');
  assert.match(manifest.description, /README/);
  assert.equal(manifest.action.default_popup, 'popup.html');
  for (const size of [16, 32, 48, 128]) {
    for (const map of [manifest.icons, manifest.action.default_icon]) {
      const file = map[String(size)];
      assert.equal(file, `icons/icon-${size}.png`);
      const buf = readFileSync(join(ROOT, 'extension', file));
      assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${file} is a PNG`);
      assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [size, size], `${file} is ${size} px`);
    }
  }
});
test('manifest permissions: activeTab and exactly one host permission, the API origin. Nothing else', () => {
  assert.deepEqual(manifest.permissions, ['activeTab']);
  assert.deepEqual(manifest.host_permissions, [`${SITE_URL}/*`]);
  for (const key of ['content_scripts', 'background', 'externally_connectable', 'web_accessible_resources', 'optional_permissions', 'optional_host_permissions', 'content_security_policy', 'commands', 'omnibox', 'devtools_page', 'oauth2', 'update_url', 'key']) {
    assert.ok(!(key in manifest), `manifest must not have ${key}`);
  }
  assert.ok(!JSON.stringify(manifest).includes('<all_urls>') && !JSON.stringify(manifest).includes('*://*'));
  assert.ok(!manifest.permissions.some((p) => ['tabs', 'storage', 'scripting', 'cookies', 'history', 'webRequest', 'downloads', 'unlimitedStorage'].includes(p)));
});
test('manifest: it names only files that exist, and popup.html loads only files inside extension/', () => {
  const html = ext('popup.html');
  assert.ok(existsSync(join(ROOT, 'extension', manifest.action.default_popup)));
  const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 6);
  for (const r of refs) {
    assert.ok(!/^(?:https?:)?\/\//.test(r) && !r.startsWith('/'), `${r} must be a relative file`);
    assert.ok(existsSync(join(ROOT, 'extension', r)), `${r} is missing`);
  }
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|\sstyle\s*=|<style[\s>]|\son[a-z]+\s*=/i); // MV3: no inline script, style, or handler
  assert.equal(html.includes('type="module" src="popup.js"'), true);
});

// ---- which repo is the tab showing ----
test('tab address: repo pages give owner and name, whatever part of the repo is open', () => {
  const yes = {
    'https://github.com/earlgreyhot1701D/readme-clew': ['earlgreyhot1701D', 'readme-clew'],
    'https://github.com/o/r/': ['o', 'r'],
    'https://github.com/o/r/tree/main/src/lib': ['o', 'r'],
    'https://github.com/o/r/blob/main/README.md?plain=1#L4': ['o', 'r'],
    'https://github.com/o/r/pull/12/files': ['o', 'r'],
    'https://github.com/o/r/issues': ['o', 'r'],
    'https://github.com/o/r.js?tab=readme-ov-file#install': ['o', 'r.js'],
    'https://www.github.com/o/r': ['o', 'r'],
    'https://github.com/OWNER/Repo.Name': ['OWNER', 'Repo.Name'],
  };
  for (const [url, [owner, name]] of Object.entries(yes)) {
    const r = repoFromTabUrl(url);
    assert.deepEqual([r?.ok, r?.owner, r?.name, r?.url], [true, owner, name, `https://github.com/${owner}/${name}`], url);
  }
});
test('tab address: profiles, GitHub site pages, other sites, other schemes, and junk give null (SCAN stays off)', () => {
  const no = ['https://github.com/', 'https://github.com/someone', 'https://github.com/settings/profile', 'https://github.com/orgs/acme/people', 'https://github.com/marketplace/actions/x',
    'https://github.com/topics/javascript', 'https://github.com/notifications', 'https://github.com/issues/assigned', 'https://github.com/pulls', 'https://github.com/explore', 'https://github.com/login/oauth',
    'https://github.com/sponsors/someone', 'https://gist.github.com/o/abc', 'https://example.com/o/r', 'https://github.com.evil.example/o/r', 'https://evilgithub.com/o/r', 'http://github.com/o/r',
    'https://user:pass@github.com/o/r', 'https://github.com:8443/o/r', 'ftp://github.com/o/r', 'chrome://newtab/', 'about:blank', 'file:///c:/x', 'javascript:alert(1)', 'data:text/html,hi', '', 'not a url', 'github.com/o/r', null, undefined, 42];
  for (const url of no) assert.equal(repoFromTabUrl(url), null, String(url));
  assert.equal(repoFromTabUrl('https://github.com/SETTINGS/profile'), null); // reserved names are case-blind
  assert.equal(repoFromTabUrl('https://github.com/o/<script>'), null);
  assert.equal(repoFromTabUrl('https://github.com/o/a%20b'), null);
});

// ---- what the popup shows ----
const report = (counts, findings = []) => ({ repo: { owner: 'o', name: 'r' }, mood: 'calm', tilt: false, counts, findings, notes: null, receipt: null });
const finding = (id, bucket, over = {}) => ({ id, bucket, claimType: 'command', line: 4, quote: `q${id}`, name: `n${id}`, evidence: { file: null, detail: 'd' }, decidedBy: 'rule', confidence: null, lowConfidence: false, verifier: 'commands', link: 'https://github.com/o/r/blob/HEAD/README.md?plain=1#L4', ...over });

test('popup rows: the top 3 Contradicted, in report order, with the full count in the heading', () => {
  const fs = [1, 2, 3, 4, 5].map((i) => finding(`c${i}`, 'contradicted'));
  const p = popupRows(report({ contradicted: 5, missing: 2, unverifiable: 0, verified: 0 }, [...fs, finding('m1', 'missing'), finding('m2', 'missing')]));
  assert.equal(POPUP_ROWS, 3);
  assert.deepEqual([p.bucket, p.label, p.total, p.shown.length, p.hidden, p.heading], ['contradicted', 'CONTRADICTED', 5, 3, 2, 'CONTRADICTED (3 OF 5)']);
  assert.deepEqual(p.shown.map((r) => r.id), ['c1', 'c2', 'c3']);
});
test('popup rows: with 3 or fewer, the heading has just the count and nothing is hidden', () => {
  for (const n of [1, 2, 3]) {
    const p = popupRows(report({ contradicted: n, missing: 0, unverifiable: 0, verified: 0 }, Array.from({ length: n }, (_, i) => finding(`c${i}`, 'contradicted'))));
    assert.deepEqual([p.shown.length, p.hidden, p.heading], [n, 0, `CONTRADICTED (${n})`]);
  }
});
test('popup rows: no Contradicted means the top 3 Missing under their own heading', () => {
  const ms = [1, 2, 3, 4].map((i) => finding(`m${i}`, 'missing', { claimType: 'dependency' }));
  const p = popupRows(report({ contradicted: 0, missing: 4, unverifiable: 9, verified: 1 }, [...ms, finding('u1', 'unverifiable', { decidedBy: 'jev', confidence: 0.7 })]));
  assert.deepEqual([p.bucket, p.heading, p.shown.map((r) => r.id), p.hidden], ['missing', 'MISSING (3 OF 4)', ['m1', 'm2', 'm3'], 1]);
});
test('popup rows: Contradicted wins over Missing, and Unverifiable and Verified never show', () => {
  const p = popupRows(report({ contradicted: 1, missing: 3, unverifiable: 50, verified: 20 }, [finding('c1', 'contradicted'), ...[1, 2, 3].map((i) => finding(`m${i}`, 'missing'))]));
  assert.equal(p.bucket, 'contradicted');
  const only = popupRows(report({ contradicted: 0, missing: 0, unverifiable: 5, verified: 5 }, [finding('u1', 'unverifiable'), finding('v1', 'verified')]));
  assert.deepEqual([only.bucket, only.shown, only.heading], [null, [], null]);
});
test('popup rows: both empty gives nothing, so only the status strip and clew show', () => {
  assert.deepEqual(popupRows(report({ contradicted: 0, missing: 0, unverifiable: 0, verified: 0 })), { bucket: null, label: null, total: 0, shown: [], hidden: 0, heading: null });
  for (const name of ['clean-minimal']) {
    const r = runFixture(name).report;
    assert.equal(popupRows(r).bucket, r.counts.contradicted > 0 ? 'contradicted' : r.counts.missing > 0 ? 'missing' : null);
  }
});
test('popup rows: every fixture gives rows from real findings, at most 3', () => {
  for (const name of ['npm-start-drift', 'clean-minimal', 'missing-package', 'injection']) {
    const r = runFixture(name).report;
    const p = popupRows(r);
    assert.ok(p.shown.length <= 3, name);
    for (const row of p.shown) assert.ok(r.findings.some((f) => f.id === row.id), `${name}: ${row.id}`);
  }
});
test('popup text: the note under OPEN FULL REPORT and the two pre-scan lines are exactly as agreed', () => {
  assert.equal(FULL_REPORT_NOTE, 'OPENS THE SITE. PRESS SCAN FOR THE FULL LEDGER.');
  assert.equal(POPUP_TEXT.notRepo, 'OPEN A GITHUB REPO PAGE, THEN CLICK THE CLEW');
  assert.equal(POPUP_TEXT.ready, 'PRESS SCAN TO CHECK THIS REPO');
});

// ---- shared files ----
test('sync: every copy in extension/ is byte for byte the file in web/ (run node scripts/sync-extension.mjs if this fails)', () => {
  assert.deepEqual(drift(), []);
  assert.equal(plan().length, SHARED_JS.length + SHARED_CSS.length + MASCOTS.length);
});
test('sync: extension/shared and extension/mascot hold exactly the planned files and nothing stale', () => {
  assert.deepEqual(readdirSync(join(ROOT, 'extension/shared')).sort(), [...SHARED_JS, ...SHARED_CSS, 'README.txt'].sort());
  assert.deepEqual(readdirSync(join(ROOT, 'extension/mascot')).sort(), [...MASCOTS].sort());
  assert.match(ext('shared/README.txt'), /Do not edit them here/);
});
test('sync: the shared list is closed, so every file a shared file imports is also shared (the popup cannot break on a missing import)', () => {
  for (const f of SHARED_JS) {
    const src = readFileSync(join(ROOT, 'web', f), 'utf8');
    for (const m of src.matchAll(/^import .* from '(.+)';?$/gm)) {
      const target = m[1].replace(/^\.\//, '');
      assert.ok(SHARED_JS.includes(target), `web/${f} imports ${target}, which is not in the shared list`);
    }
  }
  // and nothing page-only is shared
  for (const pageOnly of ['app.js', 'render.js', 'navigate.js', 'tabs.js', 'fixture-mode.js']) assert.ok(!SHARED_JS.includes(pageOnly), pageOnly);
});
test('every import in extension/ resolves to a file inside extension/, so the unpacked folder loads on its own', () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(join(ROOT, 'extension'));
  assert.ok(files.length >= 16);
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/^import .* from '(.+)';?$/gm)) {
      assert.ok(m[1].startsWith('./'), `${f}: ${m[1]} must be a relative import`);
      const target = resolve(dirname(f), m[1]);
      assert.ok(target.startsWith(join(ROOT, 'extension')), `${f}: ${m[1]} leaves extension/`);
      assert.ok(existsSync(target), `${f}: ${m[1]} does not exist`);
    }
  }
});

// ---- the rules ----
test('no scan on open: the only call that starts a scan is inside runScan, and runScan is reached from a click handler only', () => {
  const c = code(popupJs);
  assert.equal((c.match(/fetchScan\(/g) ?? []).length, 1);
  assert.equal((c.match(/runScan\(/g) ?? []).length, 3, 'definition, the SCAN click, and TRY AGAIN');
  assert.match(c, /scanBtn\.addEventListener\('click', \(\) => \{ if \(repo\) runScan\(repo\); \}\);/);
  const init = c.slice(c.indexOf('async function init()'), c.indexOf('init();'));
  assert.doesNotMatch(init, /runScan|fetchScan|fetch\(/); // opening the popup never scans
  assert.match(c, /async function runScan\(target\) \{\s*if \(!state\.canScan\) return;/); // a second click during a scan is ignored
  assert.match(c, /fetchScan\(target\.url, \{ base: SITE_URL \}\)/);
  assert.doesNotMatch(c, /setTimeout|setInterval|while \(|retries|attempt/); // nothing retries by itself
});
test('chrome APIs: the popup uses chrome.tabs.query and nothing else', () => {
  const all = ['popup.js', 'popup-render.js', 'popup-model.js', 'tab-url.js'].map((f) => code(ext(f))).join('\n');
  const used = [...new Set([...all.matchAll(/\bchrome\.([a-zA-Z]+)\.([a-zA-Z]+)/g)].map((m) => `${m[1]}.${m[2]}`))];
  assert.deepEqual(used, ['tabs.query']);
  assert.doesNotMatch(all, /chrome\.(storage|cookies|history|scripting|webRequest|runtime\.sendMessage|downloads|tabs\.(create|update|executeScript))/);
  assert.doesNotMatch(all, /localStorage|sessionStorage|indexedDB|document\.cookie/); // nothing is stored
});
test('text only: no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, or Function in extension code', () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(join(ROOT, 'extension'));
  for (const f of files) assert.doesNotMatch(code(readFileSync(f, 'utf8')), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|setTimeout\(\s*['"`]/, f);
});
test('OPEN FULL REPORT: a plain link to the site with ?repo=, opened in a new tab without access to the popup', () => {
  const src = code(ext('popup-render.js'));
  assert.match(src, /const href = deepLink\(`\$\{report\.repo\.owner\}\/\$\{report\.repo\.name\}`\);/);
  assert.match(src, /el\('a', 'btn', 'OPEN FULL REPORT', \{ href, target: '_blank', rel: 'noopener noreferrer' \}\)/);
  assert.match(src, /el\('p', 'hint', FULL_REPORT_NOTE\)/);
  assert.equal(`${SITE_URL}/?repo=o/r`, 'https://readme-clew-2.vercel.app/?repo=o/r');
});
test('DOWNLOAD JSON is in the popup and saves the report it shows, with no new request', () => {
  const src = code(ext('popup-render.js'));
  assert.match(src, /el\('button', 'btn', 'DOWNLOAD JSON', \{ type: 'button' \}\)/);
  assert.match(src, /save\.addEventListener\('click', \(\) => downloadReport\(report\)\)/);
  assert.doesNotMatch(code(ext('shared/download.js')), /\bfetch\b|XMLHttpRequest|sendBeacon/);
});
test('the popup is 400 px wide (STYLE: 380 to 420) and fixed, with no horizontal scroll', () => {
  const css = ext('popup.css');
  const w = Number(css.match(/body\.popup\s*\{[^}]*\}|html,\s*body\.popup\s*\{[^}]*width:\s*(\d+)px/)?.[1] ?? css.match(/width:\s*(\d+)px/)[1]);
  assert.ok(w >= 380 && w <= 420, `width ${w}`);
  assert.match(css, /html, body\.popup \{ width: 400px; min-width: 400px; max-width: 400px;/);
  assert.match(css, /overflow-x: hidden/);
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/);
});
test('copy rules in popup files: no em dashes and none of the banned filler words', () => {
  const banned = /[\u2014\u2013]|\b(delve|landscape|straightforward|genuinely|honestly|seamless|robust)\b/i;
  for (const f of ['popup.html', 'popup.js', 'popup-model.js', 'popup-render.js', 'popup.css', 'manifest.json', 'tab-url.js']) {
    assert.doesNotMatch(ext(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), banned, f);
  }
});
test('content.js is a comment-only stub and is not in the manifest', () => {
  const src = ext('content.js');
  assert.equal(src.replace(/\/\/.*$/gm, '').trim(), '');
  assert.ok(!JSON.stringify(manifest).includes('content.js'));
});
test('the extension holds no keys or secrets, and no file in it is over the 200-line cap', () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  walk(join(ROOT, 'extension'));
  for (const f of files.filter((p) => /\.(js|css|html|json|txt)$/.test(p))) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /GLASSER_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|sk-ant-|Bearer\s/i, f);
    assert.ok(text.split('\n').length <= 201, `${f} is over 200 lines`);
  }
});
