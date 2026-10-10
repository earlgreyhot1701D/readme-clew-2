// Haiku writes the summary and one note per bucket (PRD 4.3). Input is structured findings ONLY: counts, claim types,
// buckets, who decided, and names that pass a strict single-token regex. No README text, no quotes, no evidence text (N7).
// Fail-open: any error, refusal, timeout, or bad output returns notes: null and the report is still complete.
import { HAIKU_MODEL } from './usage.js';

const URL_ = 'https://api.anthropic.com/v1/messages';
export const TIMEOUT_MS = 9000;
const NAME = /^[@A-Za-z0-9._/:-]{1,50}$/;
const BUCKETS = ['verified', 'unverifiable', 'missing', 'contradicted'];
const MAX_NOTE = 240;

const SYSTEM = 'You write short plain-language notes about a README check. You are given counts and finding types as JSON. '
  + 'Use only that data. Never invent facts, names, or quotes. Reply with one JSON object and nothing else: '
  + '{"summary": string, "verified": string, "unverifiable": string, "missing": string, "contradicted": string}. '
  + `Each string is one or two plain sentences, at most ${MAX_NOTE} characters, no markdown, no links. `
  + 'If a bucket has zero findings, say so in a few words.';

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

const clean = (s) => String(s).replace(/https?:\/\/\S+/gi, '').replace(/[`<>*_#[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);

// Strict parse: exactly the five string fields. Anything else is rejected.
export function parseNotes(text) {
  let obj;
  try { obj = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  for (const k of ['summary', ...BUCKETS]) if (typeof obj[k] !== 'string' || !clean(obj[k])) return null;
  return { summary: clean(obj.summary), buckets: Object.fromEntries(BUCKETS.map((b) => [b, clean(obj[b])])) };
}

// -> { notes | null, usage: { status: ok|timeout|error|skipped, calls, inputTokens, outputTokens } }. Never throws.
export async function summarize(report, opts = {}) {
  const { fetchImpl = globalThis.fetch, apiKey = process.env.ANTHROPIC_API_KEY, workspaceId = process.env.ANTHROPIC_WORKSPACE_ID, timeoutMs = TIMEOUT_MS } = opts;
  const none = (status, extra = {}) => ({ notes: null, usage: { status, calls: 0, inputTokens: 0, outputTokens: 0, ...extra } });
  if (!apiKey) return none('skipped');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetchImpl(URL_, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
        ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {}),
      },
      // Haiku 5.5: no temperature/top_p/top_k, no prefill. Low effort keeps thinking short (thinking counts toward max_tokens).
      body: JSON.stringify({
        model: HAIKU_MODEL, max_tokens: 1500, output_config: { effort: 'low' }, system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(buildInput(report)) }],
      }),
      signal: abort.signal,
    });
    const body = await res.json().catch(() => null);
    const usage = { calls: 1, inputTokens: body?.usage?.input_tokens ?? 0, outputTokens: body?.usage?.output_tokens ?? 0 };
    if (!res.ok || body?.stop_reason === 'refusal') return { notes: null, usage: { status: 'error', ...usage } };
    const text = (body?.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join('');
    const notes = parseNotes(text);
    return { notes, usage: { status: notes ? 'ok' : 'error', ...usage } };
  } catch (e) {
    return none(e?.name === 'AbortError' ? 'timeout' : 'error');
  } finally {
    clearTimeout(timer);
  }
}
