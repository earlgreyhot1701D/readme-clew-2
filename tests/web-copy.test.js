// The written copy on the page: intro, HOW?, tabs, KEY, ABOUT, links, footer. Read straight from web/index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SITE_URL, deepLink } from '../web/site.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&#8599;/g, '\u2197').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const body = text(html.slice(html.indexOf('<body>')));
const BANNED = /[\u2014\u2013]|\b(delve|landscape|straightforward|genuinely|honestly|seamless|robust)\b/i;
const panel = (id) => { const s = html.indexOf(`id="${id}"`); const next = html.indexOf('</div>\n\n', s); return html.slice(s, next === -1 ? undefined : next); };

test('intro line sits under the title, with a HOW? button wired as a disclosure', () => {
  assert.match(html, /<h1>README CLEW 2 \/\/ CLAIM LEDGER<\/h1>/);
  const tagline = html.indexOf('<p class="tagline">Checks whether a GitHub README matches its code.</p>');
  assert.ok(tagline > html.indexOf('<h1>'), 'the intro line is under the title');
  assert.ok(tagline < html.indexOf('id="how-btn"'), 'and the HOW? button comes right after it');
  const btn = html.match(/<button id="how-btn"[^>]*>HOW\?<\/button>/)[0];
  assert.match(btn, /type="button"/);
  assert.match(btn, /aria-expanded="false"/);
  assert.match(btn, /aria-controls="how-panel"/);
  assert.match(html, /<p id="how-panel"[^>]*\bhidden\b/); // closed until opened, no hover tooltip
  assert.doesNotMatch(html, /\btitle="[^"]*(?:HOW|how it works)/); // not a tooltip
});
test('HOW? opens the exact text from the brief', () => {
  const how = text(html.match(/<p id="how-panel"[^>]*>([\s\S]*?)<\/p>/)[1]);
  assert.equal(how, "We read the README line by line. Code checks test each claim against the repo's package.json, scripts, files and env vars. Jev, an AI that only picks labels, sorts the lines rules can't. Claude Haiku writes the summary from the results. Neither AI decides what's true.");
});
test('tabs: three real buttons SCAN, KEY, ABOUT with aria-selected; SCAN is selected; each controls a tabpanel', () => {
  const tabs = [...html.matchAll(/<button id="tab-(\w+)"[^>]*>(\w+)<\/button>/g)].map((m) => ({ id: m[1], label: m[2], tag: m[0] }));
  assert.deepEqual(tabs.map((t) => t.label), ['SCAN', 'KEY', 'ABOUT']);
  assert.deepEqual(tabs.map((t) => /aria-selected="true"/.test(t.tag)), [true, false, false]);
  for (const t of tabs) {
    assert.match(t.tag, /role="tab"/);
    assert.match(t.tag, /type="button"/);
    assert.match(t.tag, new RegExp(`aria-controls="panel-${t.id}"`));
    assert.match(html, new RegExp(`id="panel-${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}"`));
  }
  assert.match(html, /id="panel-key"[^>]*\bhidden\b/);
  assert.match(html, /id="panel-about"[^>]*\bhidden\b/);
  assert.doesNotMatch(html.match(/id="panel-scan"[^>]*>/)[0], /\bhidden\b/);
  assert.ok(html.indexOf('role="tablist"') > html.indexOf('</header>'), 'tabs sit below the title strip');
});
test('the scan form lives in the SCAN panel only', () => {
  assert.ok(panel('panel-scan').includes('id="scan-form"'));
  assert.ok(!panel('panel-key').includes('<form'));
  assert.ok(!panel('panel-about').includes('<form'));
  assert.equal((html.match(/<form\b/g) ?? []).length, 1);
});
test('KEY: the four buckets with their meanings, RULE vs JEV, the confidence note, and the L42 / CODE ONLY note', () => {
  const key = text(panel('panel-key'));
  assert.match(key, /CONTRADICTED The README says it, the code disagrees\./);
  assert.match(key, /MISSING The code does it, the README never mentions it\./);
  assert.match(key, /UNVERIFIABLE Can't be checked from code, or Jev wasn't sure\./);
  assert.match(key, /VERIFIED The README and the code agree\./);
  for (const b of ['contradicted', 'missing', 'unverifiable', 'verified']) assert.match(panel('panel-key'), new RegExp(`key-item b-${b}`));
  assert.match(key, /DECIDED BY: RULE/);
  assert.match(key, /DECIDED BY: JEV/);
  assert.match(key, /JEV CONFIDENCE How sure Jev is about what kind of line it is, not whether the claim is true\. A 0\.99 on an Unverifiable row is normal\./);
  assert.match(key, /Click L42 \u2197 on any row to open that exact README line on GitHub\./);
  assert.match(key, /CODE ONLY rows have no README line/);
});
test('ABOUT: three steps, the limits, and the address', () => {
  const about = text(panel('panel-about'));
  assert.match(about, /1\. RULES/);
  assert.match(about, /2\. JEV LABELS/);
  assert.match(about, /3\. HAIKU EXPLAINS/);
  assert.match(about, /JS\/TS ONLY .*package\.json holds both the packages and the commands.*Other languages are planned, not built\./);
  assert.match(about, /MONOREPOS .*pnpm-workspace\.yaml.*workspaces.*dir\/\*.*exact dirs.*up to 30 workspaces/);
  assert.match(about, /SCANS NEVER STORED Public repos only\./);
  assert.match(about, /ANALYTICS Anonymous page-view counts through Vercel Analytics\. No cookies\. Scans are never stored\./);
  assert.match(about, /HAIKU CAN BE DOWN .*the report still works/);
  assert.match(about, /Neither AI decides what's true\./);
});
test('ABOUT links: all six, exact URLs, each opens safely with rel noopener', () => {
  const links = [...panel('panel-about').matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
  const want = {
    'clewlabs.org': 'https://clewlabs.org',
    'GitHub repo': 'https://github.com/earlgreyhot1701D/readme-clew-2',
    AdaL: 'https://adalagent.ai',
    Glasser: 'https://glasser.ai',
    TypeSafe: 'https://typesafe.ai',
    Anthropic: 'https://www.anthropic.com',
  };
  const got = Object.fromEntries(links.map((m) => [m[2], m[1]]));
  for (const [name, url] of Object.entries(want)) assert.equal(got[name], url, name);
  for (const m of links) {
    assert.match(m[0], /rel="noopener noreferrer"/, m[1]);
    assert.match(m[0], /target="_blank"/, m[1]);
  }
});
test('footer: the exact line, outside every tab panel so it shows on all three', () => {
  const foot = html.match(/<footer class="strip site-footer">([\s\S]*?)<\/footer>/);
  assert.ok(foot);
  assert.equal(text(foot[1]), 'Built with AdaL // Jev by TypeSafe via Glasser // Summary by Claude Haiku // AI assisted. Human approved. Powered by NLP.');
  const f = html.indexOf('<footer');
  for (const id of ['panel-scan', 'panel-key', 'panel-about']) {
    const open = html.indexOf(`id="${id}"`);
    const close = html.indexOf('</div>\n\n', open) === -1 ? html.indexOf('</div>\n\n    <footer', open) : html.indexOf('</div>\n\n', open);
    assert.ok(f > open && !(f > open && f < close), `${id} must not contain the footer`);
  }
});
test('writing rules: no em dashes, no filler words anywhere in the page copy', () => {
  assert.doesNotMatch(body, BANNED);
});
test('the public address is the production domain everywhere, and no hashed preview URL appears in web/', () => {
  assert.equal(SITE_URL, 'https://readme-clew-2.vercel.app');
  assert.equal(deepLink('o/r'), 'https://readme-clew-2.vercel.app/?repo=o/r');
  const aboutAddress = panel('panel-about');
  assert.ok(aboutAddress.includes(`href="${SITE_URL}"`));
  assert.ok(aboutAddress.includes(`${SITE_URL}/?repo=owner/name`));
  for (const f of readdirSync(new URL('../web/', import.meta.url), { recursive: true })) {
    if (!/\.(html|js|css|svg|json)$/.test(f)) continue;
    const src = readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /[a-z0-9-]+-[a-z0-9]{8,}-[a-z0-9-]+\.vercel\.app/i, `${f} has a hashed preview URL`);
    assert.doesNotMatch(src, /localhost|127\.0\.0\.1/.test(f) ? /$^/ : /https?:\/\/(?:localhost|127\.0\.0\.1)/, `${f} has a local URL`);
  }
});
test('render-sections.js wires every section as a disclosure with the row limit and SHOW ALL', () => {
  const src = readFileSync(new URL('../web/render-sections.js', import.meta.url), 'utf8');
  assert.match(src, /bindDisclosure\(btn, body, \{\s*open: sec\.open/);
  assert.match(src, /'aria-controls': id/);
  assert.match(src, /visibleRows\(sec\.rows\)/);
  assert.match(src, /showAllLabel\(sec\.count\)/);
  assert.match(src, /sec\.rows\.slice\(ROW_LIMIT\)/);
  assert.match(src, /if \(open && !built\)/, 'rows are built only when a section is first opened');
});
// ---- Phase C wiring (static checks on what the page is built from) ----
const src = (p) => readFileSync(new URL(`../web/${p}`, import.meta.url), 'utf8');

test('input: the placeholder names both accepted forms, and the parser really accepts both', async () => {
  assert.match(html, /placeholder="owner\/repo or https:\/\/github\.com\/owner\/repo"/);
  const { parseRepoInput } = await import('../web/view-model.js');
  assert.equal(parseRepoInput('owner/repo').ok, true);
  assert.equal(parseRepoInput('https://github.com/owner/repo').ok, true);
});
test('USE DEMO REPO is a button that fills the field with earlgreyhot1701D/readme-clew and never scans', async () => {
  const btn = html.match(/<button id="demo-btn"[^>]*>USE DEMO REPO<\/button>/)?.[0];
  assert.ok(btn, 'the button is missing');
  assert.match(btn, /type="button"/); // not a submit button
  assert.ok(panel('panel-scan').includes('id="demo-btn"'));
  const { DEMO_SHORT, parseRepoInput } = await import('../web/view-model.js');
  assert.equal(DEMO_SHORT, 'earlgreyhot1701D/readme-clew');
  assert.equal(parseRepoInput(DEMO_SHORT).ok, true);
  const app = src('app.js');
  const handler = app.slice(app.indexOf("getElementById('demo-btn')"), app.indexOf('// Tabs, the HOW?'));
  assert.match(handler, /input\.value = DEMO_SHORT/);
  assert.doesNotMatch(handler, /fetch|dispatch|submit|requestSubmit|scan/i);
});
test('rescan wiring: the banner sits above the report, and a scan only ever redraws the banner until a new report arrives', () => {
  const scanPanel = panel('panel-scan');
  assert.ok(scanPanel.indexOf('id="banner"') > -1 && scanPanel.indexOf('id="banner"') < scanPanel.indexOf('id="out"'));
  const app = src('app.js');
  assert.match(app, /renderState\(banner,/);
  assert.doesNotMatch(app, /renderState\(out/); // the report area is never replaced by a state strip
  assert.match(app, /button\.disabled = !state\.canScan/);
  assert.match(app, /out\.setAttribute\('aria-busy'/);
  assert.match(app, /if \(!state\.canScan\) return;/);
  // the old report is only replaced in the success branch
  const submit = app.slice(app.indexOf("form.addEventListener('submit'"), app.indexOf('// USE DEMO REPO'));
  assert.equal((submit.match(/showReport\(/g) ?? []).length, 1);
  assert.ok(submit.indexOf('showReport(') > submit.indexOf('if (result.report)'));
});
test('count chips are buttons with a "go to section" name, wired to goToSection', () => {
  const render = src('render.js');
  assert.match(render, /el\('button', `chip b-\$\{c\.bucket\}`, null, \{ type: 'button', 'aria-label': chipLabel\(c\.bucket, c\.count\) \}\)/);
  assert.match(render, /chip\.addEventListener\('click', \(\) => goToSection\(c\.bucket\)\)/);
  assert.doesNotMatch(render, /el\('div', `chip/);
});
test('bucket notes: a line under the header only when a note exists, as text, with no placeholder', () => {
  const sections = src('render-sections.js');
  assert.match(sections, /if \(sec\.note\) s\.append\(el\('p', 'bucket-note', sec\.note\)\)/);
  const [iHead, iNote, iBody] = ['s.append(head);', "el('p', 'bucket-note'", 's.append(body);'].map((t) => sections.indexOf(t));
  assert.ok(iHead > -1 && iNote > -1 && iBody > -1, 'header, note, and body must all be appended');
  assert.ok(iHead < iNote, 'the note sits under the header');
  assert.ok(iNote < iBody, 'and above the rows');
  assert.doesNotMatch(sections.replace(/\/\/.*$/gm, ''), /bucket-note[^\n]*(?:No note|unavailable|n\/a|\.\.\.)/i); // code only, comments aside
});
test('after a scan the page lands on the first problem bucket (real scans only, not the dev fixture render)', () => {
  const app = src('app.js');
  assert.match(app, /showReport\(result\.report, \{ land: true \}\)/);
  assert.match(app, /showReport\(report, \{ land: false \}\)/);
  assert.match(app, /if \(land\) landAfterScan\(report\.counts\)/);
});
test('the report footer links to the ABOUT tab, not to a GitHub anchor that may not exist', () => {
  const render = readFileSync(new URL('../web/render.js', import.meta.url), 'utf8');
  assert.match(render, /'HONEST LIMITATIONS'[^)]*'data-goto-tab': 'about'/);
  assert.doesNotMatch(render, /#honest-limitations/);
});
