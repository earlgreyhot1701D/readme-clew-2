// Verifier: does code read the named environment variable? Deterministic.
// Verified if a source file reads it, or if .env.example / .env.sample lists it.
const VALID = /^[A-Za-z_][A-Za-z0-9_]*$/;
import { isSourcePath } from '../github.js';
const EXAMPLE_FILES = ['.env.example', '.env.sample'];
// Platforms set these themselves, so code not reading them proves nothing.
const PLATFORM_SET = new Set(['PORT', 'NODE_ENV', 'CI', 'HOST']);
// Files that can define or document an env var but are not fetched. Lockfiles and tsconfig never do.
const CONFIG_FILE = /(?:\.(?:prisma|ya?ml|toml|json|env)|(?:^|\/)Dockerfile[^/]*|(?:^|\/)\.env[^/]*)$/i;
const NOT_CONFIG = /(?:^|\/)(?:package\.json|package-lock\.json|tsconfig[^/]*\.json|[^/]*lock\.ya?ml|composer\.json)$/i;

function readers(name) {
  return [
    new RegExp(`process\\.env\\.${name}\\b`),
    new RegExp(`process\\.env\\[\\s*['"]${name}['"]\\s*\\]`),
    new RegExp(`import\\.meta\\.env\\.${name}\\b`),
    new RegExp(`Deno\\.env\\.get\\(\\s*['"]${name}['"]`),
    new RegExp(`\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*process\\.env`),
  ];
}

export function verifyEnvVar(name, repo) {
  if (!name || !VALID.test(name)) {
    return { bucket: 'unverifiable', evidence: { file: null, detail: 'No environment variable name found on this line' } };
  }
  const sources = repo.sources ?? {};
  const patterns = readers(name);
  for (const [file, text] of Object.entries(sources)) {
    if (EXAMPLE_FILES.includes(file)) continue;
    if (patterns.some((p) => p.test(text))) {
      return { bucket: 'verified', evidence: { file, detail: `${file} reads ${name}` } };
    }
  }
  for (const file of EXAMPLE_FILES) {
    if (new RegExp(`^\\s*${name}\\s*=`, 'm').test(sources[file] ?? '')) {
      return { bucket: 'verified', evidence: { file, detail: `${file} lists ${name}` } };
    }
  }
  const files = repo.files ?? [];
  const read = Object.keys(sources).filter((f) => !EXAMPLE_FILES.includes(f)).length;
  const unverifiable = { bucket: 'unverifiable', evidence: { file: null, detail: `Not found in the ${read} source files read` } };
  if (PLATFORM_SET.has(name)) return unverifiable;
  if (files.some((f) => isSourcePath(f) && !(f in sources))) return unverifiable; // cap hit or a fetch failed
  // Non-JS files (schemas, CI, Docker, config) are listed but their text is not fetched: can't tell.
  if (files.some((f) => CONFIG_FILE.test(f) && !NOT_CONFIG.test(f) && !(f in sources))) return unverifiable;
  if (repo.pkg && JSON.stringify(repo.pkg).includes(name)) return unverifiable; // e.g. a script sets it
  return { bucket: 'contradicted', evidence: { file: null, detail: `No source file reads ${name} (${read} files checked)` } };
}
