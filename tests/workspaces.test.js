import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePnpmWorkspace, parseRootWorkspaces, normalizePattern, expandWorkspaces, resolveWorkspace } from '../lib/workspaces.js';

test('parsePnpmWorkspace: quoted and plain items, comments, CRLF, stops at the next key, keeps negations for later skipping', () => {
  const yaml = ["# top comment", "packages:", "  - 'apps/*'  # trailing comment", '  - "libs/*"', "  # a comment line", "", "  - tools", "  - '!apps/old'", "catalog:", "  - not-a-package"].join('\r\n');
  assert.deepEqual(parsePnpmWorkspace(yaml), ['apps/*', 'libs/*', 'tools', '!apps/old']);
});
test('parsePnpmWorkspace: inline array, no packages key, and junk input', () => {
  assert.deepEqual(parsePnpmWorkspace("packages: ['a/*', \"b\"]\n"), ['a/*', 'b']);
  assert.deepEqual(parsePnpmWorkspace('catalog:\n  react: 19\n'), []);
  assert.deepEqual(parsePnpmWorkspace(null), []);
});
test("parsePnpmWorkspace: v1's real pnpm-workspace.yaml gives its four workspace patterns", () => {
  const real = readFileSync(new URL('../fixtures/v1-pnpm-workspace.yaml', import.meta.url), 'utf8');
  assert.deepEqual(parsePnpmWorkspace(real), ['artifacts/*', 'lib/*', 'lib/integrations/*', 'scripts']);
});
test('parseRootWorkspaces: array, {packages}, and junk', () => {
  assert.deepEqual(parseRootWorkspaces({ workspaces: ['a/*', 'b'] }), ['a/*', 'b']);
  assert.deepEqual(parseRootWorkspaces({ workspaces: { packages: ['a/*'] } }), ['a/*']);
  assert.deepEqual(parseRootWorkspaces({ workspaces: 'a/*' }), []);
  assert.deepEqual(parseRootWorkspaces(null), []);
});
test('normalizePattern: only dir/* and exact dirs; negations, **, and mid-path globs are ignored', () => {
  assert.deepEqual(normalizePattern('lib/*'), { kind: 'children', dir: 'lib' });
  assert.deepEqual(normalizePattern('./lib/integrations/*'), { kind: 'children', dir: 'lib/integrations' });
  assert.deepEqual(normalizePattern('scripts/'), { kind: 'exact', dir: 'scripts' });
  for (const bad of ['!lib/x', 'lib/**', '**/pkg', 'a/*/b', '*', '.', '../x', '/abs', 'lib/{a,b}', null]) assert.equal(normalizePattern(bad), null, String(bad));
});
test('expandWorkspaces: dir/* is direct children only, so lib/* does not pull in lib/integrations/x', () => {
  const paths = ['lib/db/package.json', 'lib/integrations/x/package.json', 'lib/integrations/y/package.json', 'lib/readme.md', 'scripts/package.json', 'artifacts/web/package.json'];
  assert.deepEqual(expandWorkspaces(['lib/*'], paths), ['lib/db']);
  assert.deepEqual(expandWorkspaces(['lib/*', 'lib/integrations/*', 'scripts', 'artifacts/*'], paths),
    ['artifacts/web', 'lib/db', 'lib/integrations/x', 'lib/integrations/y', 'scripts']);
});
test('expandWorkspaces: ignored patterns add nothing; an exact dir needs a package.json', () => {
  const paths = ['a/x/package.json', 'b/package.json'];
  assert.deepEqual(expandWorkspaces(['a/**', '!a/x', 'c', 'b/'], paths), ['b']);
});
test('resolveWorkspace: exact name or exact path; globs, ranges, negations, unknown, and duplicates give null', () => {
  const ws = [{ path: 'artifacts/api', pkg: { name: '@w/api' } }, { path: 'lib/a', pkg: { name: 'dup' } }, { path: 'lib/b', pkg: { name: 'dup' } }];
  assert.equal(resolveWorkspace('@w/api', ws), ws[0]);
  assert.equal(resolveWorkspace('./artifacts/api/', ws), ws[0]);
  for (const bad of ['@w/*', '...@w/api', '@w/api...', '!@w/api', '{./artifacts/api}', '@w/ghost', 'dup', '', null]) assert.equal(resolveWorkspace(bad, ws), null, String(bad));
});
