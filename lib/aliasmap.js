// Which specifiers are local to the repo: workspace package names and tsconfig "paths" aliases.
// A specifier that resolves to a file inside the tree is never something a README has to declare.
// Found the hard way: a naive JSONC stripper eats "./src/*" (it contains "/*"), and joining
// paths with "/" leaves "./" segments that never match a real file.
const norm = (p) => p.split('/').filter((s) => s && s !== '.').join('/');

// JSONC that survives strings containing comment markers.
export function stripJsonc(text) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += text[i + 1] ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; i += 1; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i += 1; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1; i += 2; continue; }
    out += c; i += 1;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const EXT = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.mjs', '.cjs'];

// Bundler configs carry aliases that tsconfig often does not. Only the nearest two files are read.
const CONFIG_NAMES = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'webpack.config.js', 'vue.config.js'];
export function configCandidates(srcPaths = [], allPaths = []) {
  const dirs = new Set(['']);
  for (const p of srcPaths) {
    let d = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    for (let i = 0; i < 3 && d; i += 1) {
      dirs.add(d);
      d = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '';
    }
  }
  const wanted = new Set();
  for (const d of dirs) for (const n of CONFIG_NAMES) wanted.add(d ? `${d}/${n}` : n);
  return [...wanted].filter((p) => allPaths.includes(p)).slice(0, 2);
}

// "alias: { '@app': path.resolve(__dirname, 'src') }" and the three shapes seen in the wild:
// resolve('src'), a template with import.meta.dirname, and a plain relative string.
export function bundlerRules(text, configPath = '') {
  const dir = configPath.includes('/') ? configPath.slice(0, configPath.lastIndexOf('/')) : '';
  const rules = [];
  for (const open of [...String(text).matchAll(/alias\s*[:=]\s*\{/g)].map((m) => m.index + m[0].length - 1)) {
    let depth = 0; let end = open;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    for (const line of text.slice(open + 1, end).split('\n')) {
      const m = line.match(/^\s*['"]?([@~#][\w./-]*)['"]?\s*:\s*(.+?),?\s*$/);
      if (!m) continue;
      // Inner quoted paths first: a template like `${path.resolve(import.meta.dirname, 'src')}/`
      // contains 'src' inside the backtick, and a quote-mixing regex would cut it wrong.
      const inner = [...m[2].matchAll(/'([^']+)'/g), ...m[2].matchAll(/"([^"]+)"/g)]
        .map((x) => x[1]).filter((s) => s && !s.startsWith('node:'));
      const tpl = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]).filter((s) => s && !s.startsWith('node:'));
      const target = (inner.length ? inner : tpl).pop();
      if (target) rules.push({ prefix: m[1], target: norm(`${dir}/${target.replace(/^\.?\//, '').replace(/\/$/, '')}`), dir });
    }
  }
  return rules;
}

// tsconfigs: { 'path/to/tsconfig.json': text }, files: Set of repo paths.
export function buildAliasMap(tsconfigs = {}, workspaces = [], files = new Set(), bundler = []) {
  const names = new Set(workspaces.map((w) => w.pkg?.name).filter(Boolean));
  const rules = [...bundler];
  for (const [path, text] of Object.entries(tsconfigs)) {
    let parsed;
    try { parsed = JSON.parse(stripJsonc(String(text))); } catch { continue; }
    const co = parsed?.compilerOptions ?? {};
    if (!co.paths) continue;
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const base = (co.baseUrl ?? '.').replace(/^\.\//, '');
    for (const [pattern, targets] of Object.entries(co.paths)) {
      const target = Array.isArray(targets) ? targets[0] : targets;
      if (typeof target !== 'string') continue;
      rules.push({ prefix: pattern.replace(/\*$/, ''), target: norm(`${dir}/${base}/${target.replace(/\*$/, '')}`), dir });
    }
  }
  // Nearest tsconfig first: a repo can define "~/*" differently in ten packages, so rules from a
  // deeper tsconfig beat the root one, and the root is only a fallback.
  rules.sort((a, b) => (b.dir.length - a.dir.length) || (b.prefix.length - a.prefix.length));
  const applies = (rule, importer) => rule.dir === '' || importer.startsWith(`${rule.dir}/`);

  const resolve = (spec, importer = '') => {
    const base = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    if (names.has(base)) return `workspace:${base}`;
    for (const rule of rules) {
      if (!applies(rule, importer)) continue;
      if (!spec.startsWith(rule.prefix)) continue;
      const candidate = norm(`${rule.target}/${spec.slice(rule.prefix.length)}`);
      const hits = [candidate, ...EXT.map((e) => candidate + e), ...EXT.map((e) => `${candidate}/index${e}`)];
      const hit = hits.find((h) => files.has(h));
      if (hit) return hit;
    }
    return null;
  };

  return { resolve, rules, names };
}
