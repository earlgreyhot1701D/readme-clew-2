// Rule-based decisions for obvious lines (PRD 3c). Pure.
// Returns { label, rule } when a rule decides the line, or null when the line must go to Jev.
const CMD_START = /^\s*(?:\$\s+)?(?:npm|pnpm|yarn|npx|node|bun)(?:\s|$)/;
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const COMMENT = /^\s*<!--.*-->\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s/;
// process.env.X, or a backticked UPPER_SNAKE token (needs an underscore, so `README` or `JSON` do not match).
const ENV = /process\.env\.[A-Za-z_]\w*|`[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+`/;
const REL_LINK_ONLY = /^\s*(?:[-*+]\s+)?\[[^\]]+\]\(\.{1,2}\/[^)\s]*\)\s*$/;

function onlyImages(text) {
  const rest = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\[\s*\]\([^)]*\)/g, '');
  return rest !== text && rest.trim() === '';
}

export function prefilter(line) {
  const t = line.text;
  if (line.isFence) return { label: 'not_a_claim', rule: 'fence-marker' }; // marker lines are not in the 3c table; they are never claims
  if (t.trim() === '') return { label: 'not_a_claim', rule: 'empty' };
  if (HR.test(t)) return { label: 'not_a_claim', rule: 'hr' };
  if (COMMENT.test(t)) return { label: 'not_a_claim', rule: 'comment' };
  if (HEADING.test(t) && !t.includes('`')) return { label: 'not_a_claim', rule: 'heading' };
  if (onlyImages(t)) return { label: 'not_a_claim', rule: 'badge' };
  if (line.inFence && CMD_START.test(t)) return { label: 'command', rule: 'fenced-command' };
  if (ENV.test(t)) return { label: 'env_var', rule: 'env-token' };
  if (REL_LINK_ONLY.test(t)) return { label: 'file_or_url', rule: 'relative-link' };
  return null;
}
