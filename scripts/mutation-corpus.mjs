// Mutation check: the corpus test must fail when the data, the logic, or the audit drifts.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = {
  fixture: 'fixtures/corpus/repos/chalk-chalk.json',
  coverage: 'lib/verifiers/coverage.js',
  audit: 'fixtures/corpus/audit/chalk-chalk.json',
};

function run() {
  try {
    execFileSync(process.execPath, ['--test', 'tests/corpus.test.js'], { stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

function mutate(file, from, to) {
  const original = fs.readFileSync(file, 'utf8');
  if (!original.includes(from)) throw new Error(`no match in ${file}: ${from}`);
  fs.writeFileSync(file, original.replace(from, to), 'utf8');
  return () => fs.writeFileSync(file, original, 'utf8');
}

const baseline = run();
console.log(`baseline: exit=${baseline}`);

const cases = [
  ['data: a subpath import becomes relative', files.fixture, "import ansiStyles from '#ansi-styles';", "import ansiStyles from './vendor/ansi-styles/index.js';"],
  ['logic: coverage reports nothing at all', files.coverage, 'if (mentionsWord(readme, name)) continue;', 'continue;'],
  ['audit: a false verdict is flipped to correct', files.audit, '"key": "missing/dependency/#ansi-styles#repo",\n      "verdict": "false",', '"key": "missing/dependency/#ansi-styles#repo",\n      "verdict": "correct",'],
];

for (const [label, file, from, to] of cases) {
  const restore = mutate(file, from, to);
  const code = run();
  restore();
  console.log(`${label}: exit=${code} ${code === 0 ? 'NOT KILLED' : 'killed'}`);
}
console.log(`restored: exit=${run()}`);
