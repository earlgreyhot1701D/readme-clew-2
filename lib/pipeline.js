// The scan steps, wired together (PRD 3). Block 1: no network. Jev answers come from a mock object.
// Block 2 swaps `jev` for real Glasser answers in batches of 100. Block 3 adds github.js in front.
//
// jev = { labels: { [lineNumber]: { choice, confidence } }, names: { [lineNumber]: { choice, confidence } } }
//   labels: one answer per line the pre-filter did not decide.
//   names:  one answer per line that has 2+ name candidates (PRD 4.2). A single candidate skips Jev.
import { segment } from './segment.js';
import { prefilter } from './prefilter.js';
import { candidates, namesFor } from './candidates.js';
import { gate } from './gate.js';
import { makeFinding } from './buckets.js';
import { buildReport } from './report.js';
import { verifyDependency } from './verifiers/dependencies.js';
import { verifyCommand } from './verifiers/commands.js';
import { verifyEnvVar } from './verifiers/envvars.js';
import { verifyReference } from './verifiers/references.js';
import { verifyCoverage } from './verifiers/coverage.js';
import { askAll, totalUsage } from './jev.js';
import { labelRequests, nameRequests, pickTargets, toJevAnswers } from './questions.js';

const VERIFIERS = {
  dependency: [verifyDependency, 'dependencies'],
  command: [verifyCommand, 'commands'],
  env_var: [verifyEnvVar, 'envvars'],
  file_or_url: [verifyReference, 'references'],
};

const unverifiable = (detail) => ({ bucket: 'unverifiable', evidence: { file: null, detail } });

// repo: { owner, name, readmePath }. snapshot: { pkg, workspaces, files, sources } (see verifiers/dependencies.js).
export function runPipeline({ readme, repo, snapshot, jev = {}, ms = 0 }) {
  const lines = segment(readme);
  const findings = [];
  let linesToJev = 0;

  for (const line of lines) {
    let label;
    let decidedBy = 'rule';
    let confidence = null;
    const rule = prefilter(line);
    if (rule) {
      label = rule.label;
    } else {
      linesToJev += 1;
      const answer = jev.labels?.[line.n];
      if (!answer) throw new Error(`No Jev answer for line ${line.n}`);
      label = answer.choice;
      confidence = answer.confidence;
      decidedBy = 'jev';
    }
    if (label === 'not_a_claim') continue;

    const claim = { claimType: label, line: line.n, quote: line.text, name: null, decidedBy, confidence, lowConfidence: false };
    if (label === 'unverifiable') {
      findings.push(makeFinding(claim, unverifiable('A claim the code cannot check'), null));
      continue;
    }
    const verifier = VERIFIERS[label];
    if (!verifier) throw new Error(`Unknown claim type "${label}" on line ${line.n}`);

    const names = namesFor(candidates(line.text, { inFence: line.inFence }), label);
    if (names.length === 1) {
      claim.name = names[0];
    } else if (names.length > 1) {
      const pick = jev.names?.[line.n];
      if (pick && names.includes(pick.choice)) {
        claim.name = pick.choice;
        claim.decidedBy = 'jev'; // Jev contributed, so the gate applies to the weaker of the two confidences
        claim.confidence = Math.min(confidence ?? 1, pick.confidence);
      }
    }

    const g = gate(claim);
    if (!g.pass) {
      claim.lowConfidence = true;
      findings.push(makeFinding(claim, unverifiable(`Jev wasn't sure (confidence ${claim.confidence})`), null));
      continue;
    }
    const [verify, verifierName] = verifier;
    findings.push(makeFinding(claim, verify(claim.name, snapshot, { text: line.text, inFence: line.inFence }), verifierName));
  }

  for (const m of verifyCoverage(readme, snapshot)) {
    findings.push(makeFinding(m, { bucket: m.bucket, evidence: m.evidence }, m.verifier));
  }
  return buildReport({ repo, findings, meta: { linesTotal: lines.length, linesToJev }, ms });
}

// The real scan: ask Jev through Glasser, then run the same deterministic steps as runPipeline.
// Round 1 labels every line the pre-filter left undecided. Round 2 (only if needed) picks names on lines with 2+ candidates.
// mode "readme" (default) sends the whole README as state, one question per line. mode "line" sends each line alone.
// ask is injectable so tests stay offline. A Glasser failure throws a JevError (the caller shows an honest error state).
export async function scan({ readme, repo, snapshot, mode = 'readme', ask = askAll }) {
  const t0 = Date.now();
  const lines = segment(readme);
  const first = await ask(labelRequests(lines, mode));
  const jev = toJevAnswers(first.answers);
  const calls = [...first.calls];
  const targets = pickTargets(lines, jev.labels);
  if (targets.length) {
    const second = await ask(nameRequests(lines, targets, mode));
    Object.assign(jev.names, toJevAnswers(second.answers).names);
    calls.push(...second.calls);
  }
  const report = runPipeline({ readme, repo, snapshot, jev, ms: Date.now() - t0 });
  return { report, usage: totalUsage(calls), calls };
}
