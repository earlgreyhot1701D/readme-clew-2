// Bucket counts -> mascot mood (PRD 5). Pure.
// tangled: any Contradicted. worried: no Contradicted, any Missing.
// curious: at least half of the findings are Unverifiable. calm: everything else.
// tilt: any low-confidence finding.
export function mood(counts, findings = []) {
  const total = counts.verified + counts.unverifiable + counts.missing + counts.contradicted;
  let m = 'calm';
  if (counts.contradicted > 0) m = 'tangled';
  else if (counts.missing > 0) m = 'worried';
  else if (total > 0 && counts.unverifiable / total >= 0.5) m = 'curious';
  return { mood: m, tilt: findings.some((f) => f.lowConfidence === true) };
}
