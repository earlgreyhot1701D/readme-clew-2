// Verifier: does code read the named environment variable? Deterministic.
// Verified if a source file reads it, or if .env.example / .env.sample lists it.
const VALID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EXAMPLE_FILES = ['.env.example', '.env.sample'];

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
  const scanned = Object.keys(sources).filter((f) => !EXAMPLE_FILES.includes(f)).length;
  return { bucket: 'contradicted', evidence: { file: null, detail: `No source file reads ${name} (${scanned} files checked)` } };
}
