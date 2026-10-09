// Merges verifier results into the four buckets (PRD M7). Pure.
export const ORDER = ['contradicted', 'missing', 'unverifiable', 'verified'];

// claim: { claimType, line, quote, name, decidedBy, confidence, lowConfidence }
// result: { bucket, evidence: { file, detail } }
export function makeFinding(claim, result, verifier) {
  return {
    bucket: result.bucket,
    claimType: claim.claimType,
    line: claim.line ?? null,
    quote: claim.quote ?? null,
    name: claim.name ?? null,
    evidence: result.evidence,
    decidedBy: claim.decidedBy,
    confidence: claim.confidence ?? null,
    lowConfidence: claim.lowConfidence === true,
    verifier,
  };
}

// Sorts findings (Contradicted first, then by line) and counts them. Throws if a finding has no valid bucket.
export function bucketize(findings) {
  const counts = { verified: 0, unverifiable: 0, missing: 0, contradicted: 0 };
  for (const f of findings) {
    if (!ORDER.includes(f.bucket)) throw new Error(`bucketize: unknown bucket "${f.bucket}"`);
    counts[f.bucket] += 1;
  }
  const sorted = [...findings].sort((a, b) =>
    ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket) || (a.line ?? Infinity) - (b.line ?? Infinity));
  return { findings: sorted, counts };
}
