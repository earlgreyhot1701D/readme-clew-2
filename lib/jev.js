// Glasser -> Jev (PRD 3, 11). POST https://api.glasser.ai/v1/runs, provider "typesafe", endpoint "/v1/systemone".
// Max 100 questions per call (Glasser limit, spike S3). Deadline is 45 s, our timeout is 40 s.
// The key is read from process.env only. It is never put in an error, a log line, or a return value.
import { randomUUID } from 'node:crypto';
import { planRequests } from './jev-budget.js';

export const RUNS_URL = 'https://api.glasser.ai/v1/runs';
export const MODEL = 'jev-1.13.0';
export const MAX_QUESTIONS = 100;
export const TIMEOUT_MS = 40_000;
const RETRYABLE = new Set([429, 503, 529]);
const STATUS_CODES = { 400: 'bad_request', 401: 'unauthorized', 402: 'insufficient_balance', 422: 'bad_request', 429: 'rate_limited' };

export class JevError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'JevError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const micros = (usd) => Math.round(Number(usd) * 1e6);
export const formatUsd = (m) => (m / 1e6).toFixed(6);

// A choice answer must be one of the options we sent. The schema is what keeps Jev inside the label list.
function checkAnswers(answers, questions) {
  for (const [id, q] of Object.entries(questions)) {
    const a = answers?.[id];
    if (!a || a.type !== 'choice' || typeof a.confidence !== 'number' || !Object.hasOwn(q.criteria, a.choice)) {
      throw new JevError('bad_response', 'Glasser returned an answer that does not match the question');
    }
  }
}

// One Glasser call (at most 100 questions). Returns { answers, call } where call holds counts only.
export async function callJev({ state, questions }, opts = {}) {
  const { fetchImpl = globalThis.fetch, apiKey = process.env.GLASSER_API_KEY, timeoutMs = TIMEOUT_MS, retries = 1 } = opts;
  if (!apiKey) throw new JevError('no_key', 'GLASSER_API_KEY is not set');
  const count = Object.keys(questions).length;
  if (count < 1 || count > MAX_QUESTIONS) throw new JevError('bad_request', `A call needs 1 to ${MAX_QUESTIONS} questions, got ${count}`);

  const idempotencyKey = randomUUID(); // reused on a retry, so a retry is a read and is never charged twice
  const body = JSON.stringify({ provider: 'typesafe', endpoint: '/v1/systemone', input: { model: MODEL, state, questions } });
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, 'idempotency-key': idempotencyKey };

  for (let attempt = 1; ; attempt += 1) {
    const t0 = Date.now();
    // A real (ref'd) timer, not AbortSignal.timeout: that one is unref'd and lets the process exit with the request pending.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(new DOMException('timed out', 'TimeoutError')), timeoutMs);
    let res;
    try {
      res = await fetchImpl(RUNS_URL, { method: 'POST', headers, body, signal: abort.signal });
    } catch (e) {
      clearTimeout(timer);
      const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      throw new JevError(timedOut ? 'timeout' : 'network', timedOut ? `Glasser did not answer within ${timeoutMs} ms` : 'Could not reach Glasser');
    }
    if (RETRYABLE.has(res.status) && attempt <= retries) {
      clearTimeout(timer);
      await sleep(400 * attempt);
      continue;
    }
    let run = null;
    try { run = await res.json(); } catch { run = null; }
    clearTimeout(timer);
    if (!res.ok) {
      const code = STATUS_CODES[res.status] ?? 'unavailable';
      throw new JevError(code, `Glasser returned HTTP ${res.status}${run?.error?.code ? ` (${run.error.code})` : ''}`, { status: res.status });
    }
    if (run?.status !== 'COMPLETED') throw new JevError('run_failed', `Glasser run ended as ${run?.status ?? 'unknown'}`, { chargeUsd: run?.charge_usd ?? null });
    if (run.provider_response?.http_status !== 200) throw new JevError('provider_error', 'The model provider returned an error', { chargeUsd: run.charge_usd ?? null });
    const out = run.output;
    if (out?.model !== MODEL) throw new JevError('bad_response', `Expected model ${MODEL}`);
    checkAnswers(out.answers, questions);
    return {
      answers: out.answers,
      call: {
        questions: count, attempts: attempt, ms: Date.now() - t0,
        inputTokens: out.usage?.input_tokens ?? 0, outputTokens: out.usage?.output_tokens ?? 0,
        chargeUsd: run.charge_usd ?? '0.00',
      },
    };
  }
}

// requests: [{ state, questions }]. Splits any request over 100 questions, runs calls with limited concurrency.
// Returns { answers, calls }. On failure throws a JevError with `calls` (the ones that finished) attached.
export async function askAll(requests, opts = {}) {
  // Splits by the 100-question cap and enforces Jev's token limits (trims README state first). See lib/jev-budget.js.
  const jobs = planRequests(requests, MAX_QUESTIONS, (code, message) => { throw new JevError(code, message); });
  const answers = {};
  const calls = [];
  let next = 0;
  let failure = null;
  const worker = async () => {
    while (!failure && next < jobs.length) {
      const job = jobs[next]; next += 1;
      try {
        const r = await callJev(job, opts);
        Object.assign(answers, r.answers);
        calls.push({ ...r.call, trimmedState: job.trimmed === true });
      } catch (e) {
        failure = failure ?? e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, jobs.length) }, worker));
  if (failure) {
    failure.calls = calls;
    throw failure;
  }
  return { answers, calls };
}

// Counts only. Cost is Glasser's own charge_usd, summed in micro-dollars to avoid float drift.
export function totalUsage(calls) {
  const sum = (k) => calls.reduce((a, c) => a + c[k], 0);
  return {
    calls: calls.length,
    questions: sum('questions'),
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    chargeUsd: formatUsd(calls.reduce((a, c) => a + micros(c.chargeUsd), 0)),
  };
}
