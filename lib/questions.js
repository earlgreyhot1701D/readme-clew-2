// Builds the Jev question sets: claim-type labels (PRD 4.1) and name picks (PRD 4.2). Pure. No network.
//
// Written for a literal reader (MLH's Jev evaluation, credited in README.md):
//  - criteria say what each verifier mechanically checks and what it cannot see, not what a line looks like
//  - no example lines in the criteria
//  - one test sentence in the instructions
//  - when in doubt, unverifiable (a wrongly routed line can cost a false Contradicted)
import { prefilter } from './prefilter.js';
import { candidates, namesFor } from './candidates.js';
import { VERIFIER_BOUND } from './gate.js';

export const NONE = 'none_of_these';

export const INSTRUCTION = 'Decide what kind of claim this README line makes about the repository. '
  + 'Imagine the verifier finds this name in the code. Would that prove this line is a true claim about this repo? '
  + 'If not, choose unverifiable or not_a_claim. When in doubt, choose unverifiable.';

export const CRITERIA = {
  dependency: 'The verifier checks whether a named package appears in package.json or in imports. It cannot tell whether the README says the project uses it or only mentions it, and it cannot tell a package from a product, service, or ordinary word in parentheses.',
  command: 'The verifier checks that the script, file, or package an npm, pnpm, yarn, npx, node, or bun command names exists. It cannot tell what the command does or whether it works.',
  env_var: 'The verifier checks whether source code reads a named environment variable. It cannot see the value or whether setting it is required.',
  file_or_url: 'The verifier checks that a relative path exists in the repo file tree. It cannot check external web pages or what a file contains.',
  unverifiable: 'The line makes a claim about this repo, but no look-up in package.json, imports, scripts, environment reads, or file paths can confirm or refute it.',
  not_a_claim: 'The line makes no claim about this repo. Headings, descriptions of purpose, thanks, credits, inspiration, comparisons, and licenses all belong here.',
};

const NAME_INSTRUCTION = 'Which of these names is the thing this README line makes a claim about? '
  + 'Imagine the verifier looks that name up in the code. If the line is not clearly about exactly one of them, '
  + `choose ${NONE}. When in doubt, choose ${NONE}.`;
const NONE_TEXT = 'None of the other options is clearly what the line makes a claim about.';

// Lines the 3c pre-filter did not decide: these go to Jev.
export const needsLabel = (lines) => lines.filter((l) => prefilter(l) === null);

const numbered = (lines) => lines.map((l) => `${l.n}: ${l.text}`).join('\n');
const LINE_REF = ' The line to judge is `line_text`, line number `line_number` of the README in `readme`.';

function question(line, mode, text, criteria) {
  const instructions = mode === 'line'
    ? text
    : { question: text + LINE_REF, line_number: line.n, line_text: line.text };
  return { type: 'choice', instructions, criteria };
}

// mode "readme": the whole README is the state, one question per line (batched by jev.js, 100 per call).
// mode "line": the line itself is the state, one call per line.
function requests(lines, items, mode) {
  if (!items.length) return [];
  if (mode === 'line') return items.map(([id, line, q]) => ({ state: line.text, questions: { [id]: q } }));
  return [{ state: { readme: numbered(lines) }, questions: Object.fromEntries(items.map(([id, , q]) => [id, q])) }];
}

export function labelRequests(lines, mode = 'readme') {
  const items = needsLabel(lines).map((l) => [`l${l.n}`, l, question(l, mode, INSTRUCTION, CRITERIA)]);
  return requests(lines, items, mode);
}

// Lines whose label is verifier-bound and that have 2+ name candidates (single candidates skip Jev).
export function pickTargets(lines, labels) {
  const out = [];
  for (const line of lines) {
    const rule = prefilter(line);
    const label = rule ? rule.label : labels[line.n]?.choice;
    if (!VERIFIER_BOUND.has(label)) continue;
    const names = namesFor(candidates(line.text, { inFence: line.inFence }), label);
    if (names.length > 1) out.push({ line, names });
  }
  return out;
}

export function nameRequests(lines, targets, mode = 'readme') {
  const items = targets.map(({ line, names }) => {
    const criteria = { ...Object.fromEntries(names.map((n) => [n, null])), [NONE]: NONE_TEXT };
    return [`n${line.n}`, line, question(line, mode, NAME_INSTRUCTION, criteria)];
  });
  return requests(lines, items, mode);
}

// Glasser answers keyed by question id -> the { labels, names } shape that runPipeline takes.
export function toJevAnswers(answers) {
  const labels = {};
  const names = {};
  for (const [id, a] of Object.entries(answers)) {
    const target = id[0] === 'l' ? labels : id[0] === 'n' ? names : null;
    if (target) target[Number(id.slice(1))] = { choice: a.choice, confidence: a.confidence };
  }
  return { labels, names };
}
