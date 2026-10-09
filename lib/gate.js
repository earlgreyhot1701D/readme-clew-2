// Confidence gate (PRD 3c). Pure.
// Only Jev's verifier-bound labels are gated. Rule decisions carry no confidence and are never gated.
// Wavering between not_a_claim and unverifiable cannot produce Contradicted, so it is not gated.

// PROVISIONAL: 0.7 is a placeholder for Block 1 mocks. Block 2 sets the final value by measuring confidence
// on verifier-bound lines after the 3c pre-filter (LEDGER.md, Block 0 decision 1).
export const THRESHOLD = 0.7;

export const VERIFIER_BOUND = new Set(['dependency', 'command', 'env_var', 'file_or_url']);

// -> { pass, lowConfidence }. pass false means: send to Unverifiable with the "low confidence" tag.
export function gate({ claimType, decidedBy, confidence }) {
  if (decidedBy !== 'jev' || !VERIFIER_BOUND.has(claimType) || typeof confidence !== 'number') {
    return { pass: true, lowConfidence: false };
  }
  const low = confidence < THRESHOLD;
  return { pass: !low, lowConfidence: low };
}
