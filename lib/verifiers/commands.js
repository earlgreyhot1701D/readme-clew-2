// Verifier: does a documented command exist? Checks scripts, files, and declared packages. Deterministic.
const PM_BUILTIN = new Set(['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'init', 'update', 'up', 'upgrade',
  'publish', 'pack', 'link', 'audit', 'outdated', 'ls', 'list', 'cache', 'config', 'login', 'logout', 'version',
  'view', 'info', 'dlx', 'create', 'exec', 'x', 'prune', 'dedupe', 'rebuild', 'help']);
const LIFECYCLE = new Set(['start', 'test', 'stop', 'restart']);

const unver = (detail) => ({ bucket: 'unverifiable', evidence: { file: null, detail } });
const norm = (p) => p.replace(/^\.\//, '').replace(/^\//, '');
const args = (tokens) => tokens.filter((t) => !t.startsWith('-'));

function scriptResult(script, repo) {
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
  const similar = Object.keys(repo.pkg?.scripts ?? {}).filter((k) => k.startsWith(script));
  const detail = similar.length ? `scripts has ${similar.join(', ')}, no ${script}` : `scripts has no ${script}`;
  return { bucket: 'contradicted', evidence: { file: 'package.json', detail } };
}

export function verifyCommand(command, repo) {
  if (!command) return unver('No command found on this line');
  const [tool, ...rest] = command.trim().split(/\s+/);
  const a = args(rest);

  if (tool === 'node') {
    if (rest.some((t) => t === '-e' || t === '-p' || t === '--eval')) return unver('Inline node code is not checked');
    if (!a[0]) return unver('No file named in the node command');
    const file = norm(a[0]);
    return (repo.files ?? []).includes(file)
      ? { bucket: 'verified', evidence: { file, detail: 'file exists' } }
      : { bucket: 'contradicted', evidence: { file, detail: `${file} is not in the repo` } };
  }
  if (tool === 'npx') {
    if (!a[0]) return unver('No package named in the npx command');
    const declared = [repo.pkg, ...(repo.workspaces ?? []).map((w) => w.pkg)].some((p) =>
      ['dependencies', 'devDependencies'].some((f) => p?.[f]?.[a[0]] !== undefined));
    return declared
      ? { bucket: 'verified', evidence: { file: 'package.json', detail: `${a[0]} is a declared dependency` } }
      : unver('npx can download any package, so it is not checked');
  }
  // npm, pnpm, yarn, bun
  const sub = a[0];
  if (!sub) return unver(`${tool} with no subcommand`);
  if (sub === 'run' || sub === 'run-script') return a[1] ? scriptResult(a[1], repo) : unver('No script named');
  if (LIFECYCLE.has(sub)) return scriptResult(sub, repo);
  if (PM_BUILTIN.has(sub)) return { bucket: 'verified', evidence: { file: null, detail: `${tool} ${sub} is a built-in command` } };
  if (tool === 'npm') return unver(`npm ${sub} is not a known npm command`);
  return scriptResult(sub, repo); // yarn dev, pnpm dev, bun dev run a script
}
