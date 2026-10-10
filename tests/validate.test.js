import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepoUrl, validateBody, MAX_BODY_BYTES } from '../lib/validate.js';
import { makeLimiter } from '../lib/ratelimit.js';

const bad = (fn, code) => assert.throws(fn, (e) => e.code === code);

test('accepts github.com/owner/repo in common shapes', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/chalk/chalk'), { owner: 'chalk', name: 'chalk' });
  assert.deepEqual(parseRepoUrl('https://github.com/chalk/chalk/'), { owner: 'chalk', name: 'chalk' });
  assert.deepEqual(parseRepoUrl('https://github.com/a/b.js.git'), { owner: 'a', name: 'b.js' });
  assert.deepEqual(parseRepoUrl('https://github.com/a/b/tree/main/docs'), { owner: 'a', name: 'b' });
});
test('rejects non-GitHub, non-https, credentials, ports, and lookalike hosts', () => {
  for (const u of ['http://github.com/a/b', 'https://gitlab.com/a/b', 'https://github.com.evil.com/a/b', 'https://user:pw@github.com/a/b',
    'https://github.com:444/a/b', 'https://evilgithub.com/a/b', 'ftp://github.com/a/b']) bad(() => parseRepoUrl(u), 'bad_url');
});
test('rejects missing or odd owner and repo', () => {
  for (const u of ['https://github.com/', 'https://github.com/a', 'https://github.com/-a/b', 'https://github.com/a/..', 'https://github.com/a/b c', 'not a url', '']) bad(() => parseRepoUrl(u), 'bad_url');
  bad(() => parseRepoUrl(42), 'bad_url');
  bad(() => parseRepoUrl(`https://github.com/a/${'x'.repeat(400)}`), 'bad_url');
});
test('body: missing, oversize (413), not JSON, wrong shape', () => {
  bad(() => validateBody(''), 'missing_body');
  bad(() => validateBody(undefined), 'missing_body');
  assert.throws(() => validateBody(JSON.stringify({ repo: 'x'.repeat(MAX_BODY_BYTES) })), (e) => e.code === 'body_too_large' && e.status === 413);
  bad(() => validateBody('{nope'), 'bad_json');
  bad(() => validateBody('[]'), 'missing_repo');
  bad(() => validateBody('{"repo": 5}'), 'missing_repo');
  bad(() => validateBody('{}'), 'missing_repo');
});
test('body: a valid body gives owner and name', () => {
  assert.deepEqual(validateBody('{"repo":"https://github.com/a/b"}'), { owner: 'a', name: 'b' });
});

test('limiter: allows max, then blocks with a retry time, then recovers', () => {
  let t = 1000;
  const check = makeLimiter({ max: 2, windowMs: 10_000, now: () => t });
  assert.equal(check('1.1.1.1').ok, true);
  assert.equal(check('1.1.1.1').ok, true);
  const blocked = check('1.1.1.1');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterMs, 10_000);
  assert.equal(check('2.2.2.2').ok, true); // other IPs are separate
  t += 10_001;
  assert.equal(check('1.1.1.1').ok, true);
});
test('limiter: memory stays bounded', () => {
  let t = 0;
  const check = makeLimiter({ max: 1, windowMs: 10, now: () => t, maxKeys: 5 });
  for (let i = 0; i < 50; i += 1) { t += 100; check(`ip${i}`); }
  assert.equal(check('fresh').ok, true);
  assert.ok(check.size() <= 6, `tracking ${check.size()} IPs`);
});
