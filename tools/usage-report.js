// Builds evaluation/usage_report.md from Glasser's own run history and balance history. Counts and money only.
// Run: node --env-file=.env tools/usage-report.js   (needs GLASSER_API_KEY; it only reads, it starts no runs)
// The report never holds run ids, keys, inputs, or outputs. Anthropic spend is not in Glasser's data: it comes from our own log if there is one.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.glasser.ai/v1';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const micros = (v) => Math.round(Number(v ?? 0) * 1e6);
const usd = (m) => `$${(Math.abs(m) / 1e6).toFixed(4)}`;
const day = (iso) => String(iso ?? '').slice(0, 10) || 'unknown';

// Follows next_cursor until it runs out (or the page cap, so a bad cursor cannot loop forever).
export async function fetchAll(path, key, fetchImpl = globalThis.fetch, maxPages = 200) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const url = `${API}${path}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Glasser ${path} returned HTTP ${res.status}`);
    const body = await res.json();
    items.push(...(body.data ?? body.items ?? body.runs ?? body.entries ?? (Array.isArray(body) ? body : [])));
    cursor = body.next_cursor ?? null;
    if (!cursor) break;
  }
  return items;
}

const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

export function summarize(runs, history) {
  const days = new Map();
  let spend = 0, completed = 0, failed = 0;
  for (const r of runs) {
    const d = days.get(day(r.created_at)) ?? { runs: 0, ok: 0, bad: 0, m: 0 };
    const ok = String(r.status).toUpperCase() === 'COMPLETED';
    d.runs++; d[ok ? 'ok' : 'bad']++; d.m += micros(r.charge_usd);
    days.set(day(r.created_at), d);
    spend += micros(r.charge_usd); if (ok) completed++; else failed++;
  }
  const hist = [...history].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const first = hist[0], last = hist[hist.length - 1];
  const byKind = new Map();
  for (const h of hist) { const k = byKind.get(h.kind) ?? { n: 0, m: 0 }; k.n++; k.m += micros(h.amount_usd); byKind.set(h.kind, k); }
  return {
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)), spend, completed, failed, total: runs.length,
    start: first ? micros(first.balance_after_usd) : null, // the balance right after the first entry (the first grant)
    now: last ? micros(last.balance_after_usd) : null, byKind: [...byKind.entries()],
  };
}

// Anthropic spend: only what our own log holds (evaluation/usage-log.jsonl lines that have an Anthropic cost). Null when none.
export function anthropicSpend(logText) {
  let m = 0, n = 0;
  for (const line of String(logText ?? '').split('\n')) {
    try { const e = JSON.parse(line); if (e.provider === 'Anthropic' && e.costUsdEstimate != null) { m += micros(e.costUsdEstimate); n++; } } catch { /* not a log line */ }
  }
  return n ? { m, n } : null;
}

export function render(s, anth, generated) {
  const money = (m) => (m == null ? 'n/a' : usd(m));
  const perRun = s.completed ? usd(Math.round(s.spend / s.completed)) : 'n/a';
  return [
    '# Usage report', '',
    `Generated ${generated} by \`tools/usage-report.js\`. The data comes from Glasser's own run and balance history, not from our logs. Counts and money only: no run ids, keys, inputs, or outputs.`, '',
    '## Jev runs by day (UTC)', '',
    table(['Day', 'Runs', 'Completed', 'Failed', 'Charged'], s.days.map(([d, v]) => [d, v.runs, v.ok, v.bad, usd(v.m)])), '',
    '## Totals', '',
    table(['Measure', 'Value'], [
      ['Runs', s.total], ['Completed', s.completed], ['Failed', s.failed], ['Total Jev spend', usd(s.spend)],
      ['Cost per completed Jev run', perRun], ['Starting balance (after first grant)', money(s.start)], ['Current balance', money(s.now)],
    ]), '',
    'A scan makes one Jev call per 100 README lines sent, so cost per scan is about the cost per completed run for most READMEs. Failed runs are charged $0.', '',
    '## Balance history by kind', '',
    s.byKind.length ? table(['Kind', 'Entries', 'Net amount'], s.byKind.map(([k, v]) => [k, v.n, usd(v.m)])) : 'No balance history returned.', '',
    '## Anthropic (Haiku) spend', '',
    anth ? `${anth.n} logged calls, estimated ${usd(anth.m)} (our estimate from token counts, not a bill).` : 'Not recorded. Glasser does not see Anthropic calls and our usage log holds only Jev runs, so this report has no Anthropic figure.', '',
  ].join('\n');
}

async function main() {
  const key = process.env.GLASSER_API_KEY;
  if (!key) throw new Error('GLASSER_API_KEY is not set (run with: node --env-file=.env tools/usage-report.js)');
  const [runs, history] = [await fetchAll('/runs', key), await fetchAll('/balance/history', key)];
  const logPath = `${ROOT}evaluation/usage-log.jsonl`;
  const text = render(summarize(runs, history), anthropicSpend(existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''), new Date().toISOString().slice(0, 10));
  writeFileSync(`${ROOT}evaluation/usage_report.md`, text);
  console.log(`wrote evaluation/usage_report.md (${runs.length} runs, ${history.length} balance entries)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
