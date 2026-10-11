// Haiku writes the summary and one note per bucket (PRD 4.3). Input is structured findings ONLY: counts, claim types,
// buckets, who decided, and names that pass a strict single-token regex. No README text, no quotes, no evidence text (N7).
// Fail-open: any error, refusal, timeout, or bad output returns notes: null and the report is still complete.
// Every failure carries a reason CODE (never text) for the receipt and the log line.
import { HAIKU_MODEL } from './usage.js';

const URL_ = 'https://api.anthropic.com/v1/messages';
export const TIMEOUT_MS = 9000; // one budget for the whole call, retry included
export const RETRY_MIN_REMAINING_MS = 3000; // a retry only starts if at least this much of the budget is left
export const BACKOFF_MS = [200, 600]; // jittered wait before the retry: 200 to 600 ms
const NAME = /^[@A-Za-z0-9._/:-]{1,50}$/;
const BUCKETS = ['verified', 'unverifiable', 'missing', 'contradicted'];
const FIELDS = ['summary', ...BUCKETS];
const MAX_NOTE = 240;

// Reason codes: http_429, http_5xx, http_4xx, network, timeout, parse, banned, max_tokens.
// Only http_429, http_5xx, and network are retried (once). 4xx, timeout, parse, banned, and max_tokens never are.
export const REASONS = ['http_429', 'http_5xx', 'http_4xx', 'network', 'timeout', 'parse', 'banned', 'max_tokens'];
const RETRYABLE = new Set(['http_429', 'http_5xx', 'network']);

// The system prompt. It is written for a developer reading the result, and it never names the two words we ban from
// the page ("mood" and "low-confidence"): the model should not be handed the words at all. A test pins that, and
// BANNED_OUT below drops any field of a reply that uses them anyway.
export const SYSTEM = 'You write short plain-English notes for a developer about a README check. You are given counts and claim types as JSON. '
  + 'Use only that data. Never invent facts, names, or quotes. Reply with one JSON object and nothing else: '
  + '{"summary": string, "verified": string, "unverifiable": string, "missing": string, "contradicted": string}. '
  + 'Summary: one or two plain sentences. Lead with what matters most: claims the code contradicts first, '
  + 'then things the code does that the README never mentions. Name the missing packages when the data lists them and there are only a few. '
  + 'Mention the verified claims briefly and only after the problems. '
  + 'Give the unverifiable count only when there are no contradicted, missing, or verified claims. '
  + 'Talk about the README and the code, not about a feeling, a tone, or how sure anyone was. Do not repeat field names from the JSON. '
  + `Each string is at most ${MAX_NOTE} characters, no markdown, no links. `
  + 'If a bucket has zero findings, say so in a few words.';

// Words that must never reach the page. Only the field that uses one is dropped (the summary or one bucket note).
const BANNED_OUT = /\bmood\b|low[\s-]*confidence/i;

// The only thing Haiku ever sees. Exported so tests can prove what it contains.
export function buildInput(report) {
  return {
    counts: report.counts,
    mood: report.mood,
    lowConfidenceFindings: report.findings.filter((f) => f.lowConfidence).length,
    decidedByRule: report.findings.filter((f) => f.decidedBy === 'rule').length,
    decidedByJev: report.findings.filter((f) => f.decidedBy === 'jev').length,
    findings: report.findings.slice(0, 40).map((f) => ({
      bucket: f.bucket, claimType: f.claimType, verifier: f.verifier, decidedBy: f.decidedBy, lowConfidence: f.lowConfidence,
      ...(typeof f.name === 'string' && NAME.test(f.name) ? { name: f.name } : {}),
    })),
  };
}

// What is actually sent: the same information as buildInput, with the keys renamed so that neither banned word
// appears anywhere in the request. Nothing is added and nothing is dropped.
export function promptInput(report) {
  const i = buildInput(report);
  return {
    counts: i.counts,
    overall: i.mood,
    unsureLabels: i.lowConfidenceFindings,
    decidedByRule: i.decidedByRule,
    decidedByJev: i.decidedByJev,
    findings: i.findings.map(({ lowConfidence, ...rest }) => ({ ...rest, unsure: lowConfidence })),
  };
}

const clean = (s) => String(s).replace(/https?:\/\/\S+/gi, '').replace(/[`<>*_#[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);

// The summary is one or two sentences. The prompt asks for that, and this keeps it true if the model writes a third
// (the lowest-priority one, since the prompt puts verified claims last). A sentence ends at . ! or ? followed by a space,
// so names like next.js or v1.2 are not split.
export function twoSentences(text) {
  return String(text).split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
}

// Strict shape: exactly the five string fields, none empty. Anything else is null ("parse").
// A field that uses a banned word is dropped on its own: it becomes null and the other fields stay.
// -> null | { notes: { summary, buckets } | null, dropped: n }. notes is null only when all five fields were dropped.
export function parseNotesDetailed(text) {
  let obj;
  try { obj = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  for (const k of FIELDS) if (typeof obj[k] !== 'string' || !clean(obj[k])) return null;
  const dropped = new Set(FIELDS.filter((k) => BANNED_OUT.test(obj[k])));
  if (dropped.size === FIELDS.length) return { notes: null, dropped: dropped.size };
  const keep = (k) => (dropped.has(k) ? null : clean(obj[k]));
  return {
    notes: { summary: dropped.has('summary') ? null : twoSentences(clean(obj.summary)), buckets: Object.fromEntries(BUCKETS.map((b) => [b, keep(b)])) },
    dropped: dropped.size,
  };
}

export const parseNotes = (text) => parseNotesDetailed(text)?.notes ?? null;

// An HTTP status or a thrown error -> a reason code, or null when the request itself was fine.
function transportReason(outcome) {
  if (outcome.thrown) return outcome.thrown;
  const s = outcome.status;
  if (s === 429) return 'http_429';
  if (s >= 500) return 'http_5xx';
  if (s < 200 || s >= 300) return 'http_4xx';
  return null;
}

// Turns one finished attempt into { notes, usage }. Reason is a code, never text from the model.
function conclude(outcome, calls, retried) {
  const usage = { status: 'error', calls, inputTokens: outcome.data?.usage?.input_tokens ?? 0, outputTokens: outcome.data?.usage?.output_tokens ?? 0 };
  if (retried) usage.retried = true;
  const fail = (reason, status = 'error') => ({ notes: null, usage: { ...usage, status: reason === 'timeout' ? 'timeout' : status, reason } });
  const bad = transportReason(outcome);
  if (bad) return fail(bad);
  const d = outcome.data;
  if (!d) return fail('parse');
  if (d.stop_reason === 'max_tokens') return fail('max_tokens');
  if (d.stop_reason === 'refusal') return fail('parse');
  const text = (d.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join('');
  const parsed = parseNotesDetailed(text);
  if (!parsed) return fail('parse');
  if (!parsed.notes) return fail('banned');
  return { notes: parsed.notes, usage: { ...usage, status: 'ok', ...(parsed.dropped ? { reason: 'banned', droppedFields: parsed.dropped } : {}) } };
}

// -> { notes | null, usage: { status: ok|timeout|error|skipped, calls, inputTokens, outputTokens, reason?, retried?, droppedFields? } }.
// Never throws. One retry, only for http_429, http_5xx, and network, only if RETRY_MIN_REMAINING_MS of the budget is left
// after a short jittered wait. now, sleep, and random are injectable so tests need no real time.
export async function summarize(report, opts = {}) {
  const {
    fetchImpl = globalThis.fetch, apiKey = process.env.ANTHROPIC_API_KEY, workspaceId = process.env.ANTHROPIC_WORKSPACE_ID, timeoutMs = TIMEOUT_MS,
    now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), random = Math.random,
  } = opts;
  if (!apiKey) return { notes: null, usage: { status: 'skipped', calls: 0, inputTokens: 0, outputTokens: 0 } };
  const headers = {
    'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
    ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
  };
  // Haiku 5.5: no temperature/top_p/top_k, no prefill. Low effort keeps thinking short (thinking counts toward max_tokens).
  const body = JSON.stringify({
    model: HAIKU_MODEL, max_tokens: 1500, output_config: { effort: 'low' }, system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(promptInput(report)) }],
  });
  const start = now();
  let retried = false;
  for (let attempt = 1; ; attempt += 1) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), Math.max(timeoutMs - (now() - start), 1));
    let outcome;
    try {
      const res = await fetchImpl(URL_, { method: 'POST', headers, body, signal: abort.signal });
      outcome = { status: res.status, data: await res.json().catch(() => null) };
    } catch (e) {
      outcome = { thrown: e?.name === 'AbortError' ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
    const reason = transportReason(outcome);
    if (reason && RETRYABLE.has(reason) && attempt === 1) {
      const wait = BACKOFF_MS[0] + random() * (BACKOFF_MS[1] - BACKOFF_MS[0]);
      if (timeoutMs - (now() - start) - wait >= RETRY_MIN_REMAINING_MS) {
        await sleep(wait);
        retried = true;
        continue;
      }
    }
    return conclude(outcome, attempt, retried);
  }
}
