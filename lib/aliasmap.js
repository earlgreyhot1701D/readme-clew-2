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

// tsconfigs: { 'path/to/tsconfig.json': text }, files: Set of repo paths.
export function buildAliasMap(tsconfigs = {}, workspaces = [], files = new Set()) {
  const names = new Set(workspaces.map((w) => w.pkg?.name).filter(Boolean));
  const rules = [];
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
