// Alias map: workspace names and tsconfig "paths". The two traps this exists to survive are
// "./src/*" inside a JSONC string and two "./" segments in a row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAliasMap, stripJsonc, bundlerRules, configCandidates } from '../lib/aliasmap.js';

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

// Bundler-only aliases: vite/webpack resolve.alias is often the only map in the repo. Three shapes
// were seen in the wild: resolve('src'), a template with import.meta.dirname, and a plain relative.
test('bundlerRules: the three real config shapes, and which configs are worth reading', () => {
  const plain = bundlerRules("resolve: { alias: { '@app': path.resolve(__dirname, 'src') } }", 'vite.config.ts');
  assert.deepEqual(plain.map((r) => [r.prefix, r.target]), [['@app', 'src']]);

  const bare = bundlerRules("resolve: { alias: { '@': resolve('src') } }", 'vue.config.js');
  assert.deepEqual(bare.map((r) => [r.prefix, r.target]), [['@', 'src']]);

  const template = bundlerRules("resolve: { alias: { '~/': `${path.resolve(import.meta.dirname, 'src')}/` } }", 'vite.config.ts');
  assert.deepEqual(template.map((r) => [r.prefix, r.target]), [['~/', 'src']]);

  // nearest configs only: root and one package, never a deep unrelated one
  const files = ['vite.config.ts', 'packages/a/vite.config.ts', 'packages/z/deep/vite.config.ts'];
  assert.deepEqual(configCandidates(['src/x.ts'], files), ['vite.config.ts']);
  assert.deepEqual(configCandidates(['packages/a/src/x.ts'], files), ['vite.config.ts', 'packages/a/vite.config.ts']);
});

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
