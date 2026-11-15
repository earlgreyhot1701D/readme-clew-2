// GitHub sends two different 403s. The hourly quota ("primary") has
// x-ratelimit-remaining: 0; a secondary limit has a message and, usually, a
// retry-after. Treating the second as a permanent forbidden shows the user a
// 502 and hides how long to wait. Sources:
// docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRepo } from '../lib/github.js';

const reply = (status, headers = {}, body = { message: 'x' }) => async () =>
  new Response(JSON.stringify(body), { status, headers });

async function classify(fetchImpl) {
  try {
    await fetchRepo({ owner: 'o', name: 'r' }, { fetchImpl, token: undefined });
    return { code: 'ok', retryAfter: null };
  } catch (e) {
    return { code: e.code, status: e.status, retryAfter: e.retryAfter ?? null };
  }
}

test('primary limit: 403 with remaining 0 waits until x-ratelimit-reset', async () => {
  const reset = Math.floor(Date.now() / 1000) + 120;
  const r = await classify(reply(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }));
  assert.equal(r.code, 'rate_limited');
  assert.ok(r.retryAfter >= 100 && r.retryAfter <= 121, `retryAfter=${r.retryAfter}`);
});

test('secondary limit with retry-after: 403 with remaining > 0 is rate limited', async () => {
  const r = await classify(reply(403, { 'x-ratelimit-remaining': '50', 'retry-after': '30' }));
  assert.equal(r.code, 'rate_limited');
  assert.equal(r.retryAfter, 30);
});

test('secondary limit without retry-after: the message decides, wait one minute', async () => {
  const r = await classify(reply(
    403,
    { 'x-ratelimit-remaining': '50' },
    { message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' },
  ));
  assert.equal(r.code, 'rate_limited');
  assert.equal(r.retryAfter, 60);
});

test('a permanent 403 stays forbidden and carries no retry-after', async () => {
  const r = await classify(reply(
    403,
    { 'x-ratelimit-remaining': '50' },
    { message: 'Resource not accessible by integration' },
  ));
  assert.equal(r.code, 'forbidden');
  assert.equal(r.retryAfter, null);
});

test('429 with retry-after keeps the number', async () => {
  const r = await classify(reply(429, { 'retry-after': '17' }));
  assert.equal(r.code, 'rate_limited');
  assert.equal(r.retryAfter, 17);
});

test('a junk retry-after is ignored in favour of the one-minute rule', async () => {
  const r = await classify(reply(
    403,
    { 'x-ratelimit-remaining': '50', 'retry-after': 'soon' },
    { message: 'secondary rate limit exceeded' },
  ));
  assert.equal(r.retryAfter, 60);
});
