// LIVE Jev eval on the golden set. Manual. Costs money. Never runs in CI (tests use mocks).
//   node evaluation/run-eval.js <A|B|ALL> <readme|line> <label> [--e2e]
// Writes evaluation/results-<label>.json (ids, choices, confidences, counts; no README text) and appends one
// counts-only line per Glasser call to evaluation/usage-log.jsonl (PRD 3e). Aborts before any call if a line's
// hash does not match the golden set, and stops if the running spend would pass the guard.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { segment } from '../lib/segment.js';
import { labelRequests, toJevAnswers } from '../lib/questions.js';
import { callJev, totalUsage, formatUsd, MODEL } from '../lib/jev.js';
import { scan } from '../lib/pipeline.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const [split, mode, label, ...flags] = process.argv.slice(2);
if (!['A', 'B', 'ALL'].includes(split) || !['readme', 'line'].includes(mode) || !label) {
  console.error('usage: node evaluation/run-eval.js <A|B|ALL> <readme|line> <label> [--e2e]');
  process.exit(2);
}
const LOG = 'evaluation/usage-log.jsonl';
const SPEND_LIMIT_MICROS = 80_000; // $0.08 guard for Block 2 (budget is $0.10)
const PER_CALL_CAP_MICROS = 2_957; // Glasser's published cap per run, $0.002957

const spentMicros = () => (existsSync(LOG)
  ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).reduce((a, l) => a + Math.round(Number(JSON.parse(l).chargeUsd) * 1e6), 0)
  : 0);

async function fetchText(src) {
  if (src.local) return readFileSync(src.local, 'utf8');
  const res = await fetch(`https://raw.githubusercontent.com/${src.repo}/${src.sha}/${src.path}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`README fetch failed: HTTP ${res.status}`);
  return res.text();
}

// Every golden line must still hash to what was approved, or nothing is sent.
const golden = JSON.parse(readFileSync('fixtures/golden/golden-set.json', 'utf8'));
const items = golden.items.filter((i) => split === 'ALL' || i.split === split);
const lines = {};
for (const [k, src] of Object.entries(golden.sources)) lines[k] = segment(await fetchText(src));
for (const it of items) {
  const text = lines[it.src][it.line - 1]?.text ?? '';
  if (createHash('sha256').update(text).digest('hex').slice(0, 10) !== it.h) throw new Error(`Hash mismatch for ${it.id}: the line changed. Nothing was sent.`);
}

const callLog = [];
async function ask(requests) { // one Glasser call at a time per request, with the spend guard, logged per call
  const answers = {};
  let next = 0;
  const worker = async () => {
    while (next < requests.length) {
      const job = requests[next]; next += 1;
      if (spentMicros() + PER_CALL_CAP_MICROS > SPEND_LIMIT_MICROS) throw new Error('Spend guard: stopping before the next call.');
      const r = await callJev(job);
      Object.assign(answers, r.answers);
      callLog.push(r.call);
      appendFileSync(LOG, `${JSON.stringify({ time: new Date().toISOString(), run: label, purpose: 'golden-eval', model: MODEL, calls: 1, questions: r.call.questions, inputTokens: r.call.inputTokens, outputTokens: r.call.outputTokens, chargeUsd: r.call.chargeUsd, ms: r.call.ms })}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(mode === 'line' ? 5 : 3, requests.length) }, worker));
  return { answers, calls: [] };
}

const t0 = Date.now();
const results = [];
for (const [k, srcLines] of Object.entries(lines)) {
  const mine = items.filter((i) => i.src === k);
  if (!mine.length) continue;
  const ids = new Set(mine.map((i) => `l${i.line}`));
  // Real label questions for the whole source README, then keep only the golden lines (state stays the full README).
  const reqs = labelRequests(srcLines, mode)
    .map((r) => ({ ...r, questions: Object.fromEntries(Object.entries(r.questions).filter(([id]) => ids.has(id))) }))
    .filter((r) => Object.keys(r.questions).length);
  const split100 = reqs.flatMap((r) => {
    const q = Object.entries(r.questions);
    return Array.from({ length: Math.ceil(q.length / 100) }, (_, i) => ({ state: r.state, questions: Object.fromEntries(q.slice(i * 100, i * 100 + 100)) }));
  });
  const { answers } = await ask(split100);
  const { labels } = toJevAnswers(answers);
  for (const it of mine) results.push({ id: it.id, choice: labels[it.line]?.choice ?? null, confidence: labels[it.line]?.confidence ?? null });
}
const wallMs = Date.now() - t0;

let e2e = null;
if (flags.includes('--e2e')) {
  const e = golden.endToEnd;
  const out = await scan({
    readme: readFileSync(e.readme, 'utf8'), repo: { owner: 'golden', name: 'hard-cases', readmePath: 'README.md' },
    snapshot: JSON.parse(readFileSync(e.snapshot, 'utf8')), mode, ask: async (r) => ask(r),
  });
  e2e = {
    shouldContradict: e.shouldContradict, wallMs: out.report.meta.ms,
    findings: out.report.findings.map((f) => ({ line: f.line, bucket: f.bucket, claimType: f.claimType, confidence: f.confidence, lowConfidence: f.lowConfidence })),
  };
}

const usage = totalUsage(callLog);
writeFileSync(`evaluation/results-${label}.json`, `${JSON.stringify({ label, split, mode, model: MODEL, wallMs, usage, calls: callLog.map((c) => ({ questions: c.questions, ms: c.ms, attempts: c.attempts })), results, e2e }, null, 1)}\n`);
console.log(`${label}: split ${split}, mode ${mode}, ${results.length} lines, ${usage.calls} calls, wall ${wallMs} ms, charge $${usage.chargeUsd}, run spend so far $${formatUsd(spentMicros())}`);
