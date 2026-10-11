// What Jev decided on an Unverifiable row, in words (web/verdict.js). The bar is only for rows that went to a code check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { jevVerdict, JEV_CHECKABLE, GATE_BAR } from '../web/verdict.js';
import { rowModel } from '../web/view-model.js';
import { THRESHOLD, VERIFIER_BOUND } from '../lib/gate.js';

const row = (over = {}) => ({ id: 'f', bucket: 'unverifiable', claimType: 'unverifiable', line: 4, quote: 'text', name: null, evidence: { file: null, detail: 'd' }, decidedBy: 'jev', confidence: 0.95, lowConfidence: false, verifier: null, link: 'https://github.com/o/r/blob/HEAD/README.md?plain=1#L4', ...over });
const fixtures = () => readdirSync(new URL('../fixtures/expected/', import.meta.url)).map((f) => JSON.parse(readFileSync(new URL(`../fixtures/expected/${f}`, import.meta.url), 'utf8')));

test('string 1: a code type under the bar reads "JEV THOUGHT: <TYPE> (0.62), BELOW THE 0.8 BAR"', () => {
  assert.equal(jevVerdict(row({ claimType: 'command', confidence: 0.62, lowConfidence: true })), 'JEV THOUGHT: COMMAND (0.62), BELOW THE 0.8 BAR');
  assert.equal(jevVerdict(row({ claimType: 'dependency', confidence: 0.746, lowConfidence: true })), 'JEV THOUGHT: DEPENDENCY (0.75), BELOW THE 0.8 BAR');
  assert.equal(jevVerdict(row({ claimType: 'env_var', confidence: 0.7, lowConfidence: true })), 'JEV THOUGHT: ENV VAR (0.70), BELOW THE 0.8 BAR'); // underscore becomes a space, two decimals
  assert.equal(jevVerdict(row({ claimType: 'file_or_url', confidence: 0.71, lowConfidence: true })), 'JEV THOUGHT: FILE OR URL (0.71), BELOW THE 0.8 BAR');
});
test('string 2: any other type reads "JEV: NOT A CHECKABLE CLAIM (0.95 SURE)"', () => {
  assert.equal(jevVerdict(row({ claimType: 'unverifiable', confidence: 0.95 })), 'JEV: NOT A CHECKABLE CLAIM (0.95 SURE)');
  assert.equal(jevVerdict(row({ claimType: 'unverifiable', confidence: 0.65 })), 'JEV: NOT A CHECKABLE CLAIM (0.65 SURE)'); // a low number is still just how sure Jev is
  assert.equal(jevVerdict(row({ claimType: 'marketing', confidence: 0.9 })), 'JEV: NOT A CHECKABLE CLAIM (0.90 SURE)'); // any other type, not only "unverifiable"
  assert.equal(jevVerdict(row({ claimType: 'not_a_claim', confidence: 0.99 })), 'JEV: NOT A CHECKABLE CLAIM (0.99 SURE)');
  assert.equal(jevVerdict(row({ claimType: undefined, confidence: 0.8 })), 'JEV: NOT A CHECKABLE CLAIM (0.80 SURE)');
});
test('no number is made up: a missing confidence leaves the number out', () => {
  assert.equal(jevVerdict(row({ confidence: null })), 'JEV: NOT A CHECKABLE CLAIM');
  assert.equal(jevVerdict(row({ claimType: 'command', confidence: null, lowConfidence: true })), 'JEV THOUGHT: COMMAND, BELOW THE 0.8 BAR');
  assert.equal(jevVerdict(row({ confidence: NaN })), 'JEV: NOT A CHECKABLE CLAIM');
});
test('a row that went to a code check keeps the bar: a code type that was sure enough has no verdict', () => {
  for (const t of ['dependency', 'command', 'env_var', 'file_or_url']) {
    assert.equal(jevVerdict(row({ claimType: t, confidence: 0.92, lowConfidence: false })), null, t);
    const m = rowModel(row({ claimType: t, confidence: 0.92, lowConfidence: false }));
    assert.equal(m.showConfidence, true, t);
    assert.equal(m.verdict, null, t);
    assert.equal(m.confidence, '0.92', t);
  }
});
test('only Unverifiable rows decided by Jev get a verdict: Verified, Contradicted, Missing, and rule rows never do', () => {
  for (const bucket of ['verified', 'contradicted', 'missing']) {
    assert.equal(jevVerdict(row({ bucket, claimType: 'unverifiable' })), null, bucket);
    assert.equal(jevVerdict(row({ bucket, claimType: 'command', lowConfidence: true, confidence: 0.5 })), null, bucket);
  }
  assert.equal(jevVerdict(row({ decidedBy: 'rule', confidence: null })), null);
  assert.equal(jevVerdict(null), null);
  assert.equal(jevVerdict(undefined), null);
  // a Verified row decided by Jev keeps its bar
  const v = rowModel(row({ bucket: 'verified', claimType: 'dependency', confidence: 0.97 }));
  assert.deepEqual([v.showConfidence, v.verdict, v.confidence], [true, null, '0.97']);
});
test('a verdict row has no bar and no confidence label: plain text only', () => {
  for (const f of [row({ claimType: 'unverifiable', confidence: 0.95 }), row({ claimType: 'command', confidence: 0.62, lowConfidence: true })]) {
    const m = rowModel(f);
    assert.equal(m.showConfidence, false);
    assert.equal(typeof m.verdict, 'string');
    assert.equal(m.confidencePct, null);
    assert.equal(m.confidence, null);
  }
  const sections = readFileSync(new URL('../web/render-sections.js', import.meta.url), 'utf8');
  assert.match(sections, /if \(r\.verdict\) row\.append\(el\('p', 'verdict', r\.verdict\)\);/); // textContent, a plain paragraph
  assert.ok(sections.indexOf("el('p', 'verdict'") < sections.indexOf('if (r.showConfidence)'));
});
test('the low-confidence tag still shows on a THOUGHT row, and a NOT A CHECKABLE CLAIM row is not tagged', () => {
  assert.equal(rowModel(row({ claimType: 'command', confidence: 0.62, lowConfidence: true })).unsure, true);
  assert.equal(rowModel(row({ claimType: 'unverifiable', confidence: 0.95 })).unsure, false);
});
test('the web copy of the rules matches lib/gate.js: same code types, same bar', () => {
  assert.equal(GATE_BAR, THRESHOLD);
  assert.deepEqual([...JEV_CHECKABLE].sort(), [...VERIFIER_BOUND].sort());
});
test('every fixture row: a Jev row never shows both a bar and a verdict, and Unverifiable Jev rows show one of the two', () => {
  let seen = 0;
  for (const report of fixtures()) {
    for (const f of report.findings) {
      const m = rowModel(f);
      assert.ok(!(m.showConfidence && m.verdict), `${f.id}: both`);
      if (f.bucket === 'unverifiable' && f.decidedBy === 'jev') {
        seen += 1;
        assert.ok(m.showConfidence || m.verdict, `${f.id}: Jev unverifiable row shows neither the bar nor words`);
      }
      if (f.decidedBy === 'rule') assert.equal(m.verdict, null);
    }
  }
  assert.ok(seen > 0, 'no Jev Unverifiable rows were found, so this test proved nothing');
});
test('the real v1 scan: 31 THOUGHT rows, 86 NOT A CHECKABLE CLAIM rows, 23 rows with a bar (the Unverifiable bucket, 140 rows)', async () => {
  const { existsSync } = await import('node:fs');
  const p = new URL(`file:///${process.env.TEMP?.replace(/\\/g, '/')}/live-scan2.json`);
  if (!process.env.TEMP || !existsSync(p)) return; // the saved live scan is a local file, not part of the repo
  const report = JSON.parse(readFileSync(p, 'utf8'));
  const rows = report.findings.filter((f) => f.bucket === 'unverifiable' && f.decidedBy === 'jev').map(rowModel);
  assert.equal(rows.length, 140);
  assert.equal(rows.filter((r) => r.verdict?.startsWith('JEV THOUGHT')).length, 31);
  assert.equal(rows.filter((r) => r.verdict?.startsWith('JEV: NOT A CHECKABLE CLAIM')).length, 86);
  assert.equal(rows.filter((r) => r.showConfidence).length, 23);
});
test('KEY explains both strings, and the page copy has no leftover "0.99 is normal" line', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('NOT A CHECKABLE CLAIM, with how sure Jev is of that'));
  assert.ok(html.includes('THOUGHT, with the type Jev guessed and a number under the 0.8 bar'));
  assert.ok(html.includes('On rows that went to a code check, the bar shows how sure Jev is'));
  assert.ok(!html.includes('A 0.99 on an Unverifiable row is normal'));
});
