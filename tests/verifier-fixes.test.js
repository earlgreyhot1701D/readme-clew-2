// Two verifier bugs found by auditing real reports: a percent-encoded path never matched the file it
// names, and `node <dir>` on a directory with an index file was called contradicted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyReference } from '../lib/verifiers/references.js';
import { verifyCommand } from '../lib/verifiers/commands.js';

test('references: a percent-encoded path is decoded before the file-tree check', () => {
  const repo = { files: ['docs/Guides/Getting-Started.md', 'docs/With Space.md', 'docs/Café.md'] };
  // Control: a plain path is verified, so the encoded cases below cannot pass by returning verified always.
  assert.equal(verifyReference('./docs/Guides/Getting-Started.md', repo).bucket, 'verified');
  assert.equal(verifyReference('./docs/With%20Space.md', repo).bucket, 'verified');
  assert.equal(verifyReference('./docs/Caf%C3%A9.md', repo).bucket, 'verified');
});

test('references: a path that is still wrong after decoding stays contradicted, and a malformed escape never throws', () => {
  const repo = { files: ['docs/With Space.md'] };
  const out = verifyReference('./docs/With%20Space%20Again.md', repo);
  assert.equal(out.bucket, 'contradicted');
  assert.equal(out.evidence.file, 'docs/With Space Again.md');

  // decodeURIComponent throws on a broken escape; the verifier must keep the raw path instead.
  assert.doesNotThrow(() => verifyReference('./docs/%E0%A4%A', repo));
  assert.equal(verifyReference('./docs/%E0%A4%A', repo).bucket, 'contradicted');
});

test('commands: node <dir> with an index file is verified, not contradicted', () => {
  const repo = { files: ['examples/content-negotiation/index.js'] };
  assert.equal(verifyCommand('node examples/content-negotiation', repo).bucket, 'verified');
  // Control: the file form is still verified, so the directory branch did not replace the file check.
  assert.equal(verifyCommand('node examples/content-negotiation/index.js', repo).bucket, 'verified');
});

test('commands: node . runs the root index file', () => {
  assert.equal(verifyCommand('node .', { files: ['index.js'] }).bucket, 'verified');
  assert.equal(verifyCommand('node ./', { files: ['index.js'] }).bucket, 'verified');
  // Control: a root without an index file is a real failure, so it stays contradicted.
  assert.equal(verifyCommand('node .', { files: ['lib/index.js'] }).bucket, 'contradicted');
});

test('commands: a missing node target stays contradicted, a directory without an index is unverifiable', () => {
  const repo = { files: ['examples/content-negotiation/db.js'] };
  assert.equal(verifyCommand('node does-not-exist-xyz.js', repo).bucket, 'contradicted');
  assert.equal(verifyCommand('node examples/content-negotiation', repo).bucket, 'unverifiable');
});
