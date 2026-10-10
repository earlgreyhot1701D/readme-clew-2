// Confidence gate (PRD 3c). Pure.
// Only Jev's verifier-bound labels are gated. Rule decisions carry no confidence and are never gated.
// Wavering between not_a_claim and unverifiable cannot produce Contradicted, so it is not gated.

// Final value, set in Block 2 on golden-set split A (README-as-state, criteria revision 2). See LEDGER.md, Block 2.
// On split A the number of wrong routes passing the gate was flat from 0.5 to 0.85, so the data alone did not
// pick a value inside that range. 0.8 is the conservative prior from MLH's evaluation; the held-out split B checks it.
export const THRESHOLD = 0.8;

export const VERIFIER_BOUND = new Set(['dependency', 'command', 'env_var', 'file_or_url']);

// -> { pass, lowConfidence }. pass false means: send to Unverifiable with the "low confidence" tag.
export function gate({ claimType, decidedBy, confidence }) {
  if (decidedBy !== 'jev' || !VERIFIER_BOUND.has(claimType) || typeof confidence !== 'number') {
    return { pass: true, lowConfidence: false };
  }
  const low = confidence < THRESHOLD;
  return { pass: !low, lowConfidence: low };
}
