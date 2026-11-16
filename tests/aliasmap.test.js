// Alias map: workspace names and tsconfig "paths". The two traps this exists to survive are
// "./src/*" inside a JSONC string and two "./" segments in a row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAliasMap, stripJsonc } from '../lib/aliasmap.js';

const files = new Set([
  'packages/ui/src/index.ts',
  'packages/ui/src/composables/i18n.ts',
  'packages/ui/src/helpers/find.ts',
  'packages/desktop/src/main.ts',
]);

test('stripJsonc: a comment marker inside a string is not a comment, trailing commas survive', () => {
  const text = `{
    // a real comment
    "compilerOptions": {
      "paths": { "@composables/*": ["./src/composables/*"], },
    },
  }`;
  const parsed = JSON.parse(stripJsonc(text));
  assert.deepEqual(parsed.compilerOptions.paths, { '@composables/*': ['./src/composables/*'] });
});

test('alias map: tsconfig paths resolve to real files, and unknown names stay unknown', () => {
  const tsconfigs = {
    'packages/ui/tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@composables/*': ['./src/composables/*'], '@helpers/*': ['./src/helpers/*'] } },
    }),
  };
  const map = buildAliasMap(tsconfigs, [], files);
  assert.equal(map.resolve('@composables/i18n', 'packages/ui/src/App.vue'), 'packages/ui/src/composables/i18n.ts');
  assert.equal(map.resolve('@helpers/find', 'packages/ui/src/App.vue'), 'packages/ui/src/helpers/find.ts');
  assert.equal(map.resolve('@composables/missing', 'packages/ui/src/App.vue'), null);
  assert.equal(map.resolve('@vueuse/core', 'packages/ui/src/App.vue'), null);
  assert.equal(map.resolve('lodash-es', 'packages/ui/src/App.vue'), null);
});

test('alias map: a workspace package name is local even with subpaths', () => {
  const map = buildAliasMap({}, [{ path: 'packages/ui', pkg: { name: '@app/ui' } }], files);
  assert.equal(map.resolve('@app/ui', 'x.ts'), 'workspace:@app/ui');
  assert.equal(map.resolve('@app/ui/themes.css', 'x.ts'), 'workspace:@app/ui');
  assert.equal(map.resolve('@vueuse/core', 'x.ts'), null);
});

// Two packages in one repo can define the same prefix differently; the closer tsconfig must win.
test('alias map: the nearest tsconfig wins, not the first one read', () => {
  const tsconfigs = {
    'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~/*': ['./shared/*'] } } }),
    'packages/ui/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '~/*': ['./src/*'] } } }),
  };
  const tree = new Set(['shared/a.ts', 'packages/ui/src/a.ts']);
  const map = buildAliasMap(tsconfigs, [], tree);
  assert.equal(map.resolve('~/a', 'packages/ui/src/App.vue'), 'packages/ui/src/a.ts');
  assert.equal(map.resolve('~/a', 'app/main.ts'), 'shared/a.ts');
});
