// Strict R5: drop a coverage Missing finding only when the package is a devDependency somewhere,
// absent from every runtime field, and every import site is outside shipped source.
// The path policy lives in lib/path-kind.js: tooling folders, config files and hidden directories
// are not shipped. Found live: a jsdom import inside .dumi/theme looked like shipped source.
import { isShippedSource } from './path-kind.js';

const shipped = isShippedSource;

function sitesFor(sources) {
  const map = new Map();
  for (const [file, text] of Object.entries(sources ?? {})) {
    if (!/\.(?:[cm]?js|[cm]?ts|jsx|tsx|mts|cts)$/.test(file)) continue;
    // A source entry is a string from the fetch layer, but a malformed or hostile snapshot must not
    // crash the scan: a thrown error here becomes a 500 for a repository we only read.
    if (typeof text !== 'string') continue;
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g)) {
      const spec = m[1];
      if (!/^(?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.-]+)*$/.test(spec)) continue;
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(file);
    }
  }
  return map;
}

export function strictR5Drop(snapshot, name) {
  const pkgs = [snapshot.pkg, ...(snapshot.workspaces ?? []).map((w) => w.pkg)].filter(Boolean);
  // Object.hasOwn, not a truthy lookup: a package named "constructor" or "__proto__" would otherwise
  // read Object.prototype and count as declared.
  const has = (field) => pkgs.some((p) => p[field] && Object.hasOwn(p[field], name));
  const dev = has('devDependencies');
  const runtime = has('dependencies') || has('peerDependencies') || has('optionalDependencies');
  if (!dev || runtime) return false;
  const sites = [...(sitesFor(snapshot.sources).get(name) ?? [])];
  return sites.length > 0 && sites.every((p) => !shipped(p));
}
