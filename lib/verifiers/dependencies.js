// Verifier: is a README-named package declared in package.json or imported by code? Deterministic.
// repo snapshot: { pkg, workspaces: [{ path, pkg }], files: [paths], sources: { path: text } }
import { builtinModules } from 'node:module';

const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g;
// A specifier never contains a newline, a brace or a space. Without this, a match on the word "from"
// inside a string ("'to' : 'from'") swallows the following code as a package name.
const SPEC_NAME = /^(?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.-]+)*$/;
// npm's own naming rules: a name cannot start with "." or "_", and cannot end with a dot.
// "_private" and "pkg." are therefore not packages, whatever they look like.
const INVALID_NAME = /^[._]|\.$/;
const JS_FILE = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/;
// Single-file components: only the <script> block is code. A template can contain markup that looks
// like an import, and a <style> block never does.
const SFC_FILE = /\.(?:vue|svelte)$/i;
const SCRIPT_BLOCK = /<script[^>]*>([\s\S]*?)<\/script>/gi;
const BUILTINS = new Set(builtinModules);

export function scriptOf(text) {
  const blocks = [...String(text).matchAll(SCRIPT_BLOCK)].map((m) => m[1]);
  return blocks.length ? blocks.join('\n') : '';
}

// package name from an import specifier, or null for relative paths, Node built-ins and subpath imports
// ("#name" is resolved by the package's own "imports" map, so it is never something to install)
function pkgName(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:') || spec.startsWith('#')) return null;
  if (!SPEC_NAME.test(spec)) return null;
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (INVALID_NAME.test(name)) return null;
  return BUILTINS.has(name) ? null : name;
}

// A line comment marker inside a string is not a comment, and an import written inside a comment is not
// code. Found on sindresorhus/got: three of its four Missing findings were examples in doc blocks.
// The mask marks the characters that sit inside a string or template, so an import written as text in
// a template literal ("const ASSERTIONS = `import x from 'y'`") is not read as code either. Found on
// trpc/trpc: three findings came from a generated-test template.
// A regex literal is not a string: "/'/g" must not open a string, or the rest of the file is swallowed
// and a real import after it disappears. The classic heuristic decides from the previous token.
const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', 'return', 'typeof', 'case', 'delete', 'void', 'instanceof', 'in', 'of', 'new', '=>']);

function regexAllowed(out) {
  const trimmed = out.replace(/\s+$/, '');
  const m = trimmed.match(/([A-Za-z_$][\w$]*|[^\s\w$])$/);
  return !m || REGEX_AFTER.has(m[1]);
}

function stripComments(text) {
  let out = '';
  let mask = '';
  let i = 0;
  let mode = null;
  while (i < text.length) {
    const c = text[i];
    const d = text[i + 1];
    if (mode === null) {
      if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      if (c === '/' && regexAllowed(out)) {
        // regex literal: copy through the closing slash so its quotes never start a string
        out += c; mask += '0'; i += 1;
        while (i < text.length) {
          const ch = text[i];
          if (ch === '\\') { out += ch + (text[i + 1] ?? ''); mask += '00'; i += 2; continue; }
          out += ch; mask += ch === '\n' ? '0' : '0'; i += 1;
          if (ch === '/' ) break;
          if (ch === '\n') break;
        }
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { mode = c; out += c; mask += '1'; i += 1; continue; }
      out += c; mask += '0'; i += 1; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = null; out += c; mask += '0'; } i += 1; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = null; i += 2; } else i += 1; continue; }
    if (c === '\\') { out += c + (d ?? ''); mask += '11'; i += 2; continue; }
    if (c === mode) { mode = null; out += c; mask += '1'; i += 1; continue; }
    out += c; mask += '1'; i += 1;
  }
  return { out, mask };
}

// Map of package name -> first source file that imports it.
export function importedPackages(sources = {}) {
  return new Map([...importSites(sources)].map(([name, site]) => [name, site.file]));
}

// Map of package name -> { file, spec } for its first import site. The specifier as written matters:
// "@shared/ipc/schemas/x" resolves through a tsconfig alias while the package name alone does not.
export function importSites(sources = {}) {
  const found = new Map();
  for (const [file, text] of Object.entries(sources)) {
    const sfc = SFC_FILE.test(file);
    if (!sfc && !JS_FILE.test(file)) continue;
    const code = sfc ? scriptOf(text) : String(text);
    const { out, mask } = stripComments(code);
    for (const m of out.matchAll(SPEC)) {
      if (mask[m.index] === '1') continue;
      const name = pkgName(m[1]);
      if (name && !found.has(name)) found.set(name, { file, spec: m[1] });
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

// A package name counts as mentioned only when it stands as its own token. A token runs on
// letters, digits, "_" and "-" (npm's own name characters), so the name must not be glued to
// more of those on either side, and must not sit after "@" or "/" (a scope or a path).
// A "." or "/" after the name does NOT extend it, so "We use ava." is a mention and
// "lodash/fp" counts as lodash. This keeps a name inside "javascript" or "lodash-es" from matching.
// A "." BEFORE the name means property access, not a package: express's README says `res.send(...)`
// and koa's says `ctx.request.accepts(...)`, which used to hide the real `send` and `accepts`
// findings. Both were found by asking which findings a README-only suppression was hiding.
export function mentionsWord(text, name) {
  if (!name) return false;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_@/.-])${esc}(?![A-Za-z0-9_-])`, 'i').test(text);
}

// Prose guard (fixes known limit #3). A name counts as a package only in code context: a code fence,
// backticks, or an install command. A name that appears only in prose may be Verified or Unverifiable,
// never Contradicted, because prose words ("(beta)", a product name) are not package claims.
function inCodeContext(names, ctx) {
  if (!ctx) return false;
  if (ctx.inFence) return true;
  const text = String(ctx.text ?? '').toLowerCase();
  const ticked = [...text.matchAll(/`([^`\n]+)`/g)].flatMap((m) => m[1].split(/[\s,;]+/));
  if (names.some((n) => ticked.includes(n))) return true;
  return INSTALL.test(text) && names.some((n) => mentionsWord(text, n));
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
  // Some workspace package.json files were not read, so "not declared" is not proven.
  if (repo.workspacesTruncated) {
    return { bucket: 'unverifiable', evidence: { file: null, detail: `${name} is not in the package.json files read, but some workspaces were not read` } };
  }
  return { bucket: 'contradicted', evidence: { file: 'package.json', detail: `${name} is not in package.json and no source file imports it` } };
}
