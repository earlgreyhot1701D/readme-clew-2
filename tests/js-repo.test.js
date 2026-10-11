// Not-a-JS/TS-repo early return (Block 5). A repo with no package.json is refused before any Jev call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isJsProject, NotJsRepoError, NOT_JS_MESSAGE } from '../lib/js-repo.js';
import { scanRepo } from '../lib/scan-repo.js';
import { makeHandler } from '../api/scan.js';
import { loadFixture } from './helpers.js';

const pyRepo = { pkg: null, workspaces: [], files: ['README.md', 'main.py', 'requirements.txt'], sources: {} };
const repo = { owner: 'o', name: 'r' };
const fetchWith = (snapshot, readme = '# Hi\n\nRun `npm start`.\n') => async () => ({ readme, readmePath: 'README.md', truncated: false, commit: 'a'.repeat(40), snapshot });

// Counts every call, so a test can prove Jev and Haiku were never reached.
function spies() {
  const calls = { ask: 0, summarize: 0 };
  return {
    calls,
    ask: async () => { calls.ask += 1; return { answers: {}, calls: [] }; },
    summarize: async () => { calls.summarize += 1; return { notes: null, usage: { status: 'skipped' } }; },
  };
}

test('isJsProject: a root package.json, a workspace-only repo, and an unparseable package.json all count', () => {
  assert.equal(isJsProject({ pkg: { name: 'x' }, workspaces: [], files: [] }), true);
  assert.equal(isJsProject({ pkg: null, workspaces: [{ path: 'apps/web', pkg: { name: 'web' } }], files: [] }), true);
  assert.equal(isJsProject({ pkg: null, workspaces: [], files: ['README.md', 'package.json'] }), true); // exists, did not parse
});
test('isJsProject: no package.json anywhere is not a JS project; junk input is safe', () => {
  assert.equal(isJsProject(pyRepo), false);
  assert.equal(isJsProject({ pkg: null, workspaces: [], files: ['docs/package.json'] }), false); // a nested file alone is not a workspace
  for (const bad of [null, undefined, {}, { files: 'x' }]) assert.equal(isJsProject(bad), false, String(bad));
});
test('scanRepo: a repo with no package.json throws NotJsRepoError and Jev and Haiku are never called', async () => {
  const s = spies();
  await assert.rejects(scanRepo(repo, { fetchRepo: fetchWith(pyRepo), ask: s.ask, summarize: s.summarize }), (e) => {
    assert.ok(e instanceof NotJsRepoError);
    assert.equal(e.code, 'not_js_repo');
    assert.equal(e.status, 422);
    assert.equal(e.message, NOT_JS_MESSAGE);
    return true;
  });
  assert.deepEqual(s.calls, { ask: 0, summarize: 0 });
});
test('scanRepo: a JS repo still reaches Jev (the early return is not too eager)', async () => {
  const f = loadFixture('npm-start-drift');
  let asked = 0;
  const ask = async (reqs) => {
    asked += 1;
    const answers = {};
    for (const r of reqs) for (const id of Object.keys(r.questions)) answers[id] = { type: 'choice', ...f.jev.labels['3'], probabilities: {} };
    return { answers, calls: [] };
  };
  const { report } = await scanRepo(repo, { fetchRepo: fetchWith(f.snapshot, f.readme), ask, summarize: async () => ({ notes: null, usage: { status: 'skipped' } }) });
  assert.ok(asked >= 1);
  assert.equal(report.counts.contradicted, 1);
});
test('handler: the error becomes HTTP 422, code not_js_repo, with the exact message, and no stack or internals', async () => {
  const s = spies();
  const logs = [];
  const h = makeHandler({ scan: (r) => scanRepo(r, { fetchRepo: fetchWith(pyRepo), ask: s.ask, summarize: s.summarize }), log: (l) => logs.push(l), newId: () => 'id1' });
  const res = await h(new Request('https://site.example/api/scan', { method: 'POST', body: JSON.stringify({ repo: 'https://github.com/o/r' }) }));
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: { code: 'not_js_repo', message: 'NOT A JS/TS REPO // THIS TOOL CHECKS package.json PROJECTS' } });
  assert.equal(s.calls.ask, 0);
  const line = JSON.parse(logs[0]);
  assert.equal(line.status, 422);
  assert.equal(line.errorCode, 'not_js_repo');
  assert.ok(!/main\.py|requirements/.test(logs[0]), 'the log holds no repo contents');
});
