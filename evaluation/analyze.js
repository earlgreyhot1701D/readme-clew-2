// OFFLINE analysis of eval results. No network, no cost. Reads evaluation/results-*.json and the golden set.
//   node evaluation/analyze.js compare <readme-results.json> <line-results.json>   state designs on one split
//   node evaluation/analyze.js sweep   <results.json>                              threshold sweep
//   node evaluation/analyze.js report  <results.json> <threshold>                  one run at one threshold
//   node evaluation/analyze.js drift   <run1.json> <run2.json> <threshold>         per distinct line, two runs
import { readFileSync } from 'node:fs';
import { VERIFIER_BOUND } from '../lib/gate.js';

const golden = JSON.parse(readFileSync('fixtures/golden/golden-set.json', 'utf8'));
const byId = Object.fromEntries(golden.items.map((i) => [i.id, i]));
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const bound = (c) => VERIFIER_BOUND.has(c);
const pct = (n, d) => (d ? `${n}/${d}` : '0/0');
const mean = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : 'n/a');

// Classify one answer against the expected label. "danger" means a line that should not reach a verifier does,
// or reaches the wrong verifier, at or above the threshold (so the gate would let it through).
function classify(r, t) {
  const exp = byId[r.id].expected;
  if (!r.choice) return { exact: false, danger: false, missed: false, nullAnswer: true };
  const exact = r.choice === exp;
  const expBound = bound(exp);
  const gotBound = bound(r.choice);
  const wrongRoute = (!expBound && gotBound) || (expBound && gotBound && r.choice !== exp);
  return {
    exact,
    danger: wrongRoute && r.confidence >= t,
    dangerAny: wrongRoute,
    missed: expBound && (!gotBound || r.confidence < t), // bound line that does not reach its verifier: coverage cost only
    covered: expBound && exact && r.confidence >= t,
  };
}

function metrics(res, t) {
  const rows = res.results.map((r) => ({ r, c: classify(r, t), item: byId[r.id] }));
  const expBound = rows.filter((x) => bound(x.item.expected));
  return {
    n: rows.length,
    errors: rows.filter((x) => !x.c.exact).length,
    harmfulAny: rows.filter((x) => x.c.dangerAny).length,
    danger: rows.filter((x) => x.c.danger).length,
    coverage: pct(expBound.filter((x) => x.c.covered).length, expBound.length),
    meanConfBound: mean(expBound.filter((x) => x.r.confidence != null).map((x) => x.r.confidence)),
    meanConfAll: mean(rows.filter((x) => x.r.confidence != null).map((x) => x.r.confidence)),
    dangerIds: rows.filter((x) => x.c.dangerAny).map((x) => `${x.item.id}:${x.r.choice}@${x.r.confidence}`),
    wrongIds: rows.filter((x) => !x.c.exact).map((x) => `${x.item.id}:${x.r.choice}@${x.r.confidence}`),
  };
}

function show(label, res, t) {
  const m = metrics(res, t);
  const lat = res.calls.map((c) => c.ms);
  console.log(`\n${label}  (threshold ${t}, N=${m.n})`);
  console.log(`  calls ${res.usage.calls} | wall ${res.wallMs} ms | slowest call ${Math.max(...lat, 0)} ms | cost $${res.usage.chargeUsd}`);
  console.log(`  exact-label errors ${m.errors} | wrong-route (any confidence) ${m.harmfulAny} | wrong-route passing the gate ${m.danger}`);
  console.log(`  bound lines reaching their verifier ${m.coverage} | mean confidence: bound-expected ${m.meanConfBound}, all ${m.meanConfAll}`);
  console.log(`  wrong-route lines: ${m.dangerIds.join(', ') || 'none'}`);
  console.log(`  all errors: ${m.wrongIds.join(', ') || 'none'}`);
  if (res.e2e) {
    const contradicted = res.e2e.findings.filter((f) => f.bucket === 'contradicted').map((f) => f.line);
    const should = new Set(res.e2e.shouldContradict);
    const falseC = contradicted.filter((l) => !should.has(l));
    const missedC = [...should].filter((l) => !contradicted.includes(l));
    console.log(`  end-to-end hard-cases: Contradicted lines [${contradicted}] | false Contradicted ${falseC.length} [${falseC}] | true drift missed ${missedC.length} [${missedC}]`);
  }
}

const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === 'compare') {
  show(`design: README-as-state (${a})`, load(a), 0.8);
  show(`design: line-as-state   (${b})`, load(b), 0.8);
} else if (cmd === 'sweep') {
  const res = load(a);
  console.log(`threshold | wrong-route passing | bound lines reaching verifier  (N=${res.results.length})`);
  for (let t = 0.5; t <= 0.951; t += 0.05) {
    const m = metrics(res, Number(t.toFixed(2)));
    console.log(`  ${t.toFixed(2)}    |  ${String(m.danger).padStart(2)}                 | ${m.coverage}`);
  }
} else if (cmd === 'report') {
  show(a, load(a), Number(b));
} else if (cmd === 'drift') {
  const r1 = load(a); const r2 = load(b); const t = Number(c);
  const m2 = Object.fromEntries(r2.results.map((r) => [r.id, r]));
  const changed = r1.results.filter((r) => r.choice !== m2[r.id]?.choice).map((r) => `${r.id}:${r.choice}->${m2[r.id]?.choice}`);
  const confShift = r1.results.map((r) => Math.abs(r.confidence - (m2[r.id]?.confidence ?? 0)));
  const wrong1 = new Set(r1.results.filter((r) => !classify(r, t).exact).map((r) => r.id));
  const wrong2 = new Set(r2.results.filter((r) => !classify(r, t).exact).map((r) => r.id));
  const both = [...wrong1].filter((id) => wrong2.has(id));
  const either = new Set([...wrong1, ...wrong2]);
  console.log(`distinct lines N=${r1.results.length}`);
  console.log(`  label drift (different label between the two runs): ${changed.length} [${changed.join(', ') || 'none'}]`);
  console.log(`  mean |confidence change| ${mean(confShift)}, max ${Math.max(...confShift, 0).toFixed(3)}`);
  console.log(`  distinct lines wrong in at least one run: ${either.size} | wrong in both runs (blind spots): ${both.length} [${both.join(', ') || 'none'}]`);
  console.log(`  run 1 wrong-route passing gate ${metrics(r1, t).danger} | run 2 ${metrics(r2, t).danger}`);
} else {
  console.error('usage: node evaluation/analyze.js compare|sweep|report|drift ...');
  process.exit(2);
}
