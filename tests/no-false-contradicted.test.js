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
test('commands: a bare yarn or pnpm word may be a binary, so a missing script is Unverifiable', () => {
  for (const cmd of ['yarn lerna bootstrap', 'pnpm tauri dev', 'yarn ganache-cli -p 9545', 'bun turbo build']) {
    assert.equal(verifyCommand(cmd, small).bucket, 'unverifiable', cmd);
  }
  // Control: through the explicit "run" the same word is a script claim, and it stays Contradicted.
  assert.equal(verifyCommand('yarn run lerna', small).bucket, 'contradicted');
  // Control: a script that exists stays Verified through the bare form.
  assert.equal(verifyCommand('yarn build', small).bucket, 'verified');
});

test('commands: an angle placeholder is Unverifiable, a trailing comment is not a placeholder', () => {
  assert.equal(verifyCommand('yarn <command>', small).bucket, 'unverifiable');
  assert.equal(verifyCommand('npm run <script>', small).bucket, 'unverifiable');
  assert.equal(verifyCommand('npm run missing', small).bucket, 'contradicted');
  assert.equal(verifyCommand('npm run missing # produces dist/<id>.js', small).bucket, 'contradicted');
  // An argument after "--" may be a pattern; it does not make the command a template.
  assert.equal(verifyCommand('npm run build -- --out <dir>', small).bucket, 'verified');
  // A flag written in a comment is not a flag: without the strip this becomes Unverifiable.
  assert.equal(verifyCommand('npm run build # --workspace packages/ghost', small).bucket, 'verified');
});

test('commands: node_modules is installed, not committed, so a path there is Unverifiable', () => {
  for (const cmd of ['node node_modules/x/scripts/init.js', 'node ./node_modules/x/init.js',
    'node /abs/node_modules/x/init.js', 'node packages/a/node_modules/x/y.js',
    'node node_modules\\x\\y.js', 'node ../node_modules/x.js', 'node node_modules']) {
    assert.equal(verifyCommand(cmd, small).bucket, 'unverifiable', cmd);
  }
  assert.equal(verifyCommand('node tools/missing.js', small).bucket, 'contradicted');
});

test('commands: a // comment after a command is not a file', () => {
  assert.equal(verifyCommand('node -v // will show v10.22.1', small).bucket, 'unverifiable');
  assert.equal(verifyCommand('node tools/run.js // start here', small).bucket, 'contradicted');
  assert.equal(verifyCommand('node src/index.js // start here', small).bucket, 'verified');
});

test('commands: a path built from a variable is Unverifiable, not a missing file', () => {
  for (const cmd of ['node "$SKILL_DIR/scripts/x.mjs"', 'node $HOME/app.js', 'node ./tools/$X/y.js', 'node %APPDATA%/x.js']) {
    assert.equal(verifyCommand(cmd, small).bucket, 'unverifiable', cmd);
  }
  assert.equal(verifyCommand('node tools/missing.js', small).bucket, 'contradicted');
  assert.equal(verifyCommand('node src/index.js', small).bucket, 'verified');
});

test('commands: a compound shell command is Unverifiable, because only one part would be checked', () => {
  for (const cmd of ['npm run build && npm run ghost', 'npm run build | tee x', 'npm run build; npm start', 'yarn build || yarn dev']) {
    assert.equal(verifyCommand(cmd, small).bucket, 'unverifiable', cmd);
  }
  // A lone "#" is a comment, so the command before it is still checked.
  assert.equal(verifyCommand('npm run build #', small).bucket, 'verified');
});

test('commands: when some workspaces were not read, a missing script is Unverifiable', () => {
  const truncated = { ...small, workspaces: [{ path: 'packages/a', pkg: { scripts: { build: 'x' } } }], workspacesTruncated: true };
  assert.equal(verifyCommand('npm run deploy', truncated).bucket, 'unverifiable');
  assert.equal(verifyCommand('npm run deploy', { ...truncated, workspacesTruncated: false }).bucket, 'contradicted');
});

test('commands: bun run on a file path runs the file, not a script', () => {
  assert.equal(verifyCommand('bun run src/index.ts', small).bucket, 'unverifiable');
  assert.equal(verifyCommand('bun run build', small).bucket, 'verified');
});

test('references: missing build-output paths are Unverifiable, other missing paths Contradicted', () => {
  for (const p of ['dist/index.js', 'build/', '.next/static', 'out/a.html', 'coverage/lcov.info', 'lib/index.js']) {
    assert.equal(verifyReference(p, small).bucket, 'unverifiable', p);
  }
  assert.equal(verifyReference('docs/guide.md', small).bucket, 'contradicted');
});
