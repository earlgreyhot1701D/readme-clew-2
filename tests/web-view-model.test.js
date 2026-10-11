// Pure functions behind the live page (web/view-model.js and web/fixture-mode.js). Offline, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  statusStrip, fallbackLine, bubbleText, clewPose, safeLink, rowModel, evidenceText, bucketSections, countChips,
  recordFields, footerText, lines, formatScanTime, formatMs, parseRepoInput, deepLinkRepo, errorState, loadingText, STATES, MOODS, DEMO_REPO,
} from '../web/view-model.js';
import { FIXTURES, fixtureName, isDevHost, loadFixture } from '../web/fixture-mode.js';

const fixturesDir = new URL('../fixtures/expected/', import.meta.url);
const load = (n) => JSON.parse(readFileSync(new URL(`${n}.json`, fixturesDir), 'utf8'));
const BANNED = /[\u2014\u2013]|\b(delve|landscape|straightforward|genuinely|honestly|seamless|robust)\b/i;

test('statusStrip: the four texts from STYLE 6, and no confidence number', () => {
  assert.equal(statusStrip('tangled', { contradicted: 3 }).text, 'DRIFT FOUND // 3 CONTRADICTED');
  assert.equal(statusStrip('worried', { missing: 2 }).text, 'GAPS FOUND // 2 MISSING');
  assert.equal(statusStrip('curious', {}).text, 'MOSTLY UNVERIFIABLE // FEW CLAIMS COULD BE CHECKED');
  assert.equal(statusStrip('calm', {}).text, 'NO DRIFT FOUND IN CHECKED CLAIMS');
  assert.equal(statusStrip('nonsense', {}).mood, 'calm'); // an unknown mood falls back to calm
  for (const m of MOODS) assert.doesNotMatch(statusStrip(m, {}).text, /\d\.\d/);
});
test('fallbackLine and bubbleText: a fixed line per mood, and Haiku text only when it is a non-empty string', () => {
  for (const m of MOODS) { assert.ok(fallbackLine(m).length > 10); assert.doesNotMatch(fallbackLine(m), BANNED); }
  assert.equal(new Set(MOODS.map(fallbackLine)).size, 4);
  assert.equal(bubbleText({ mood: 'tangled', notes: { summary: 'From Haiku.' } }), 'From Haiku.');
  for (const notes of [null, undefined, { summary: null }, { summary: '   ' }, { summary: 42 }]) {
    assert.equal(bubbleText({ mood: 'worried', notes }), fallbackLine('worried'));
  }
});
test('clewPose: tilt.png for calm and curious, the mood picture for worried and tangled, never a CSS rotation, calm for junk', () => {
  assert.deepEqual(clewPose('calm', true), { file: 'tilt' });
  assert.deepEqual(clewPose('curious', true), { file: 'tilt' });
  assert.deepEqual(clewPose('tangled', true), { file: 'tangled' });
  assert.deepEqual(clewPose('worried', true), { file: 'worried' });
  assert.deepEqual(clewPose('tangled', false), { file: 'tangled' });
  assert.deepEqual(clewPose('calm', false), { file: 'calm' });
  assert.deepEqual(clewPose('../evil', true), { file: 'tilt' });
  assert.deepEqual(clewPose('../evil', false), { file: 'calm' });
  assert.equal(clewPose('tangled', true).rotate, undefined);
});
test('rowModel: a rule row has no confidence bar and says DECIDED BY: RULE', () => {
  const r = rowModel(load('npm-start-drift').findings[0]);
  assert.equal(r.decidedLabel, 'DECIDED BY: RULE');
  assert.equal(r.showConfidence, false);
  assert.equal(r.confidence, null);
  assert.equal(r.lineLabel, 'L6');
  assert.equal(r.link, 'https://github.com/fixture/npm-start-drift/blob/HEAD/README.md?plain=1#L6');
  assert.equal(r.typeLabel, 'COMMAND');
  // even a stray confidence value on a rule row never draws a bar
  assert.equal(rowModel({ ...load('npm-start-drift').findings[0], confidence: 0.9 }).showConfidence, false);
});
test('rowModel: a Jev row shows its confidence, and a low-confidence row is tagged', () => {
  const f = { id: 'x', bucket: 'unverifiable', claimType: 'dependency', line: 3, quote: 'q', evidence: { file: null, detail: 'd' }, decidedBy: 'jev', confidence: 0.746, lowConfidence: true, link: 'https://github.com/a/b/blob/HEAD/README.md?plain=1#L3' };
  const r = rowModel(f);
  assert.equal(r.decidedLabel, 'DECIDED BY: JEV');
  assert.equal(r.showConfidence, true);
  assert.equal(r.confidence, '0.75');
  assert.equal(r.confidencePct, 75);
  assert.equal(r.unsure, true);
  assert.equal(rowModel({ ...f, lowConfidence: false }).unsure, false);
  assert.equal(rowModel({ ...f, confidence: 7 }).confidencePct, 100); // clamped
});
test('rowModel: a Missing row says CODE ONLY, has no link, and shows the code name', () => {
  const m = load('missing-package').findings.find((f) => f.bucket === 'missing');
  const r = rowModel(m);
  assert.equal(r.lineLabel, 'CODE ONLY');
  assert.equal(r.link, null);
  assert.equal(r.isQuote, false);
  assert.equal(r.headline, m.name);
});
test('rowModel: the quote is passed through byte for byte, and only github.com https links are kept', () => {
  const q = '  Run `NPM Start`   (CASE and  spaces stay) <b>x</b>  ';
  const f = { id: 'x', bucket: 'verified', claimType: 'command', line: 9, quote: q, evidence: null, decidedBy: 'rule', confidence: null, link: 'https://github.com/a/b' };
  assert.equal(rowModel(f).headline, q);
  for (const link of ['javascript:alert(1)', 'http://github.com/a/b', 'https://evil.example/github.com/', 'data:text/html,x', null]) {
    assert.equal(rowModel({ ...f, link }).link, null, String(link));
    assert.equal(safeLink(link), null);
  }
});
test('evidenceText: skips a null file, and skips the file when the detail already starts with it', () => {
  assert.equal(evidenceText({ file: 'package.json', detail: 'scripts has dev' }), 'package.json: scripts has dev');
  assert.equal(evidenceText({ file: null, detail: 'No package name' }), 'No package name');
  assert.equal(evidenceText({ file: 'src/index.js', detail: 'src/index.js imports lodash' }), 'src/index.js imports lodash');
  assert.equal(evidenceText(null), '');
});
test('bucketSections: Contradicted, Missing, Unverifiable, Verified in that order; empty buckets are open and say NONE FOUND', () => {
  const s = bucketSections(load('npm-start-drift'));
  assert.deepEqual(s.map((x) => x.bucket), ['contradicted', 'missing', 'unverifiable', 'verified']);
  assert.deepEqual(s.map((x) => x.count), [1, 0, 0, 1]);
  assert.deepEqual(s.map((x) => x.empty), [false, true, true, false]);
  assert.deepEqual(s.map((x) => x.open), [true, true, true, false]); // empty buckets open, a non-empty Verified starts closed
  const full = bucketSections(load('jev-confident-mislabel')); // 2 Unverifiable rows, nothing else
  assert.deepEqual(full.map((x) => x.open), [true, true, false, true]);
  assert.deepEqual(countChips({ verified: 1, contradicted: 2 }).map((c) => [c.bucket, c.count]), [['contradicted', 2], ['missing', 0], ['unverifiable', 0], ['verified', 1]]);
});
test('recordFields and footerText: values come from the report, a null receipt shows a dash, and units are plural-correct', () => {
  const r = load('npm-start-drift');
  const f = Object.fromEntries(recordFields(r).map((x) => [x.label, x.value]));
  assert.deepEqual(f, { REPO: 'fixture/npm-start-drift', COMMIT: '-', 'README LINES': '8', 'SENT TO JEV': '1', MODEL: 'jev-1.13.0', TIME: '0 ms' });
  assert.equal(footerText(r), 'DECIDED BY RULES: 7 LINES // DECIDED BY JEV: 1 LINE');
  assert.equal(footerText({ meta: {} }), 'DECIDED BY RULES: - LINES // DECIDED BY JEV: - LINES');
  assert.equal(recordFields({ repo: {}, receipt: { commit: 'abc1234' }, meta: { ms: 3616 } }).find((x) => x.label === 'COMMIT').value, 'abc1234');
  assert.deepEqual([lines(0), lines(1), lines(2)], ['0 LINES', '1 LINE', '2 LINES']);
});
test('formatScanTime and formatMs: readable, always UTC, and a dash for junk', () => {
  assert.equal(formatScanTime('2026-10-11T01:51:34.253Z'), '2026-10-11 01:51 UTC');
  assert.equal(formatScanTime(new Date('2026-10-09T18:22:04Z')), '2026-10-09 18:22 UTC');
  for (const bad of ['', 'not a date', null, undefined, 42]) assert.equal(formatScanTime(bad), '-', String(bad));
  assert.deepEqual([formatMs(0), formatMs(640), formatMs(1000), formatMs(3616)], ['0 ms', '640 ms', '1.0 s', '3.6 s']);
  for (const bad of [-1, NaN, '5', null, undefined]) assert.equal(formatMs(bad), '-', String(bad));
});
test('parseRepoInput: GitHub URLs and owner/name are accepted; other hosts, schemes, userinfo, ports, and junk are not', () => {
  for (const ok of ['https://github.com/o/r', 'https://github.com/o/r/', 'https://github.com/o/r.git', 'https://github.com/o/r/tree/main/src', '  o/r  ']) {
    const p = parseRepoInput(ok);
    assert.equal(p.ok, true, ok);
    assert.equal(p.url, 'https://github.com/o/r', ok);
  }
  for (const bad of ['http://github.com/o/r', 'https://gitlab.com/o/r', 'https://github.com.evil.com/o/r', 'https://u:p@github.com/o/r', 'https://github.com:8080/o/r',
    'javascript:alert(1)', 'https://github.com/o', 'https://github.com/', 'o/', '/r', 'o/r/extra', 'https://github.com/-bad-owner-/r', 'https://github.com/o/..', '', null, 42, `https://github.com/o/${'x'.repeat(400)}`]) {
    assert.equal(parseRepoInput(bad).ok, false, String(bad).slice(0, 40));
  }
  assert.equal(parseRepoInput(DEMO_REPO).ok, true);
});
test('deepLinkRepo: a valid ?repo= is returned as a full URL; everything else is null', () => {
  assert.equal(deepLinkRepo('?repo=lukeed/polka'), 'https://github.com/lukeed/polka');
  assert.equal(deepLinkRepo('?repo=https%3A%2F%2Fgithub.com%2Fo%2Fr'), 'https://github.com/o/r');
  for (const bad of ['', '?repo=', '?repo=javascript:alert(1)', '?repo=<script>', '?other=o/r', '?repo=o/r/x']) assert.equal(deepLinkRepo(bad), null, bad);
});
test('errorState: every failure maps to a STYLE 11 text, and unknown failures say the scan failed', () => {
  assert.equal(errorState(404, 'github_not_found'), STATES.notFound);
  assert.equal(errorState(404, 'github_no_readme'), STATES.notFound);
  assert.equal(errorState(422, 'not_js_repo'), STATES.notJs);
  assert.equal(STATES.notJs, 'NOT A JS/TS REPO // THIS TOOL CHECKS package.json PROJECTS');
  assert.equal(errorState(429, 'rate_limited'), STATES.rateLimited);
  assert.equal(errorState(400, 'bad_url'), STATES.badInput);
  for (const [s, c] of [[500, 'internal'], [504, 'jev_timeout'], [502, 'github_unavailable'], [0, undefined], [422, 'jev_too_large']]) assert.equal(errorState(s, c), STATES.failed, `${s} ${c}`);
  assert.equal(loadingText('o', 'r'), 'SCANNING o/r ...');
  for (const t of Object.values(STATES)) assert.doesNotMatch(t, BANNED);
});
test('every fixture report goes through the view model without throwing, and no UI string breaks the writing rules', () => {
  for (const name of readdirSync(fixturesDir).map((f) => f.replace(/\.json$/, ''))) {
    const r = load(name);
    const secs = bucketSections(r);
    assert.equal(secs.reduce((n, s) => n + s.count, 0), r.findings.length, name);
    assert.doesNotMatch(statusStrip(r.mood, r.counts).text, BANNED, name);
    assert.doesNotMatch(footerText(r), BANNED, name);
    clewPose(r.mood, r.tilt); bubbleText(r); recordFields(r);
  }
});
test('fixture mode: only allowlisted names on localhost; traversal, odd names, and production hosts are refused', () => {
  assert.equal(fixtureName('?fixture=npm-start-drift', 'localhost'), 'npm-start-drift');
  assert.equal(fixtureName('?fixture=pnpm-monorepo', '127.0.0.1'), 'pnpm-monorepo');
  for (const bad of ['?fixture=../package', '?fixture=npm-start-drift.json', '?fixture=constructor', '?fixture=__proto__', '?fixture=', '?fixture=%2e%2e%2fx', '?x=1']) {
    assert.equal(fixtureName(bad, 'localhost'), null, bad);
  }
  assert.equal(fixtureName('?fixture=npm-start-drift', 'readme-clew-2.vercel.app'), null);
  assert.equal(fixtureName('?fixture=npm-start-drift', 'localhost.evil.com'), null);
  assert.equal(isDevHost('localhost'), true);
});
test('fixture mode: the allowlist matches the files in fixtures/expected exactly, and loadFixture refuses anything else', async () => {
  const onDisk = readdirSync(fixturesDir).map((f) => f.replace(/\.json$/, ''));
  for (const n of FIXTURES) assert.ok(onDisk.includes(n), `${n} is allowlisted but has no file`);
  assert.ok(FIXTURES.includes('pnpm-monorepo'));
  await assert.rejects(loadFixture('../../package'), /Unknown fixture/);
  assert.throws(() => FIXTURES.push('x'), TypeError); // frozen
});
