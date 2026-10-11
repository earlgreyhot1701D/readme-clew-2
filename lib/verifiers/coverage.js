// Verifier: packages the code imports that the README never mentions -> Missing. Deterministic.
// STUB: env vars read by code but not in the README, and scripts the README never mentions, are not covered yet.
import { importedPackages, declaredPackages } from './dependencies.js';

// -> array of { claimType, name, bucket: 'missing', evidence, decidedBy: 'rule', confidence: null, verifier }
export function verifyCoverage(readmeText, repo) {
  const readme = String(readmeText ?? '').toLowerCase();
  const declared = declaredPackages(repo);
  const out = [];
  for (const [name, file] of importedPackages(repo.sources)) {
    if (readme.includes(name.toLowerCase())) continue;
    // With unread workspaces we cannot say "not listed", so the wording stays neutral.
    const where = declared.has(name) ? `${declared.get(name).field} has it` : repo.workspacesTruncated ? 'not found in the package.json files read' : 'not listed in package.json';
    out.push({
      claimType: 'dependency',
      name,
      bucket: 'missing',
      evidence: { file, detail: `${file} imports ${name} (${where}); the README never mentions it` },
      decidedBy: 'rule',
      confidence: null,
      verifier: 'coverage',
    });
  }
  return out;
}
