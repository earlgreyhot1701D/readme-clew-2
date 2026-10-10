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

export function buildReceipt({ runId, now = new Date(), repo, commit, readme, report, calls, stepsMs }) {
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
    calls,
    stepsMs,
    architecture: "Rules and verifiers decide what's true. Jev labels lines. Haiku explains.",
  };
}
