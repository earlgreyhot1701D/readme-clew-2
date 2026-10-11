// What Jev actually decided on an Unverifiable row, in words, instead of a bare confidence number (pure).
// Only Unverifiable rows decided by Jev get a verdict. A row that went to a code check keeps its confidence bar.

// Must match lib/gate.js: the claim types a verifier can check, and the confidence bar a label must reach (a test pins both).
export const JEV_CHECKABLE = new Set(['dependency', 'command', 'env_var', 'file_or_url']);
export const GATE_BAR = 0.8;

const typeLabel = (t) => String(t).toUpperCase().replace(/_/g, ' ');
const sure = (c) => (typeof c === 'number' && Number.isFinite(c) ? c.toFixed(2) : null);

// -> a string for rows Jev kept away from a code check, or null (show the bar, or nothing).
//   code type + lowConfidence:  JEV THOUGHT: COMMAND (0.62), BELOW THE 0.8 BAR
//   any other type:             JEV: NOT A CHECKABLE CLAIM (0.95 SURE)
export function jevVerdict(f) {
  if (f?.bucket !== 'unverifiable' || f.decidedBy !== 'jev') return null;
  const n = sure(f.confidence);
  if (JEV_CHECKABLE.has(f.claimType)) {
    if (f.lowConfidence !== true) return null; // it went to a code check, so the bar stays
    return `JEV THOUGHT: ${typeLabel(f.claimType)}${n ? ` (${n}),` : ','} BELOW THE ${GATE_BAR} BAR`;
  }
  return `JEV: NOT A CHECKABLE CLAIM${n ? ` (${n} SURE)` : ''}`;
}
