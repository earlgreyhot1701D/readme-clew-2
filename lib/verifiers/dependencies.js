// Verifier: is a README-named package declared in package.json or imported by code? Deterministic.
// repo snapshot: { pkg, workspaces: [{ path, pkg }], files: [paths], sources: { path: text } }
import { builtinModules } from 'node:module';

const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
const JS_FILE = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/;
const BUILTINS = new Set(builtinModules);

// package name from an import specifier, or null for relative paths and Node built-ins
function pkgName(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  return BUILTINS.has(name) ? null : name;
}

// Map of package name -> first source file that imports it.
export function importedPackages(sources = {}) {
  const found = new Map();
  for (const [file, text] of Object.entries(sources)) {
    if (!JS_FILE.test(file)) continue;
    for (const m of text.matchAll(SPEC)) {
      const name = pkgName(m[1]);
      if (name && !found.has(name)) found.set(name, file);
    }
  }
  return found;
}

// Map of package name -> { file, field } across the root and every workspace package.json.
export function declaredPackages(repo) {
  const found = new Map();
  const list = [{ file: 'package.json', pkg: repo.pkg }, ...(repo.workspaces ?? []).map((w) => ({ file: `${w.path}/package.json`, pkg: w.pkg }))];
  for (const { file, pkg } of list) {
    for (const field of FIELDS) {
      for (const name of Object.keys(pkg?.[field] ?? {})) if (!found.has(name)) found.set(name, { file, field });
    }
  }
  return found;
}

const INSTALL = /\b(?:(?:npm|pnpm|bun)\s+(?:i|install|add)|yarn\s+add)\b/i;

// Prose guard (fixes known limit #3). A name counts as a package only in code context: a code fence,
// backticks, or an install command. A name that appears only in prose may be Verified or Unverifiable,
// never Contradicted, because prose words ("(beta)", a product name) are not package claims.
function inCodeContext(names, ctx) {
  if (!ctx) return false;
  if (ctx.inFence) return true;
  const text = String(ctx.text ?? '').toLowerCase();
  const ticked = [...text.matchAll(/`([^`\n]+)`/g)].flatMap((m) => m[1].split(/[\s,;]+/));
  if (names.some((n) => ticked.includes(n))) return true;
  return INSTALL.test(text) && names.some((n) => text.includes(n));
}

// ctx: { text, inFence } of the README line. Without ctx the name is treated as prose (the safe default).
export function verifyDependency(name, repo, ctx) {
  if (!name) return { bucket: 'unverifiable', evidence: { file: null, detail: 'No package name found on this line' } };
  const declared = declaredPackages(repo);
  const imported = importedPackages(repo.sources);
  // "Next.js" in prose is the package "next": try the name as written, then without a trailing .js
  const names = [name, name.replace(/\.js$/, '')];
  for (const n of names) {
    if (declared.has(n)) {
      const d = declared.get(n);
      return { bucket: 'verified', evidence: { file: d.file, detail: `${d.field} has ${n}` } };
    }
    if (imported.has(n)) {
      return { bucket: 'verified', evidence: { file: imported.get(n), detail: `imported in ${imported.get(n)}, not listed in package.json` } };
    }
  }
  if (!inCodeContext(names, ctx)) {
    return { bucket: 'unverifiable', evidence: { file: null, detail: `${name} appears only in prose, so it is not checked as a package` } };
  }
  return { bucket: 'contradicted', evidence: { file: 'package.json', detail: `${name} is not in package.json and no source file imports it` } };
}
