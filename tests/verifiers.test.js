import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyDependency } from '../lib/verifiers/dependencies.js';
import { verifyCommand } from '../lib/verifiers/commands.js';
import { verifyEnvVar } from '../lib/verifiers/envvars.js';
import { verifyReference } from '../lib/verifiers/references.js';
import { verifyCoverage } from '../lib/verifiers/coverage.js';

const repo = {
  pkg: {
    name: 'demo',
    scripts: { build: 'x', 'start:prod': 'node dist/server.js', dev: 'vite' },
    dependencies: { express: '^4' },
    devDependencies: { vite: '^5', next: '^14' },
  },
  workspaces: [],
  files: ['package.json', 'README.md', 'src/index.js', 'docs/guide.md', 'tools/run.js'],
  sources: {
    'src/index.js': "import express from 'express';\nimport { join } from 'node:path';\nimport './local.js';\nconst k = process.env.API_KEY;\n",
    '.env.example': 'FROM_EXAMPLE=1\n',
  },
};

// dependencies
test('dependencies: Verified when declared', () => {
  const r = verifyDependency('vite', repo);
  assert.equal(r.bucket, 'verified');
  assert.deepEqual(r.evidence, { file: 'package.json', detail: 'devDependencies has vite' });
});
test('dependencies: "next.js" in prose matches the package next', () => {
  assert.equal(verifyDependency('next.js', repo).bucket, 'verified');
});
test('dependencies: Verified when only imported', () => {
  const r = verifyDependency('left-pad', { ...repo, sources: { 'a.js': "const l = require('left-pad');" } });
  assert.equal(r.bucket, 'verified');
});
test('dependencies: Contradicted when neither declared nor imported, in code context', () => {
  const r = verifyDependency('webpack', repo, { text: 'We bundle with `webpack`.', inFence: false });
  assert.equal(r.bucket, 'contradicted');
});
// Prose guard (fixes known limit #3): a name found only in prose is never Contradicted.
test('dependencies guard: prose-only name is Unverifiable, never Contradicted', () => {
  const r = verifyDependency('beta', repo, { text: 'Works with Notion (beta).', inFence: false });
  assert.equal(r.bucket, 'unverifiable');
  assert.match(r.evidence.detail, /only in prose/);
});
test('dependencies guard: no context at all is treated as prose', () => {
  assert.equal(verifyDependency('webpack', repo).bucket, 'unverifiable');
});
test('dependencies guard: backticks, a code fence, or an install command count as code context', () => {
  assert.equal(verifyDependency('webpack', repo, { text: 'Uses `webpack`.', inFence: false }).bucket, 'contradicted');
  assert.equal(verifyDependency('webpack', repo, { text: 'webpack', inFence: true }).bucket, 'contradicted');
  assert.equal(verifyDependency('webpack', repo, { text: 'Install it with npm install webpack', inFence: false }).bucket, 'contradicted');
  assert.equal(verifyDependency('webpack', repo, { text: 'Run yarn add webpack first.', inFence: false }).bucket, 'contradicted');
});
test('dependencies guard: a prose-only name that IS declared is still Verified', () => {
  assert.equal(verifyDependency('vite', repo, { text: 'Frontend (Vite)', inFence: false }).bucket, 'verified');
});
test('dependencies guard: a backticked name in a longer span still counts as code', () => {
  assert.equal(verifyDependency('webpack', repo, { text: 'Run `npm i webpack` once.', inFence: false }).bucket, 'contradicted');
});
test('dependencies: Unverifiable with no name', () => {
  assert.equal(verifyDependency(null, repo).bucket, 'unverifiable');
});

// commands
test('commands: Verified when the script exists', () => {
  assert.deepEqual(verifyCommand('npm run build', repo).evidence, { file: 'package.json', detail: 'scripts has build' });
});
test('commands: npm start with only start:prod is Contradicted', () => {
  const r = verifyCommand('npm start', repo);
  assert.equal(r.bucket, 'contradicted');
  assert.equal(r.evidence.detail, 'scripts has start:prod, no start');
});
test('commands: npm start falls back to server.js', () => {
  const r = verifyCommand('npm start', { ...repo, files: [...repo.files, 'server.js'] });
  assert.equal(r.bucket, 'verified');
});
test('commands: built-in package manager commands are Verified', () => {
  assert.equal(verifyCommand('npm install', repo).bucket, 'verified');
  assert.equal(verifyCommand('pnpm add left-pad', repo).bucket, 'verified');
});
test('commands: yarn and pnpm shortcuts run scripts', () => {
  assert.equal(verifyCommand('yarn dev', repo).bucket, 'verified');
  assert.equal(verifyCommand('pnpm deploy', repo).bucket, 'contradicted');
});
test('commands: node checks the file exists', () => {
  assert.equal(verifyCommand('node tools/run.js', repo).bucket, 'verified');
  assert.equal(verifyCommand('node tools/missing.js', repo).bucket, 'contradicted');
});
test('commands: npx is Verified only for a declared package, otherwise Unverifiable', () => {
  assert.equal(verifyCommand('npx vite build', repo).bucket, 'verified');
  assert.equal(verifyCommand('npx some-remote-tool', repo).bucket, 'unverifiable');
});
test('commands: a repo with no package.json is Unverifiable', () => {
  assert.equal(verifyCommand('npm run build', { pkg: null, workspaces: [], files: [], sources: {} }).bucket, 'unverifiable');
});

// envvars
test('envvars: Verified when a source file reads it', () => {
  assert.deepEqual(verifyEnvVar('API_KEY', repo).evidence, { file: 'src/index.js', detail: 'src/index.js reads API_KEY' });
});
test('envvars: Verified when .env.example lists it', () => {
  assert.equal(verifyEnvVar('FROM_EXAMPLE', repo).bucket, 'verified');
});
test('envvars: Contradicted when nothing reads it', () => {
  // every source file in the tree was read (tools/run.js too), so absence is proof
  const allRead = { ...repo, sources: { ...repo.sources, 'tools/run.js': 'run();' } };
  assert.equal(verifyEnvVar('DATABASE_URL', allRead).bucket, 'contradicted');
});
test('envvars: Unverifiable with no usable name', () => {
  assert.equal(verifyEnvVar(null, repo).bucket, 'unverifiable');
  assert.equal(verifyEnvVar('not valid!', repo).bucket, 'unverifiable');
});

// references
test('references: Verified for a file and for a directory', () => {
  assert.equal(verifyReference('./docs/guide.md', repo).bucket, 'verified');
  assert.equal(verifyReference('docs', repo).bucket, 'verified');
  assert.equal(verifyReference('docs/guide.md#intro', repo).bucket, 'verified');
});
test('references: Contradicted when the path is not in the tree', () => {
  assert.equal(verifyReference('./docs/gone.md', repo).bucket, 'contradicted');
});
test('references: external URLs and paths outside the repo are Unverifiable', () => {
  assert.equal(verifyReference('https://example.com', repo).bucket, 'unverifiable');
  assert.equal(verifyReference('../outside.md', repo).bucket, 'unverifiable');
  assert.equal(verifyReference(null, repo).bucket, 'unverifiable');
});

// coverage
test('coverage: Missing for an imported package the README never mentions', () => {
  const out = verifyCoverage('This tool is great.', repo);
  assert.deepEqual(out.map((m) => m.name), ['express']);
  assert.equal(out[0].bucket, 'missing');
});
test('coverage: nothing Missing when the README mentions it (any case)', () => {
  assert.deepEqual(verifyCoverage('Built with Express.', repo), []);
});
test('coverage: built-ins, relative imports, and scoped names', () => {
  const r = { ...repo, sources: { 'a.js': "import fs from 'fs';\nimport x from './x.js';\nimport y from '@scope/pkg/deep';\n" } };
  assert.deepEqual(verifyCoverage('nothing here', r).map((m) => m.name), ['@scope/pkg']);
});

// Workspace targeting (Block 5a: v1 false positives). --filter used to leave its value behind as the "subcommand".
const wsRepo = {
  pkg: { name: 'root', scripts: { dev: 'root-dev', build: 'pnpm -r run build' } },
  workspaces: [
    { path: 'artifacts/api', pkg: { name: '@w/api', scripts: { dev: 'tsx', test: 'node --test', 'test:fixtures': 'x' } } },
    { path: 'artifacts/web', pkg: { name: '@w/web', scripts: { build: 'vite build' } } },
    { path: 'lib/shared', pkg: { name: '@w/shared' } },
  ],
  files: [], sources: {},
};
test('commands: pnpm --filter <name> run <script> checks that workspace, not a root script named after the package', () => {
  const r = verifyCommand('pnpm --filter @w/api run dev', wsRepo);
  assert.equal(r.bucket, 'verified');
  assert.deepEqual(r.evidence, { file: 'artifacts/api/package.json', detail: 'scripts has dev' });
  assert.equal(verifyCommand('pnpm --filter @w/api run test:fixtures', wsRepo).bucket, 'verified');
});
test('commands: --filter=X, -F X, and no "run" all resolve the same way', () => {
  for (const c of ['pnpm --filter=@w/api dev', 'pnpm -F @w/api run dev', 'pnpm --filter @w/api dev', 'pnpm --filter ./artifacts/api dev', 'bun --filter @w/api run dev']) {
    assert.equal(verifyCommand(c, wsRepo).evidence.file, 'artifacts/api/package.json', c);
  }
});
test('commands: npm -w / --workspace before or after the script, and yarn workspace', () => {
  for (const c of ['npm run dev -w @w/api', 'npm -w @w/api run dev', 'npm run dev --workspace=@w/api', 'npm run dev --workspace @w/api', 'yarn workspace @w/api dev', 'yarn workspace @w/api run dev']) {
    const r = verifyCommand(c, wsRepo);
    assert.equal(r.bucket, 'verified', c);
    assert.equal(r.evidence.file, 'artifacts/api/package.json', c);
  }
});
test('commands: a resolved workspace without the script is Contradicted and names that package.json', () => {
  const r = verifyCommand('pnpm --filter @w/web run dev', wsRepo); // root has dev, @w/web does not
  assert.equal(r.bucket, 'contradicted');
  assert.deepEqual(r.evidence, { file: 'artifacts/web/package.json', detail: 'scripts has no dev' });
});
test('commands: an unresolved target is Unverifiable, never Contradicted (name, glob, range, negation, two targets)', () => {
  for (const c of ['pnpm --filter @w/ghost run dev', 'pnpm --filter "@w/*" dev', 'pnpm --filter ...@w/api dev', 'pnpm --filter @w/api... dev',
    'pnpm --filter !@w/api dev', 'pnpm --filter {./artifacts/api} dev', 'yarn workspace @w/ghost dev', 'pnpm --filter @w/api --filter @w/web dev']) {
    assert.equal(verifyCommand(c, wsRepo).bucket, 'unverifiable', c);
  }
});
test('commands: no workspaces read, or a truncated list, makes a filtered command Unverifiable', () => {
  assert.equal(verifyCommand('pnpm --filter @w/api run dev', { ...wsRepo, workspaces: [] }).bucket, 'unverifiable');
  const t = verifyCommand('pnpm --filter @w/ghost run dev', { ...wsRepo, workspacesTruncated: true });
  assert.equal(t.bucket, 'unverifiable');
  assert.match(t.evidence.detail, /not read/);
});
test('commands: directory flags are Unverifiable, and value flags never become the subcommand', () => {
  for (const c of ['npm --prefix web run dev', 'pnpm -C web run nope', 'pnpm --dir=web run nope', 'npm run nope --prefix=web']) assert.equal(verifyCommand(c, wsRepo).bucket, 'unverifiable', c);
  assert.equal(verifyCommand('npm --registry https://r.example run dev', wsRepo).bucket, 'verified');
});
test('commands: recursive runs still check every workspace, and yarn workspaces foreach is not checked', () => {
  assert.equal(verifyCommand('pnpm -r run test', wsRepo).bucket, 'verified');
  assert.equal(verifyCommand('pnpm -r run nope', wsRepo).bucket, 'contradicted');
  assert.equal(verifyCommand('yarn workspaces foreach run dev', wsRepo).bucket, 'unverifiable');
});
test('dependencies and coverage: with unread workspaces, "not declared" is Unverifiable and the wording is neutral', () => {
  const t = { ...repo, workspacesTruncated: true };
  const ctx = { text: '`left-pad`', inFence: false };
  assert.equal(verifyDependency('left-pad', repo, ctx).bucket, 'contradicted');
  assert.equal(verifyDependency('left-pad', t, ctx).bucket, 'unverifiable');
  const out = verifyCoverage('nothing', { ...t, sources: { 'a.js': "import z from 'zed';\n" } });
  assert.match(out[0].evidence.detail, /not found in the package\.json files read/);
});
