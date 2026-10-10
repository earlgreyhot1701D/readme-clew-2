// POST /api/scan. Thin wiring only: body limit, validation, rate limit, CORS, error mapping, one counts-only log line.
import { randomBytes } from 'node:crypto';
import { validateBody, MAX_BODY_BYTES, ValidationError } from '../lib/validate.js';
import { makeLimiter } from '../lib/ratelimit.js';
import { scanRepo } from '../lib/scan-repo.js';
import { logLine } from '../lib/usage.js';

const GITHUB_STATUS = { not_found: 404, no_readme: 404, rate_limited: 503, timeout: 504, unavailable: 502, forbidden: 502 };
const JEV_STATUS = { timeout: 504, rate_limited: 503, too_large: 422 };

function mapError(e) {
  if (e instanceof ValidationError || e?.name === 'ValidationError') return { status: e.status, code: e.code, message: e.message };
  if (e?.name === 'GithubError') return { status: GITHUB_STATUS[e.code] ?? 502, code: `github_${e.code}`, message: e.message };
  if (e?.name === 'JevError') return { status: JEV_STATUS[e.code] ?? 502, code: `jev_${e.code}`, message: e.code === 'too_large' ? e.message : 'The line-labeling service could not finish this scan. Try again in a moment.' };
  return { status: 500, code: 'internal', message: 'Something went wrong on our side.' };
}

// PRD 7.3: browsers get CORS only for this site's own origin. The extension uses host_permissions, which needs no CORS header.
function corsHeaders(request) {
  const origin = request.headers.get('origin');
  let own = null;
  try { own = new URL(request.url).origin; } catch { own = null; }
  return origin && own && origin === own ? { 'access-control-allow-origin': origin, vary: 'origin' } : { vary: 'origin' };
}

export function makeHandler(deps = {}) {
  const { scan = scanRepo, limiter = makeLimiter(), now = Date.now, log = console.log, newId = () => randomBytes(6).toString('hex') } = deps;
  return async function handler(request) {
    const id = newId();
    const t0 = now();
    const path = '/api/scan';
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(request) };
    const reply = (status, body, extra = {}, counts) => {
      log(logLine({ id, path, method: request.method, status, ms: now() - t0, errorCode: body?.error?.code, counts }));
      return new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
    };
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
      if (request.method !== 'POST') return reply(405, { error: { code: 'method_not_allowed', message: 'Use POST' } }, { allow: 'POST, OPTIONS' });
      const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
      const rl = limiter(ip);
      if (!rl.ok) return reply(429, { error: { code: 'rate_limited', message: 'Too many scans. Wait a minute and try again.' } }, { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) });
      const declared = Number(request.headers.get('content-length') ?? 0);
      if (declared > MAX_BODY_BYTES) throw new ValidationError('body_too_large', 'Request body is too large', 413);
      const repo = validateBody(await request.text());
      const { report } = await scan(repo);
      return reply(200, report, {}, { ...report.counts, linesTotal: report.meta.linesTotal, linesToJev: report.meta.linesToJev });
    } catch (e) {
      const m = mapError(e);
      return reply(m.status, { error: { code: m.code, message: m.message } });
    }
  };
}

export const POST = makeHandler();
export const OPTIONS = POST;
export const GET = POST; // answers 405 with an Allow header
