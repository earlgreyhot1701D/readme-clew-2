// Scan receipt (PRD 3e). Built from counts code already has. No model writes any part of it, and no README text goes in.
import { createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// JSON with keys sorted at every level, so the same report always hashes the same.
export function canonicalJson(x) {
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(x[k])}`).join(',')}}`;
  }
  return JSON.stringify(x);
}

// reportSha256 is the fingerprint of the report with receipt set to null, so anyone can re-check it from the export.
export const hashReport = (report) => sha256(canonicalJson({ ...report, receipt: null }));

export const PARAM_KEYS = ['sourceBudget', 'sourcesRead', 'tsconfigsRead', 'bundlerAliases', 'workspacesRead', 'workspacesTruncated', 'readmeBytes', 'readmeTruncated'];

// Only known keys with number or boolean values enter the receipt. params is passed by a caller, and
// a free-form object is an opening for README text: {note: 'a line from the README'} was accepted
// before this whitelist, and the "no README text" test could not see it.
function cleanParams(params) {
  if (!params) return null;
  const out = {};
  for (const key of PARAM_KEYS) {
    const v = params[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function buildReceipt({ runId, now = new Date(), repo, commit, readme, report, calls, stepsMs, params = null }) {
  const total = report.meta.linesTotal;
  const toJev = report.meta.linesToJev;
  return {
    runId,
    scannedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    repo: `${repo.owner}/${repo.name}`,
    commit: commit ? String(commit).slice(0, 7) : null,
    readmeSha256: sha256(readme),
    reportSha256: hashReport(report),
    lines: { total, decidedByRule: total - toJev, decidedByJev: toJev, lowConfidence: report.findings.filter((f) => f.lowConfidence).length },
    // What shaped this scan. Without it two receipts with different findings look identical in
    // everything except the hash, and nobody can tell whether the difference came from the code.
    ...(() => { const clean = cleanParams(params); return clean ? { params: clean } : {}; })(),
    calls,
    stepsMs,
    architecture: "Rules and verifiers decide what's true. Jev labels lines. Haiku explains.",
  };
}
