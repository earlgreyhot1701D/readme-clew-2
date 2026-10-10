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
  assert.equal(verifyEnvVar('DATABASE_URL', repo).bucket, 'contradicted');
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
