// Verifier: packages the code imports that the README never mentions -> Missing. Deterministic.
// STUB: env vars read by code but not in the README, and scripts the README never mentions, are not covered yet.
import { importSites, declaredPackages, mentionsWord } from './dependencies.js';
import { buildAliasMap } from '../aliasmap.js';
import { isNonSourceImportSite, isTypeTest } from '../path-kind.js';

// Files that show how to use the project, not what it depends on. Their imports prove nothing about
// the package. The rule lives in lib/path-kind.js so coverage and r5 cannot drift apart.

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
  const aliases = buildAliasMap(repo.tsconfigs ?? {}, repo.workspaces ?? [], new Set(repo.files ?? []), repo.bundlerAliases ?? []);
  const out = [];
  const sources = Object.fromEntries(Object.entries(repo.sources ?? {}).filter(([file]) => !isNonSourceImportSite(file) && !isTypeTest(file) && !inUnreadPackage(file, repo)));
  // A bare specifier like 'scripts/browser' loses its subpath when reduced to a package name.
  // If an undeclared name is also a directory in the tree, treat it as a local alias, not a package.
  const isLocalDir = (name) => (repo.files ?? []).some((p) => p === name || p.startsWith(`${name}/`) || p.includes(`/${name}/`));
  for (const [name, { file, spec }] of importSites(sources)) {
    if (mentionsWord(readme, name)) continue;
    // The specifier as written first: an alias can map a subpath ("@shared/ipc/schemas/x") while the
    // package name alone maps to nothing. The bare name is the fallback for aliases that map a root.
    if (aliases.resolve(spec, file) || aliases.resolve(name, file)) continue;
    if (!declared.has(name) && isLocalDir(name)) continue;
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
