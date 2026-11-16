// Verifier: packages the code imports that the README never mentions -> Missing. Deterministic.
// STUB: env vars read by code but not in the README, and scripts the README never mentions, are not covered yet.
import { importedPackages, declaredPackages, mentionsWord } from './dependencies.js';
import { buildAliasMap } from '../aliasmap.js';

// Files that show how to use the project, not what it depends on. Their imports prove nothing about the package.
// benchmarks/ belongs here too: pino's fastbench, bunyan, bole, winston and debug are benched against, never shipped.
const NON_SOURCE_DIR = /(^|\/)(?:examples?|demos?|tests?|__tests__|fixtures|docs|benchmarks?|benches|bench|@types)\//i;
// A .test-d.ts file is a type test: it checks the published types, it does not ship.
const TYPE_TEST = /\.test-d\.[cm]?[jt]s$/i;

// True when the file sits under a folder with its own package.json that we did not read (an unread workspace or sub-project).
function inUnreadPackage(file, repo) {
  const read = new Set(['', ...(repo.workspaces ?? []).map((w) => w.path)]);
  const dirs = (repo.files ?? []).filter((p) => /(^|\/)package\.json$/.test(p)).map((p) => p.replace(/\/?package\.json$/, ''));
  let best = null;
  for (const d of dirs) if ((d === '' || file.startsWith(d + '/')) && (best === null || d.length > best.length)) best = d;
  return best !== null && !read.has(best);
}

// -> array of { claimType, name, bucket: 'missing', evidence, decidedBy: 'rule', confidence: null, verifier }
export function verifyCoverage(readmeText, repo) {
  const readme = String(readmeText ?? '').toLowerCase();
  const declared = declaredPackages(repo);
  // Local names: workspace packages and tsconfig path aliases. "@composables/i18n" is a file in this
  // repo, not something to declare, and a README must not be blamed for not naming it.
  const aliases = buildAliasMap(repo.tsconfigs ?? {}, repo.workspaces ?? [], new Set(repo.files ?? []));
  const out = [];
  const sources = Object.fromEntries(Object.entries(repo.sources ?? {}).filter(([file]) => !NON_SOURCE_DIR.test(file) && !TYPE_TEST.test(file) && !inUnreadPackage(file, repo)));
  for (const [name, file] of importedPackages(sources)) {
    if (mentionsWord(readme, name)) continue;
    if (aliases.resolve(name, file)) continue;
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
