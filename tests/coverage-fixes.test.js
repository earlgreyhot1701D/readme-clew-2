// Coverage semantics found by auditing reports on 86 real repos: a dev-only config import is noise,
// a bare specifier that names a local directory is not a package, and a cut README hides mentions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline } from '../lib/pipeline.js';

const noJev = new Proxy({}, { get: () => ({ choice: 'not_a_claim', confidence: 1 }) });
const readme = '# Demo\n\nNothing to see here.\n';
const run = (snapshot, opts = {}) => runPipeline({
  readme, repo: { owner: 'demo', name: 'demo' }, snapshot, jev: { labels: noJev, names: noJev }, ...opts,
});
const missingNames = (snapshot, opts) => run(snapshot, opts).findings.filter((f) => f.bucket === 'missing').map((f) => f.name);

// A lint/test tool imported only from its own config says nothing about what the package ships.
const configOnly = {
  pkg: { name: 'demo', devDependencies: { jest: '^29.0.0' } },
  workspaces: [],
  files: ['package.json', 'jest.config.js', 'src/index.js'],
  sources: { 'jest.config.js': "import { run } from 'jest';\n", 'src/index.js': 'export const x = 1;\n' },
};

test('coverage: strict R5 drops a devDependency imported only from a config file', () => {
  assert.ok(missingNames(configOnly).includes('jest'), 'the finding must exist before the filter');
  assert.ok(!missingNames(configOnly, { strictR5: true }).includes('jest'));
});

test('coverage: strict R5 keeps a runtime dependency, even when only a config imports it', () => {
  // Both fields on purpose: the first version declared the package only as a runtime dependency, so the
  // rule already refused to drop it for the other reason and this assertion could never fail.
  const runtime = {
    pkg: { name: 'demo', dependencies: { lodash: '4.17.21' }, devDependencies: { jest: '^29.0.0', lodash: '4.17.21' } },
    workspaces: [],
    files: ['package.json', 'jest.config.js', 'src/index.js'],
    sources: { 'jest.config.js': "import _ from 'lodash';\nimport { run } from 'jest';\n", 'src/index.js': 'export const x = 1;\n' },
  };
  const names = missingNames(runtime, { strictR5: true });
  assert.ok(names.includes('lodash'), 'a runtime field must block the drop');
  assert.ok(!names.includes('jest'));
});

// The rule names three runtime fields. Each one has to block the drop on its own, or a "simplification"
// that keeps only `dependencies` would quietly reintroduce the false removals the rule exists to avoid.
test('coverage: strict R5 treats peer and optional dependencies as runtime', () => {
  const fields = {
    peerDependencies: { react: '^18.0.0' },
    optionalDependencies: { fsevents: '^2.3.0' },
  };
  for (const [field, deps] of Object.entries(fields)) {
    const [name] = Object.keys(deps);
    const snapshot = {
      pkg: { name: 'demo', devDependencies: { jest: '^29.0.0', ...deps }, [field]: deps },
      workspaces: [],
      files: ['package.json', 'jest.config.js', 'src/index.js'],
      sources: { 'jest.config.js': `import x from '${name}';\nimport { run } from 'jest';\n`, 'src/index.js': 'export const x = 1;\n' },
    };
    assert.ok(missingNames(snapshot).includes(name), `${field}: the finding must exist before the filter`);
    assert.ok(missingNames(snapshot, { strictR5: true }).includes(name), `${field} must block the drop`);
    // Drop control on the same fixture: the filter still runs, so the assertion above is not passing
    // because nothing is ever dropped here.
    assert.ok(!missingNames(snapshot, { strictR5: true }).includes('jest'), `${field}: the filter must still drop jest`);
  }
});

// A monorepo can declare the two sides in different manifests: the workspace lists the devDependency,
// the root lists the runtime one. Both have to be read, and the block has to survive the split.
test('coverage: strict R5 reads the runtime fields of every manifest', () => {
  const inWorkspace = {
    pkg: { name: 'demo' },
    workspaces: [{
      path: 'packages/ui',
      pkg: { name: 'ui', devDependencies: { 'date-fns': '^3.0.0', 'size-limit': '^11.0.0' }, dependencies: { 'date-fns': '^3.0.0' } },
    }],
    files: ['package.json', 'packages/ui/package.json', 'packages/ui/.size-limit.ts'],
    sources: { 'packages/ui/.size-limit.ts': "import { format } from 'date-fns';\nimport type { SizeLimitConfig } from 'size-limit';\n" },
  };
  assert.ok(missingNames(inWorkspace).includes('date-fns'), 'the finding must exist before the filter');
  assert.ok(missingNames(inWorkspace, { strictR5: true }).includes('date-fns'), 'a runtime field in a workspace must block the drop');
  // Drop control: the dev-only package in the same file is dropped, so the filter demonstrably ran.
  assert.ok(!missingNames(inWorkspace, { strictR5: true }).includes('size-limit'), 'the filter must still drop the dev-only package');

  const apart = {
    ...inWorkspace,
    pkg: { name: 'demo', dependencies: { 'date-fns': '^3.0.0' } },
    workspaces: [{ path: 'packages/ui', pkg: { name: 'ui', devDependencies: { 'date-fns': '^3.0.0' } } }],
  };
  assert.ok(missingNames(apart, { strictR5: true }).includes('date-fns'), 'a runtime field in the root manifest must block the drop for a workspace devDependency');
});

// jellyfin-web resolves "scripts/browser" to src/scripts/browser.js through a webpack alias the
// tsconfig map cannot see, so the bare first segment must not be reported as a package.
const localAlias = {
  pkg: { name: 'demo' },
  workspaces: [],
  files: ['package.json', 'src/RootApp.tsx', 'src/scripts/browser.js'],
  sources: { 'src/RootApp.tsx': "import browser from 'scripts/browser';\nimport pad from 'left-pad';\n" },
};

test('coverage: an undeclared name that is also a local directory is not Missing', () => {
  const names = missingNames(localAlias);
  assert.ok(!names.includes('scripts'), `scripts was reported: ${JSON.stringify(names)}`);
  // Control: a name with no matching directory is still reported, so the rule is not "drop everything".
  assert.ok(names.includes('left-pad'));
});

// A README cut at the 50 KB cap can hide the mention that would have kept a package out of Missing.
const undeclared = {
  pkg: { name: 'demo' },
  workspaces: [],
  files: ['package.json', 'src/index.js'],
  sources: { 'src/index.js': "import pad from 'left-pad';\n" },
};
const caveat = (opts) => run(undeclared, opts).findings.find((f) => f.name === 'left-pad');

test('coverage: a truncated README keeps the Missing bucket and adds the caveat', () => {
  const plain = caveat({ truncated: false });
  assert.equal(plain.bucket, 'missing');
  assert.ok(!/cut at the 50 KB cap/.test(plain.evidence.detail));

  const cut = caveat({ truncated: true });
  assert.equal(cut.bucket, 'missing', 'the bucket must not change');
  assert.match(cut.evidence.detail, /cut at the 50 KB cap/);
});

// The real scan path must carry the flag too, or the caveat would only exist in unit tests.
test('coverage: scan forwards the truncation flag to the pipeline', async () => {
  const { scan } = await import('../lib/pipeline.js');
  const ask = async (requests) => ({
    answers: Object.fromEntries(requests.flatMap((r) => Object.keys(r.questions)
      .map((id) => [id, { type: 'choice', choice: 'not_a_claim', confidence: 1, probabilities: {} }]))),
    calls: [],
  });
  const args = { readme, repo: { owner: 'demo', name: 'demo' }, snapshot: undeclared, ask };

  const plain = await scan(args);
  const plainFinding = plain.report.findings.find((f) => f.name === 'left-pad');
  assert.ok(!/cut at the 50 KB cap/.test(plainFinding.evidence.detail));

  const cut = await scan({ ...args, truncated: true });
  const cutFinding = cut.report.findings.find((f) => f.name === 'left-pad');
  assert.match(cutFinding.evidence.detail, /cut at the 50 KB cap/);
});

test('coverage: strict R5 treats hidden tooling directories as non-shipped', () => {
  const hidden = {
    pkg: { name: 'demo', devDependencies: { '@storybook/react': '^8.0.0' } },
    workspaces: [],
    files: ['package.json', '.storybook/main.ts', 'src/index.js'],
    sources: { '.storybook/main.ts': "import { x } from '@storybook/react';\n", 'src/index.js': 'export const x = 1;\n' },
  };
  assert.ok(missingNames(hidden).includes('@storybook/react'));
  assert.ok(!missingNames(hidden, { strictR5: true }).includes('@storybook/react'));

  // Control: the same package imported from shipped source is kept, hidden dirs or not.
  const used = {
    ...hidden,
    files: [...hidden.files, 'src/story.ts'],
    sources: { ...hidden.sources, 'src/story.ts': "import { y } from '@storybook/react';\n" },
  };
  assert.ok(missingNames(used, { strictR5: true }).includes('@storybook/react'));
});

// The corpus that measured this is not part of this tree, so the behaviour is pinned here with inline
// fixtures: the two dotfiles named in the issue, the rule at depth, a workspace manifest, and the
// same package imported from shipped source.
test('coverage: strict R5 drops a dev-only import that lives only in a dotfile', () => {
  const dotfile = {
    pkg: { name: 'demo', devDependencies: { 'size-limit': '^11.0.0' } },
    workspaces: [],
    files: ['package.json', '.size-limit.ts', 'src/index.js'],
    sources: { '.size-limit.ts': "import type { SizeLimitConfig } from 'size-limit';\n", 'src/index.js': 'export const x = 1;\n' },
  };
  assert.ok(missingNames(dotfile).includes('size-limit'), 'the finding must exist before the filter');
  assert.ok(!missingNames(dotfile, { strictR5: true }).includes('size-limit'));

  // The second case from the issue, a doctest setup file at the root.
  const doctest = {
    pkg: { name: 'demo', devDependencies: { 'lodash-doc-globals': '^1.0.0' } },
    workspaces: [],
    files: ['package.json', '.markdown-doctest-setup.js', 'src/index.js'],
    sources: { '.markdown-doctest-setup.js': "require('lodash-doc-globals');\n", 'src/index.js': 'export const x = 1;\n' },
  };
  assert.ok(missingNames(doctest).includes('lodash-doc-globals'), 'the finding must exist before the filter');
  assert.ok(!missingNames(doctest, { strictR5: true }).includes('lodash-doc-globals'));

  // Depth: the same file one directory down is the same kind of file.
  const nested = {
    ...dotfile,
    files: ['package.json', 'packages/ui/.size-limit.ts', 'packages/ui/src/index.js'],
    sources: {
      'packages/ui/.size-limit.ts': "import type { SizeLimitConfig } from 'size-limit';\n",
      'packages/ui/src/index.js': 'export const x = 1;\n',
    },
  };
  assert.ok(missingNames(nested).includes('size-limit'), 'the finding must exist before the filter');
  assert.ok(!missingNames(nested, { strictR5: true }).includes('size-limit'));

  // A workspace declares its own devDependencies, so the rule has to read every manifest, not the root
  // one. Without the workspace lookup this package is "declared nowhere" and the finding survives.
  const workspace = {
    pkg: { name: 'demo' },
    workspaces: [{ path: 'packages/ui', pkg: { name: 'ui', devDependencies: { 'size-limit': '^11.0.0' } } }],
    files: ['package.json', 'packages/ui/package.json', 'packages/ui/.size-limit.ts', 'packages/ui/src/index.js'],
    sources: {
      'packages/ui/.size-limit.ts': "import type { SizeLimitConfig } from 'size-limit';\n",
      'packages/ui/src/index.js': 'export const x = 1;\n',
    },
  };
  assert.ok(missingNames(workspace).includes('size-limit'), 'the finding must exist before the filter');
  assert.ok(!missingNames(workspace, { strictR5: true }).includes('size-limit'));

  // Control: an import in shipped source keeps the finding, dotfile or not.
  const used = { ...dotfile, sources: { ...dotfile.sources, 'src/size.ts': "import { x } from 'size-limit';\n" } };
  assert.ok(missingNames(used, { strictR5: true }).includes('size-limit'));
});

// A malformed snapshot must not take the scan down. This was found by red team: a source entry that is
// not a string made the site scanner throw, and the same input comes from a network response. The
// import sits in scripts/ because coverage has to emit a finding first, or the scanner is never reached.
test('coverage: a malformed source entry does not crash the scan', () => {
  const broken = {
    pkg: { name: 'demo', devDependencies: { jest: '^29.0.0' } },
    workspaces: [],
    files: ['package.json', 'scripts/build.js', 'jest.config.js', 'src/x.js'],
    sources: { 'scripts/build.js': "import { run } from 'jest';\n", 'jest.config.js': 42, 'src/x.js': null },
  };
  assert.ok(missingNames(broken).includes('jest'), 'the finding must exist before the filter');
  assert.doesNotThrow(() => missingNames(broken, { strictR5: true }));
  assert.ok(!missingNames(broken, { strictR5: true }).includes('jest'), 'the filter still runs');
});

// The rule says "declared in devDependencies". A name that only exists on Object.prototype is not a
// declaration, and reading it as one would drop a finding for a package nobody declared. The file sits
// in scripts/ because coverage does not read test folders at all, so a tests/ fixture proves nothing.
test('coverage: an inherited property is not a devDependency declaration', () => {
  for (const name of ['constructor', 'toString']) {
    const snapshot = {
      pkg: { name: 'demo', devDependencies: {} },
      workspaces: [],
      files: ['package.json', 'scripts/build.js'],
      sources: { 'scripts/build.js': `import x from '${name}';\n` },
    };
    assert.ok(missingNames(snapshot, { strictR5: true }).includes(name), `${name} was dropped without a declaration`);
  }
});

// The alias map needs the specifier as written. "@shared/ipc/schemas/x" points at a file, while the
// package name "@shared/ipc" points at nothing, and the first version asked for the name. Found by a
// manual audit of 63 cases: 39 false findings on the frozen corpus, 0.69%.
test('coverage: a tsconfig alias with a subpath is local, not a package', () => {
  const snapshot = {
    pkg: { name: 'demo' },
    workspaces: [],
    files: ['package.json', 'src/shared/ipc/schemas/x.ts', 'src/main.ts'],
    tsconfigs: { 'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['./src/shared/*'] } } }) },
    sources: { 'src/main.ts': "import { x } from '@shared/ipc/schemas/x';\n" },
  };
  const names = missingNames(snapshot);
  assert.ok(!names.includes('@shared/ipc'), `alias reported: ${JSON.stringify(names)}`);

  // Control: the same alias pointing at a file that does not exist is still a package claim.
  const missingTarget = { ...snapshot, sources: { 'src/main.ts': "import { y } from '@shared/nope/x';\n" } };
  assert.ok(missingNames(missingTarget).includes('@shared/nope'), 'an alias that resolves to nothing must stay a finding');
});

// The full specifier must not turn a real package into a local file. A rule keyed "react" cannot claim
// "react-dom", because no file exists at the mapped target.
test('coverage: an alias prefix does not swallow a real package', () => {
  const snapshot = {
    pkg: { name: 'demo' },
    workspaces: [],
    files: ['package.json', 'src/shims/react.ts', 'src/app.tsx'],
    tsconfigs: { 'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { react: ['./src/shims/react.ts'] } } }) },
    sources: { 'src/app.tsx': "import * as ReactDOM from 'react-dom';\nimport * as React from 'react';\n" },
  };
  const names = missingNames(snapshot);
  assert.ok(names.includes('react-dom'), `react-dom must stay a finding: ${JSON.stringify(names)}`);
  assert.ok(!names.includes('react'), 'the mapped name itself is local');
});

// Test-runner configuration is tooling even when its name is not "*.config.*". Measured on 1165
// repositories: 22 such files, and recognising them removes 51 dev-only findings with no runtime field.
test('coverage: strict R5 drops a devDependency imported only from a test-runner config', () => {
  for (const file of ['karma.conf.js', 'jest.preset.js', 'jest-setup.js', 'vitest-setup-client.ts', 'nightwatch.conf.js']) {
    const snapshot = {
      pkg: { name: 'demo', devDependencies: { karma: '^6.0.0' } },
      workspaces: [],
      files: ['package.json', file, 'src/index.js'],
      sources: { [file]: "module.exports = { plugins: [require('karma')] };\n", 'src/index.js': 'export const x = 1;\n' },
    };
    assert.ok(missingNames(snapshot).includes('karma'), `${file}: the finding must exist before the filter`);
    assert.ok(!missingNames(snapshot, { strictR5: true }).includes('karma'), `${file}: must be dropped`);
  }
});

// The rule matches the tool name as a whole segment, not a substring: a shipped file named
// "my-karma.conf.js" is not a karma configuration.
test('coverage: a file that merely contains a tool name is not a config', () => {
  const snapshot = {
    pkg: { name: 'demo', devDependencies: { karma: '^6.0.0' } },
    workspaces: [],
    files: ['package.json', 'src/my-karma.conf.js', 'src/index.js'],
    sources: { 'src/my-karma.conf.js': "import { Server } from 'karma';\n", 'src/index.js': 'export const x = 1;\n' },
  };
  assert.ok(missingNames(snapshot, { strictR5: true }).includes('karma'), 'a shipped file must keep its finding');
});

// scanRepo is the only real caller of scan(). If it drops the flag, the caveat can never reach a
// report, no matter what the pipeline does.
test('coverage: scanRepo carries the truncation flag from the fetched repo into the report', async () => {
  const { scanRepo } = await import('../lib/scan-repo.js');
  const ask = async (requests) => ({
    answers: Object.fromEntries(requests.flatMap((r) => Object.keys(r.questions)
      .map((id) => [id, { type: 'choice', choice: 'not_a_claim', confidence: 1, probabilities: {} }]))),
    calls: [],
  });
  const deps = (truncated) => ({
    fetchRepo: async () => ({ readme, readmePath: 'README.md', truncated, commit: 'a'.repeat(40), snapshot: undeclared }),
    summarize: async () => ({ notes: null, usage: { status: 'skipped' } }),
    ask,
    now: () => 0,
    runId: () => 'scan_test',
  });

  const plain = await scanRepo({ owner: 'demo', name: 'demo' }, deps(false));
  const plainFinding = plain.report.findings.find((f) => f.name === 'left-pad');
  assert.equal(plain.report.meta.readmeTruncated, false);
  assert.ok(!/cut at the 50 KB cap/.test(plainFinding.evidence.detail));

  const cut = await scanRepo({ owner: 'demo', name: 'demo' }, deps(true));
  const cutFinding = cut.report.findings.find((f) => f.name === 'left-pad');
  assert.equal(cut.report.meta.readmeTruncated, true);
  assert.equal(cutFinding.bucket, 'missing', 'the bucket must not change');
  assert.match(cutFinding.evidence.detail, /cut at the 50 KB cap/);
});

// The scan path, not just the pipeline, decides what a reader sees. A dev-only config import must
// not survive it, and a runtime import must.
test('coverage: scanRepo applies strict R5 to the report it returns', async () => {
  const { scanRepo } = await import('../lib/scan-repo.js');
  const ask = async (requests) => ({
    answers: Object.fromEntries(requests.flatMap((r) => Object.keys(r.questions)
      .map((id) => [id, { type: 'choice', choice: 'not_a_claim', confidence: 1, probabilities: {} }]))),
    calls: [],
  });
  const snapshot = {
    pkg: { name: 'demo', devDependencies: { jest: '^29.0.0' }, dependencies: { react: '^18.0.0' } },
    workspaces: [],
    files: ['package.json', 'jest.config.js', 'src/index.js'],
    sources: { 'jest.config.js': "import { run } from 'jest';\n", 'src/index.js': "import react from 'react';\n" },
  };
  const deps = {
    fetchRepo: async () => ({ readme, readmePath: 'README.md', truncated: false, commit: 'a'.repeat(40), snapshot }),
    summarize: async () => ({ notes: null, usage: { status: 'skipped' } }),
    ask,
    now: () => 0,
    runId: () => 'scan_test',
  };
  const { report } = await scanRepo({ owner: 'demo', name: 'demo' }, deps);
  const missing = report.findings.filter((f) => f.bucket === 'missing').map((f) => f.name);
  assert.ok(!missing.includes('jest'), `jest survived: ${JSON.stringify(missing)}`);
  assert.ok(missing.includes('react'), 'a runtime dependency must stay a finding');
});
