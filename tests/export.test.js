// JSON export (M18): the file name, the JSON round trip, and the download step with a fake DOM. Nothing is sent anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { exportFileName, reportToJson } from '../web/export.js';
import { downloadReport } from '../web/download.js';

const fixture = (n) => JSON.parse(readFileSync(new URL(`../fixtures/expected/${n}.json`, import.meta.url), 'utf8'));
const withReceipt = (r, commit) => ({ ...r, receipt: { commit, scannedAt: '2026-10-11T02:08:00Z' } });

test('file name: readme-clew-2_owner_repo_<short sha>.json', () => {
  const r = withReceipt({ repo: { owner: 'earlgreyhot1701D', name: 'readme-clew' } }, 'cfab5aa');
  assert.equal(exportFileName(r), 'readme-clew-2_earlgreyhot1701D_readme-clew_cfab5aa.json');
  const long = withReceipt({ repo: { owner: 'lukeed', name: 'polka' } }, 'cfab5aa5a6ec6d99c32eab0866eb119b2c958699');
  assert.equal(exportFileName(long), 'readme-clew-2_lukeed_polka_cfab5aa.json'); // a full sha is cut to 7
});
test('file name: a missing receipt or a bad sha says nocommit, and odd characters never reach the file system', () => {
  assert.equal(exportFileName({ repo: { owner: 'o', name: 'r' }, receipt: null }), 'readme-clew-2_o_r_nocommit.json');
  assert.equal(exportFileName(withReceipt({ repo: { owner: 'o', name: 'r' } }, 'not-a-sha')), 'readme-clew-2_o_r_nocommit.json');
  assert.equal(exportFileName(withReceipt({ repo: { owner: 'o', name: 'r' } }, 'ABCDEF1')), 'readme-clew-2_o_r_abcdef1.json');
  const name = exportFileName(withReceipt({ repo: { owner: '../evil', name: 'a b/c\\d:e' } }, 'cfab5aa'));
  assert.match(name, /^readme-clew-2_[A-Za-z0-9._-]+_[A-Za-z0-9._-]+_cfab5aa\.json$/);
  assert.ok(!/[\\/:\s]/.test(name), name);
  assert.equal(exportFileName(null), 'readme-clew-2_unknown_unknown_nocommit.json');
  assert.equal(exportFileName({}), 'readme-clew-2_unknown_unknown_nocommit.json');
});
test('JSON round trip: parsing the export gives back exactly the report, for every fixture', () => {
  for (const f of readdirSync(new URL('../fixtures/expected/', import.meta.url))) {
    const report = fixture(f.replace(/\.json$/, ''));
    assert.deepEqual(JSON.parse(reportToJson(report)), report, f);
  }
  const live = withReceipt(fixture('npm-start-drift'), 'cfab5aa'); // with a receipt, as a live scan has
  assert.deepEqual(JSON.parse(reportToJson(live)), live);
  assert.match(reportToJson(live), /\n {2}"repo":/); // readable, 2-space indent
});

// A fake page: createElement returns a link that records what happened to it.
function fakePage() {
  const events = [];
  const doc = {
    body: { append: (a) => events.push(['append', a]) },
    createElement: (tag) => {
      const a = { tag, href: '', download: '', clicked: 0, removed: 0, click() { this.clicked += 1; events.push(['click', this.href]); }, remove() { this.removed += 1; events.push(['remove']); } };
      return a;
    },
  };
  const urls = { made: [], revoked: [], blobs: [] };
  const urlApi = {
    createObjectURL: (blob) => { urls.blobs.push(blob); const u = `blob:test/${urls.made.length}`; urls.made.push(u); events.push(['create', u]); return u; },
    revokeObjectURL: (u) => { urls.revoked.push(u); events.push(['revoke', u]); },
  };
  return { doc, urlApi, urls, events };
}

test('download: a Blob of the exact report, the right file name, one click, and the object URL is revoked afterwards', async () => {
  const report = withReceipt(fixture('pnpm-monorepo'), 'cfab5aa');
  const { doc, urlApi, urls, events } = fakePage();
  const queued = [];
  const name = downloadReport(report, { doc, urlApi, schedule: (fn) => queued.push(fn) });
  assert.equal(name, 'readme-clew-2_fixture_pnpm-monorepo_cfab5aa.json');
  assert.equal(urls.blobs.length, 1);
  assert.equal(urls.blobs[0].type, 'application/json');
  assert.deepEqual(JSON.parse(await urls.blobs[0].text()), report); // the file holds the report, equal to the one in memory
  const link = events.find((e) => e[0] === 'append')[1];
  assert.equal(link.href, urls.made[0]);
  assert.equal(link.download, name);
  assert.equal(link.clicked, 1);
  assert.equal(link.removed, 1);
  assert.deepEqual(urls.revoked, []); // not yet: the download is still starting
  queued.forEach((fn) => fn());
  assert.deepEqual(urls.revoked, [urls.made[0]]); // revoked once, the same URL
  assert.deepEqual(events.map((e) => e[0]), ['create', 'append', 'click', 'remove', 'revoke']);
});
test('download: makes no network request', () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls += 1; throw new Error('no network allowed'); };
  try {
    const { doc, urlApi } = fakePage();
    downloadReport(fixture('clean-minimal'), { doc, urlApi, schedule: (fn) => fn() });
  } finally { globalThis.fetch = real; }
  assert.equal(calls, 0);
  const src = readFileSync(new URL('../web/download.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket/);
});
test('the DOWNLOAD JSON button is real and enabled in the report footer, and saves the report it was drawn with', () => {
  const render = readFileSync(new URL('../web/render.js', import.meta.url), 'utf8');
  assert.match(render, /el\('button', 'btn', 'DOWNLOAD JSON', \{ type: 'button' \}\)/);
  assert.doesNotMatch(render, /DOWNLOAD JSON[^)]*disabled/);
  assert.match(render, /save\.addEventListener\('click', \(\) => downloadReport\(report\)\)/);
});
