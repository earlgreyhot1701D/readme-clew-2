import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCommand } from '../lib/verifiers/commands.js';
import { verifyEnvVar } from '../lib/verifiers/envvars.js';
import { verifyReference } from '../lib/verifiers/references.js';

const small = {
  pkg: { name: 'x', scripts: { build: 'tsc' } },
  workspaces: [],
  files: ['package.json', 'src/index.js'],
  sources: { 'src/index.js': 'console.log(1);' },
};
// 25 source files in the tree, only the first 20 were read (the cap). The var lives in file 24.
const manyFiles = Array.from({ length: 25 }, (_, i) => `src/f${String(i).padStart(2, '0')}.js`);
const capped = {
  ...small,
  files: ['package.json', ...manyFiles],
  sources: Object.fromEntries(manyFiles.slice(0, 20).map((f) => [f, 'export {};'])),
};

test('envvars: a var read only in a file past the 20-file cap is Unverifiable', () => {
  const r = verifyEnvVar('SECRET_TOKEN', capped);
  assert.equal(r.bucket, 'unverifiable');
  assert.match(r.evidence.detail, /Not found in the 20 source files read/);
});
test('envvars: PORT, NODE_ENV, CI, HOST are always Unverifiable', () => {
  for (const n of ['PORT', 'NODE_ENV', 'CI', 'HOST']) assert.equal(verifyEnvVar(n, small).bucket, 'unverifiable', n);
});
test('envvars: an unread config file (prisma, yml, Dockerfile) means can\'t tell', () => {
  for (const f of ['prisma/schema.prisma', 'docker-compose.yml', 'Dockerfile', 'fly.toml', 'config/app.json']) {
    const r = verifyEnvVar('DATABASE_URL', { ...small, files: [...small.files, f] });
    assert.equal(r.bucket, 'unverifiable', f);
  }
});
test('envvars: a real missing var in a small repo is still Contradicted', () => {
  assert.equal(verifyEnvVar('DATABASE_URL', small).bucket, 'contradicted');
  const withLock = { ...small, files: [...small.files, 'package-lock.json', 'tsconfig.json'] };
  assert.equal(verifyEnvVar('DATABASE_URL', withLock).bucket, 'contradicted');
});

test('commands: node dist/server.js, not committed, is Unverifiable', () => {
  const r = verifyCommand('node dist/server.js', small);
  assert.equal(r.bucket, 'unverifiable');
  assert.equal(r.evidence.detail, 'Build output, created by the build, not committed');
});
test('commands: node lib/x.js is Unverifiable only when package.json has a build script', () => {
  assert.equal(verifyCommand('node lib/x.js', small).bucket, 'unverifiable');
  assert.equal(verifyCommand('node lib/x.js', { ...small, pkg: { scripts: {} } }).bucket, 'contradicted');
});
test('commands: a missing node file outside build output is still Contradicted', () => {
  assert.equal(verifyCommand('node tools/missing.js', small).bucket, 'contradicted');
});
test('references: missing build-output paths are Unverifiable, other missing paths Contradicted', () => {
  for (const p of ['dist/index.js', 'build/', '.next/static', 'out/a.html', 'coverage/lcov.info', 'lib/index.js']) {
    assert.equal(verifyReference(p, small).bucket, 'unverifiable', p);
  }
  assert.equal(verifyReference('docs/guide.md', small).bucket, 'contradicted');
});
