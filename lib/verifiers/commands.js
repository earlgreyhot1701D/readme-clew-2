// Verifier: does a documented command exist? Checks scripts, files, and declared packages. Deterministic.
// Workspace targeting (--filter, --workspace, yarn workspace) checks that package's scripts only.
// When the target cannot be resolved, the answer is Unverifiable, never Contradicted.
import { resolveWorkspace } from '../workspaces.js';
import { isBuildOutput, BUILD_OUTPUT_RESULT } from './build-output.js';

const PM_BUILTIN = new Set(['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'init', 'update', 'up', 'upgrade',
  'publish', 'pack', 'link', 'audit', 'outdated', 'ls', 'list', 'cache', 'config', 'login', 'logout', 'version',
  'view', 'info', 'dlx', 'create', 'exec', 'x', 'prune', 'dedupe', 'rebuild', 'help']);
const LIFECYCLE = new Set(['start', 'test', 'stop', 'restart']);
// Flags that take a value. Their value is never the subcommand.
const WS_FLAGS = { pnpm: ['--filter', '-F', '--filter-prod'], bun: ['--filter', '-F'], npm: ['--workspace', '-w'] };
const DIR_FLAGS = new Set(['--prefix', '-C', '--dir', '--cwd']); // run somewhere else: not checked
const VALUE_FLAGS = new Set(['--registry', '--cache', '--userconfig', '--loglevel', '--reporter']);

const unver = (detail) => ({ bucket: 'unverifiable', evidence: { file: null, detail } });
const norm = (p) => p.replace(/^\.\//, '').replace(/^\//, '');
const args = (tokens) => tokens.filter((t) => !t.startsWith('-'));

// Root scripts, then workspace scripts. With a scope (a resolved workspace) only that package counts.
function scriptResult(script, repo, scope) {
  if (scope) {
    const file = `${scope.path}/package.json`;
    if (scope.pkg?.scripts?.[script] !== undefined) return { bucket: 'verified', evidence: { file, detail: `scripts has ${script}` } };
    const similar = Object.keys(scope.pkg?.scripts ?? {}).filter((k) => k.startsWith(script));
    return { bucket: 'contradicted', evidence: { file, detail: similar.length ? `scripts has ${similar.join(', ')}, no ${script}` : `scripts has no ${script}` } };
  }
  if (!repo.pkg && !(repo.workspaces ?? []).length) return unver('The repo has no package.json');
  if (repo.pkg?.scripts?.[script] !== undefined) {
    return { bucket: 'verified', evidence: { file: 'package.json', detail: `scripts has ${script}` } };
  }
  for (const w of repo.workspaces ?? []) {
    if (w.pkg?.scripts?.[script] !== undefined) {
      return { bucket: 'verified', evidence: { file: `${w.path}/package.json`, detail: `scripts has ${script}` } };
    }
  }
  if (script === 'start' && (repo.files ?? []).includes('server.js')) {
    return { bucket: 'verified', evidence: { file: 'server.js', detail: 'no start script, npm runs server.js by default' } };
  }
  // Some workspace manifests were not read, so a script may exist in one of them.
  if (repo.workspacesTruncated) return unver('Some workspaces were not read, so a script in one of them cannot be ruled out');
  const similar = Object.keys(repo.pkg?.scripts ?? {}).filter((k) => k.startsWith(script));
  const detail = similar.length ? `scripts has ${similar.join(', ')}, no ${script}` : `scripts has no ${script}`;
  return { bucket: 'contradicted', evidence: { file: 'package.json', detail } };
}

// Splits package-manager tokens into positional words, workspace selectors, and a "runs elsewhere" flag.
function parsePm(tool, tokens) {
  const wsFlags = new Set(WS_FLAGS[tool] ?? []);
  const out = { words: [], selectors: [], elsewhere: false };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') break; // the rest are script arguments
    if (!t.startsWith('-')) { out.words.push(t); continue; }
    const eq = t.indexOf('=');
    const name = eq === -1 ? t : t.slice(0, eq);
    const inline = eq === -1 ? null : t.slice(eq + 1);
    if (wsFlags.has(name)) out.selectors.push(inline ?? tokens[++i] ?? '');
    else if (DIR_FLAGS.has(name)) { out.elsewhere = true; if (inline === null) i++; }
    else if (VALUE_FLAGS.has(name) && inline === null) i++;
  }
  if (tool === 'yarn' && out.words[0] === 'workspace') { // yarn workspace <name> [run] <script>
    out.selectors.push(out.words[1] ?? '');
    out.words = out.words.slice(2);
  }
  return out;
}

export function verifyCommand(command, repo) {
  if (!command) return unver('No command found on this line');
  const [tool, ...restRaw] = command.trim().split(/\s+/);
  // A trailing shell comment is not part of the command, and its text can hold placeholders or examples.
  const cut = restRaw.findIndex((t) => t.startsWith('#'));
  const rest = cut === -1 ? restRaw : restRaw.slice(0, cut);
  // "<command>" or "<script>" is a template, not something a reader can run. Only the command and its
  // first argument are checked: a later argument can legitimately be a pattern in angle brackets.
  if (rest.slice(0, 2).some((t) => /<[^>]+>/.test(t))) return unver('A placeholder in angle brackets is not a command');

  if (tool === 'node') {
    const a = args(rest);
    if (rest.some((t) => t === '-e' || t === '-p' || t === '--eval')) return unver('Inline node code is not checked');
    if (!a[0]) return unver('No file named in the node command');
    const file = norm(a[0]);
    if ((repo.files ?? []).includes(file)) return { bucket: 'verified', evidence: { file, detail: 'file exists' } };
    // node runs a directory when it has an index file; "." and "./" mean the repo root
    const root = file === '.' || file === '';
    const index = ['index.js', 'index.mjs', 'index.cjs']
      .map((n) => (root ? n : `${file}/${n}`))
      .find((p) => (repo.files ?? []).includes(p));
    if (index) return { bucket: 'verified', evidence: { file: index, detail: 'directory with an index file; node runs it' } };
    if (!root && (repo.files ?? []).some((p) => p.startsWith(`${file}/`))) return unver('Directory exists but lists no index file');
    if (isBuildOutput(file, repo)) return BUILD_OUTPUT_RESULT;
    return { bucket: 'contradicted', evidence: { file, detail: `${file} is not in the repo` } };
  }
  if (tool === 'npx') {
    const a = args(rest);
    if (!a[0]) return unver('No package named in the npx command');
    const declared = [repo.pkg, ...(repo.workspaces ?? []).map((w) => w.pkg)].some((p) =>
      ['dependencies', 'devDependencies'].some((f) => p?.[f]?.[a[0]] !== undefined));
    return declared
      ? { bucket: 'verified', evidence: { file: 'package.json', detail: `${a[0]} is a declared dependency` } }
      : unver('npx can download any package, so it is not checked');
  }
  // npm, pnpm, yarn, bun
  const { words, selectors, elsewhere } = parsePm(tool, rest);
  if (elsewhere) return unver('The command runs in another directory, so it is not checked');
  let scope = null;
  if (selectors.length) {
    if (selectors.length > 1) return unver('More than one workspace is targeted, so it is not checked');
    scope = resolveWorkspace(selectors[0], repo.workspaces ?? []);
    if (!scope) {
      const why = repo.workspacesTruncated ? 'some workspaces were not read' : 'it is not an exact package name or path';
      return unver(`Workspace "${selectors[0]}" could not be matched (${why})`);
    }
  }
  const sub = words[0];
  if (!sub) return unver(`${tool} with no subcommand`);
  if (sub === 'workspaces') return unver(`${tool} workspaces commands are not checked`);
  // "bun run src/index.ts" runs a file, not a package script.
  if (tool === 'bun' && (sub === 'run' || sub === 'run-script') && words[1]
    && (/[/\\]/.test(words[1]) || /\.(?:[cm]?[jt]sx?)$/.test(words[1]))) {
    return unver('bun runs a file here, not a script');
  }
  if (sub === 'run' || sub === 'run-script') return words[1] ? scriptResult(words[1], repo, scope) : unver('No script named');
  if (LIFECYCLE.has(sub)) return scriptResult(sub, repo, scope);
  if (PM_BUILTIN.has(sub)) return { bucket: 'verified', evidence: { file: null, detail: `${tool} ${sub} is a built-in command` } };
  if (tool === 'npm') return unver(`npm ${sub} is not a known npm command`);
  // yarn, pnpm and bun run a script when one has that name and a binary from node_modules otherwise.
  // Without the explicit "run" a missing script is therefore not evidence of a wrong README.
  const res = scriptResult(sub, repo, scope);
  if (res.bucket === 'contradicted') return unver(`"${tool} ${sub}" may be a binary from node_modules, so a missing script is not a contradiction`);
  return res;
}
