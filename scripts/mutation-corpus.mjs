// Mutation check: the corpus test must fail when the data, the logic, or the audit drifts.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = {
  fixture: 'fixtures/corpus/repos/chalk-chalk.json',
  coverage: 'lib/verifiers/coverage.js',
  audit: 'fixtures/corpus/audit/hoppscotch-hoppscotch.json',
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
  // chalk no longer reports a subpath import as Missing, so the old mutation (turn "#ansi-styles"
  // into a relative path) changed nothing. This one does change the report: a package import the
  // README never names must show up, and the pinned expected report must notice.
  ['data: a package import the README never names appears', files.fixture, "import ansiStyles from '#ansi-styles';", "import leftPad from 'left-pad';"],
  ['logic: coverage reports nothing at all', files.coverage, 'if (mentionsWord(readme, name)) continue;', 'continue;'],
  // chalk's audit has no false verdict left; flip one on hoppscotch, where the ratchet is also zero.
  ['audit: a verdict is flipped to false', files.audit, '"key": "missing/dependency/@hoppscotch/ui#repo",\n      "verdict": "no_action",', '"key": "missing/dependency/@hoppscotch/ui#repo",\n      "verdict": "false",'],
];

for (const [label, file, from, to] of cases) {
  const restore = mutate(file, from, to);
  const code = run();
  restore();
  console.log(`${label}: exit=${code} ${code === 0 ? 'NOT KILLED' : 'killed'}`);
}
console.log(`restored: exit=${run()}`);
