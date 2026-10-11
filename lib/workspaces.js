// Workspace discovery helpers (pure). No network, no YAML dependency.
// Supported patterns: "dir/*" (direct children with a package.json) and exact dirs. Everything else
// (negations, "**", mid-path globs) is ignored on purpose: when in doubt, we skip rather than guess.

// pnpm-workspace.yaml: the "packages:" list, block form or an inline [a, b] array. Returns raw strings.
export function parsePnpmWorkspace(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  let inList = false;
  for (const line of text.split(/\r?\n/)) {
    if (!inList) {
      const m = line.match(/^packages\s*:\s*(.*)$/);
      if (!m) continue;
      const rest = m[1].replace(/\s+#.*$/, '').trim();
      if (rest.startsWith('[')) {
        const items = rest.replace(/^\[|\]$/g, '').split(',').map(unquote).filter(Boolean);
        return items;
      }
      inList = true;
      continue;
    }
    if (/^\s*(#.*)?$/.test(line)) continue; // blank or comment
    const item = line.match(/^\s*-\s*(.*)$/);
    if (!item) break; // next top-level key
    const v = unquote(item[1]);
    if (v) out.push(v);
  }
  return out;
}

function unquote(s) {
  const t = s.trim();
  const q = t.match(/^(['"])(.*?)\1/);
  if (q) return q[2];
  return t.replace(/\s+#.*$/, '').trim();
}

// root package.json: "workspaces" as an array, or { packages: [...] }
export function parseRootWorkspaces(pkg) {
  const w = pkg?.workspaces;
  const list = Array.isArray(w) ? w : Array.isArray(w?.packages) ? w.packages : [];
  return list.filter((x) => typeof x === 'string');
}

// -> { kind: 'exact' | 'children', dir } or null for anything we do not support
export function normalizePattern(p) {
  if (typeof p !== 'string') return null;
  let s = p.trim().replace(/^\.\//, '').replace(/\/+$/, '');
  if (!s || s === '.' || s.startsWith('!') || s.startsWith('/') || s.includes('..') || s.includes('**')) return null;
  if (!s.includes('*')) return /[?[\]{}]/.test(s) ? null : { kind: 'exact', dir: s };
  if (/^[^*?[\]{}]+\/\*$/.test(s)) return { kind: 'children', dir: s.slice(0, -2) };
  return null;
}

// patterns + the repo's file list -> sorted workspace dirs that have a package.json
export function expandWorkspaces(patterns, paths) {
  const set = new Set(paths);
  const dirs = new Set();
  for (const raw of patterns) {
    const p = normalizePattern(raw);
    if (!p) continue;
    if (p.kind === 'exact') {
      if (set.has(`${p.dir}/package.json`)) dirs.add(p.dir);
      continue;
    }
    for (const f of paths) {
      const m = f.match(/^(.+)\/([^/]+)\/package\.json$/);
      if (m && m[1] === p.dir) dirs.add(`${m[1]}/${m[2]}`);
    }
  }
  return [...dirs].sort();
}

// A selector from --filter / --workspace / yarn workspace. Exact package name or exact path only.
// Returns the workspace { path, pkg } or null (unknown, ambiguous, or a pattern we do not resolve).
export function resolveWorkspace(selector, workspaces = []) {
  if (typeof selector !== 'string') return null;
  const s = selector.trim().replace(/^\.\//, '').replace(/\/+$/, '');
  if (!s || /[*?{}[\]!]|\.\.\./.test(s) || s.startsWith('..')) return null;
  const hits = workspaces.filter((w) => w.pkg?.name === s || w.path === s);
  return hits.length === 1 ? hits[0] : null;
}
