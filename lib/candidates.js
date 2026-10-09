// Regex candidate finder per line (PRD 3). Pure. Finds names; never decides what is true.
// candidates(text, { inFence }) -> { commands, packages, envVars, paths, urls } (each a de-duplicated array)
const CMD = /^(?:npm|pnpm|yarn|npx|node|bun)\s+\S/;
const URL_RE = /https?:\/\/[^\s)>\]`"']+/g;
const PROC_ENV = /process\.env\.([A-Za-z_]\w*)/g;
const BARE_ENV = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const TICKED = /`([^`\n]+)`/g;
const LINK_TARGET = /\]\(([^)\s]+)\)/g;
const PKG_NAME = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;
// "built with Express and better-sqlite3", "We use React", "powered by Vite"
const CUE = /\b(?:built with|built on|made with|powered by|based on|runs on|uses?|using)\s+([A-Za-z0-9@/._-]+(?:(?:,\s*(?:and\s+)?|\s+and\s+)[A-Za-z0-9@/._-]+)*)/gi;
const PAREN = /\(([A-Za-z][\w.-]*)\)/g;
const STOP = new Set(['the', 'a', 'an', 'this', 'that', 'it', 'our', 'your', 'node', 'nodejs', 'js', 'javascript', 'typescript',
  'npm', 'npx', 'yarn', 'pnpm', 'bun', 'git', 'true', 'false', 'null', 'json', 'html', 'css', 'and', 'or', 'to', 'for', 'of', 'in']);

const uniq = (a) => [...new Set(a)];

function clean(name) {
  return name.toLowerCase().replace(/[.,;:!?]+$/, '');
}

function pathLike(tok) {
  if (/\s/.test(tok) || tok.startsWith('@') || /^https?:/i.test(tok) || tok.startsWith('#') || tok.startsWith('mailto:')) return false;
  if (/^process\./.test(tok) || CMD.test(tok)) return false;
  return tok.includes('/') || /\.[A-Za-z0-9]{1,5}$/.test(tok);
}

export function candidates(text, { inFence = false } = {}) {
  const urls = uniq((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, '')));
  const noUrls = text.replace(URL_RE, ' ');
  const ticked = [...noUrls.matchAll(TICKED)].map((m) => m[1].trim());

  const commands = ticked.filter((t) => CMD.test(t));
  if (inFence && CMD.test(text.trim().replace(/^\$\s+/, ''))) commands.push(text.trim().replace(/^\$\s+/, ''));

  const envVars = [...noUrls.matchAll(PROC_ENV)].map((m) => m[1]);
  envVars.push(...(noUrls.replace(PROC_ENV, ' ').match(BARE_ENV) ?? []));

  const targets = [...noUrls.matchAll(LINK_TARGET)].map((m) => m[1].split(/[?#]/)[0]).filter(Boolean);
  const paths = [...targets, ...ticked].filter((t) => pathLike(t) && !/^[A-Z][A-Z0-9_]+$/.test(t));

  const packages = ticked
    .filter((t) => !/^[A-Z][A-Z0-9_]+$/.test(t) && !pathLike(t))
    .map(clean)
    .filter((t) => PKG_NAME.test(t));
  for (const m of noUrls.matchAll(CUE)) {
    packages.push(...m[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map((p) => clean(p.trim())));
  }
  for (const m of noUrls.matchAll(PAREN)) packages.push(clean(m[1]));

  return {
    commands: uniq(commands),
    packages: uniq(packages.filter((p) => PKG_NAME.test(p) && !STOP.has(p))),
    envVars: uniq(envVars),
    paths: uniq(paths),
    urls,
  };
}

// The candidate list that matches a claim type, in the order Jev would choose from.
export function namesFor(cands, claimType) {
  if (claimType === 'dependency') return cands.packages;
  if (claimType === 'command') return cands.commands;
  if (claimType === 'env_var') return cands.envVars;
  if (claimType === 'file_or_url') return [...cands.paths, ...cands.urls];
  return [];
}
