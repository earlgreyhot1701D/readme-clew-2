import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRepo, pickSources, cutReadme, GithubError, README_MAX_BYTES, MAX_SOURCES } from '../lib/github.js';

const SHA = 'a'.repeat(40);
const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: h });
const text = (t, status = 200) => new Response(t, { status });

// A fake GitHub. files: { path: text }. Records every URL requested.
function fakeGithub({ files = {}, meta = {}, readmePath = 'README.md', noReadme = false, failRaw = [] } = {}) {
  const urls = [];
  const f = async (url) => {
    urls.push(url);
    const u = new URL(url);
    if (u.hostname === 'api.github.com') {
      const p = u.pathname.replace('/repos/o/r', '');
      if (p === '') return json({ private: false, ...meta });
      if (p === '/commits/HEAD') return json({ sha: SHA });
      if (p === '/readme') return noReadme ? json({}, 404) : json({ path: readmePath });
      if (p.startsWith('/git/trees/')) return json({ tree: Object.keys(files).map((path) => ({ type: 'blob', path })) });
    }
    if (u.hostname === 'raw.githubusercontent.com') {
      const path = decodeURIComponent(u.pathname.split(`/${SHA}/`)[1]);
      if (failRaw.includes(path) || !(path in files)) return text('nope', 404);
      return text(files[path]);
    }
    return json({}, 500);
  };
  f.urls = urls;
  return f;
}
const base = { 'README.md': '# Hi\n', 'package.json': '{"name":"x","scripts":{"start":"x"}}' };

test('fetches README, commit, package.json, and sources at the pinned commit', async () => {
  const fx = fakeGithub({ files: { ...base, 'src/index.js': 'import a from "a"', '.env.example': 'K=1', 'packages/web/package.json': '{"name":"web"}' } });
  const r = await fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: fx, token: 't' });
  assert.equal(r.commit, SHA);
  assert.equal(r.readme, '# Hi\n');
  assert.equal(r.readmePath, 'README.md');
  assert.equal(r.truncated, false);
  assert.equal(r.snapshot.pkg.name, 'x');
  assert.deepEqual(r.snapshot.workspaces, [{ path: 'packages/web', pkg: { name: 'web' } }]);
  assert.ok(r.snapshot.files.includes('src/index.js'));
  assert.deepEqual(Object.keys(r.snapshot.sources).sort(), ['.env.example', 'src/index.js']);
  assert.ok(fx.urls.filter((u) => u.includes('api.github.com')).length === 4);
  assert.ok(fx.urls.filter((u) => u.includes('raw.githubusercontent.com')).every((u) => u.includes(SHA)));
});
test('a private repo is refused as not found (N1)', async () => {
  const fx = fakeGithub({ files: base, meta: { private: true } });
  await assert.rejects(fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: fx }), { code: 'not_found' });
});
test('404 is not_found; a repo without a README is no_readme', async () => {
  const gone = async () => json({}, 404);
  await assert.rejects(fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: gone }), { code: 'not_found' });
  await assert.rejects(fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: fakeGithub({ files: base, noReadme: true }) }), { code: 'no_readme' });
});
test('rate limit, server error, network failure, and timeout become typed errors', async () => {
  await assert.rejects(fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: async () => json({}, 429) }), { code: 'rate_limited' });
  await assert.rejects(fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: async () => new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }) }), { code: 'rate_limited' });
  await assert.rejects(fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: async () => json({}, 503) }), { code: 'unavailable' });
  await assert.rejects(fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: async () => { throw new TypeError('x'); } }), (e) => e instanceof GithubError && e.code === 'unavailable');
});
test('a missing optional file (package.json) does not fail the scan', async () => {
  const fx = fakeGithub({ files: base, failRaw: ['package.json'] });
  const r = await fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: fx });
  assert.equal(r.snapshot.pkg, null);
});
test('the token is sent to the API only, never to raw reads', async () => {
  const seen = [];
  const fx = fakeGithub({ files: base });
  const spy = async (url, init) => { seen.push([url, init.headers.authorization]); return fx(url, init); };
  await fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl: spy, token: 'SECRET' });
  assert.ok(seen.filter(([u]) => u.includes('api.github.com')).every(([, a]) => a === 'Bearer SECRET'));
  assert.ok(seen.filter(([u]) => u.includes('raw.githubusercontent.com')).every(([, a]) => a === undefined));
});
test('source picking: at most 20, skips tests, build output, and typings, shallow first', () => {
  const paths = ['src/a.js', 'src/a.test.js', 'node_modules/x/i.js', 'dist/o.js', 'types/t.d.ts', 'index.ts', 'tests/x.js', 'README.md',
    ...Array.from({ length: 30 }, (_, i) => `lib/deep/f${i}.js`)];
  const picked = pickSources(paths);
  assert.equal(picked.length, MAX_SOURCES);
  assert.deepEqual(picked.slice(0, 2), ['index.ts', 'src/a.js']);
  assert.ok(!picked.some((p) => /test|node_modules|dist|\.d\.ts/.test(p)));
});
test('README over 50 KB is cut at a line boundary and flagged', () => {
  const big = 'line of text\n'.repeat(10_000);
  const { text: t, truncated } = cutReadme(big);
  assert.equal(truncated, true);
  assert.ok(Buffer.byteLength(t) <= README_MAX_BYTES);
  assert.ok(!t.endsWith('lin'));
  assert.deepEqual(cutReadme('small'), { text: 'small', truncated: false });
});
