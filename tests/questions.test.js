import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segment } from '../lib/segment.js';
import {
  INSTRUCTION, CRITERIA, NONE, needsLabel, labelRequests, pickTargets, nameRequests, toJevAnswers,
} from '../lib/questions.js';

const README = '# Title\n\nBuilt with Express and Koa.\n\n```bash\nnpm install\n```\n\nSet `API_KEY` first.\n\nBlazingly fast.\n';
const lines = segment(README);

test('only lines the pre-filter left undecided are sent to Jev', () => {
  assert.deepEqual(needsLabel(lines).map((l) => l.n), [3, 11]);
});

test('the six claim types are the PRD 4.1 options, in order', () => {
  assert.deepEqual(Object.keys(CRITERIA), ['dependency', 'command', 'env_var', 'file_or_url', 'unverifiable', 'not_a_claim']);
});

test('the dependency criterion names its blind spots', () => {
  assert.match(CRITERIA.dependency, /^The verifier checks whether a named package appears in package\.json or in imports\./);
  assert.match(CRITERIA.dependency, /only mentions it/);
  assert.match(CRITERIA.dependency, /cannot tell a package from a product, service, or ordinary word in parentheses\./);
  assert.match(CRITERIA.dependency, /If you are not sure the name is a published npm package, choose unverifiable\.$/);
  assert.match(CRITERIA.env_var, /needs the variable name to be written on the line/);
});

test('criteria describe the verifier and hold no example lines', () => {
  for (const [name, text] of Object.entries(CRITERIA)) {
    assert.ok(!/["`]/.test(text), `${name} has quotes or backticks`);
    assert.ok(!/\be\.g\.|for example|such as|for instance/i.test(text), `${name} has an example`);
  }
  for (const name of ['dependency', 'command', 'env_var', 'file_or_url']) assert.match(CRITERIA[name], /^The verifier checks/);
});

test('the instruction has the test sentence and the "when in doubt" rule', () => {
  assert.ok(INSTRUCTION.includes('Imagine the verifier finds this name in the code. Would that prove this line is a true claim about this repo? If not, choose unverifiable or not_a_claim.'));
  assert.match(INSTRUCTION, /When in doubt, choose unverifiable\.$/);
});

test('readme mode: one request, the numbered README as state, one question per undecided line', () => {
  const reqs = labelRequests(lines, 'readme');
  assert.equal(reqs.length, 1);
  assert.ok(reqs[0].state.readme.startsWith('1: # Title\n2: \n3: Built with Express and Koa.'));
  assert.deepEqual(Object.keys(reqs[0].questions), ['l3', 'l11']);
  const q = reqs[0].questions.l3;
  assert.equal(q.type, 'choice');
  assert.equal(q.criteria, CRITERIA);
  assert.equal(q.instructions.line_text, 'Built with Express and Koa.');
  assert.equal(q.instructions.line_number, 3);
  assert.ok(q.instructions.question.startsWith(INSTRUCTION));
});

test('line mode: one request per line, the line itself is the state', () => {
  const reqs = labelRequests(lines, 'line');
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].state, 'Built with Express and Koa.');
  assert.deepEqual(Object.keys(reqs[0].questions), ['l3']);
  assert.equal(reqs[0].questions.l3.instructions, INSTRUCTION);
});

test('no undecided lines means no requests', () => {
  assert.deepEqual(labelRequests(segment('# Only a heading\n'), 'readme'), []);
});

test('name picks are only asked for verifier-bound lines with 2+ candidates', () => {
  const labels = { 3: { choice: 'dependency', confidence: 0.9 }, 11: { choice: 'unverifiable', confidence: 0.9 } };
  const targets = pickTargets(lines, labels);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].line.n, 3);
  assert.deepEqual(targets[0].names, ['express', 'koa']);
  assert.deepEqual(pickTargets(lines, { 3: { choice: 'not_a_claim', confidence: 0.9 } }), []);
});

test('the name question lists the candidates and a none_of_these way out', () => {
  const targets = pickTargets(lines, { 3: { choice: 'dependency', confidence: 0.9 } });
  const [req] = nameRequests(lines, targets, 'readme');
  const q = req.questions.n3;
  assert.deepEqual(Object.keys(q.criteria), ['express', 'koa', NONE]);
  assert.match(q.instructions.question, /When in doubt, choose none_of_these\./);
});

test('answers are mapped back to line numbers', () => {
  const out = toJevAnswers({
    l3: { type: 'choice', choice: 'dependency', confidence: 0.9, probabilities: {} },
    n3: { type: 'choice', choice: 'express', confidence: 0.8, probabilities: {} },
  });
  assert.deepEqual(out, { labels: { 3: { choice: 'dependency', confidence: 0.9 } }, names: { 3: { choice: 'express', confidence: 0.8 } } });
});
