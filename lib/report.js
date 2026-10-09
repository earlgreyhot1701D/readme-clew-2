// Builds the report object (PRD 3b). Pure. Nothing else shapes the report.
// quote is copied by code from the README line (set upstream in the claim). It is never model output.
import { bucketize } from './buckets.js';
import { mood } from './mood.js';
import { lineLink } from './links.js';

export const JEV_MODEL = 'jev-1.13.0';

export function buildReport({ repo, findings, meta, notes = null, ms = 0 }) {
  const { findings: sorted, counts } = bucketize(findings);
  const withIds = sorted.map((f, i) => ({
    id: `f-${String(i + 1).padStart(2, '0')}`,
    ...f,
    // Missing findings have no line and no link.
    link: f.line == null ? null : lineLink({ owner: repo.owner, name: repo.name, readmePath: repo.readmePath, line: f.line }),
  }));
  const m = mood(counts, withIds);
  return {
    repo: { owner: repo.owner, name: repo.name, readmePath: repo.readmePath ?? 'README.md' },
    counts,
    findings: withIds,
    notes, // Block 4: Haiku summary and bucket notes. null means Haiku did not run or failed.
    mood: m.mood,
    tilt: m.tilt,
    meta: { jevModel: JEV_MODEL, readmeTruncated: false, ...meta, ms },
    receipt: null, // Block 3: receipt.js builds this (PRD 3e).
  };
}
