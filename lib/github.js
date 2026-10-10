// Fetches what a scan needs from a PUBLIC GitHub repo (PRD 3, 7.2): README (<=50 KB), commit, file tree,
// root and workspace package.json, .env.example, and at most 20 source files. 4 API calls plus raw reads at the pinned commit.
// Every fetch has a timeout and a try/catch. Private repos are refused (N1) even if the token could read them.
const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
export const README_MAX_BYTES = 50 * 1024;
export const MAX_SOURCES = 20;
const MAX_WORKSPACES = 10;
const FILE_CAP_CHARS = 100_000;
const TIMEOUT_MS = 8000;
const SRC = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/;
const SKIP = /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|tests?|__tests__|e2e)\/|\.d\.ts$|\.(?:test|spec)\.[^/]+$/;

export class GithubError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'GithubError';
    this.code = code;
    this.status = status;
  }
}

async function request(url, { fetchImpl, headers, as }) {
  const abort = new AbortController(); // a ref'd timer, see lib/jev.js
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(url, { headers, signal: abort.signal });
  } catch (e) {
    throw new GithubError(e?.name === 'AbortError' ? 'timeout' : 'unavailable', e?.name === 'AbortError' ? 'GitHub did not answer in time' : 'Could not reach GitHub');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) throw new GithubError('not_found', 'Repo not found, or it is not public', 404);
  if (res.status === 429 || (res.status === 403 && res.headers?.get?.('x-ratelimit-remaining') === '0')) {
    throw new GithubError('rate_limited', 'GitHub rate limit reached, try again later', res.status);
  }
  if (!res.ok) throw new GithubError(res.status >= 500 ? 'unavailable' : 'forbidden', `GitHub returned HTTP ${res.status}`, res.status);
  try { return as === 'text' ? await res.text() : await res.json(); } catch { throw new GithubError('unavailable', 'GitHub sent an unreadable response'); }
}

export function pickSources(paths) {
  return paths.filter((p) => SRC.test(p) && !SKIP.test(p))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    .slice(0, MAX_SOURCES);
}

export function cutReadme(text) {
  if (Buffer.byteLength(text) <= README_MAX_BYTES) return { text, truncated: false };
  const cut = Buffer.from(text).subarray(0, README_MAX_BYTES).toString('utf8').replace(/\uFFFD$/, '');
  return { text: cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0)), truncated: true };
}

// -> { readme, readmePath, truncated, commit, snapshot: { pkg, workspaces, files, sources } }
export async function fetchRepo({ owner, name }, { fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN } = {}) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'readme-clew-2', ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const j = (path) => request(`${API}/repos/${owner}/${name}${path}`, { fetchImpl, headers });

  const meta = await j('');
  if (meta.private === true || meta.visibility === 'private') throw new GithubError('not_found', 'Repo not found, or it is not public', 404);
  const commitInfo = await j('/commits/HEAD');
  const commit = String(commitInfo.sha ?? '');
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new GithubError('unavailable', 'GitHub sent an unexpected commit');
  const [readmeInfo, tree] = await Promise.all([
    j(`/readme?ref=${commit}`).catch((e) => { throw e.code === 'not_found' ? new GithubError('no_readme', 'This repo has no README', 404) : e; }),
    j(`/git/trees/${commit}?recursive=1`),
  ]);
  const paths = (tree.tree ?? []).filter((x) => x.type === 'blob').map((x) => x.path);
  const raw = (path) => request(`${RAW}/${owner}/${name}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`, { fetchImpl, headers: { 'user-agent': 'readme-clew-2' }, as: 'text' });
  const soft = (path) => raw(path).then((t) => t.slice(0, FILE_CAP_CHARS), () => null); // a missing optional file is not an error

  const readmePath = String(readmeInfo.path ?? 'README.md');
  const workspacePaths = paths.filter((p) => /^(?:packages|apps|libs|services)\/[^/]+\/package\.json$/.test(p)).slice(0, MAX_WORKSPACES);
  const envPaths = ['.env.example', '.env.sample'].filter((p) => paths.includes(p));
  const srcPaths = pickSources(paths);
  const [readmeRaw, pkgText, wsTexts, envTexts, srcTexts] = await Promise.all([
    raw(readmePath),
    paths.includes('package.json') ? soft('package.json') : null,
    Promise.all(workspacePaths.map(soft)),
    Promise.all(envPaths.map(soft)),
    Promise.all(srcPaths.map(soft)),
  ]);
  const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
  const sources = {};
  srcPaths.forEach((p, i) => { if (srcTexts[i] != null) sources[p] = srcTexts[i]; });
  envPaths.forEach((p, i) => { if (envTexts[i] != null) sources[p] = envTexts[i]; });
  const { text, truncated } = cutReadme(readmeRaw);
  return {
    readme: text, readmePath, truncated, commit,
    snapshot: {
      pkg: parse(pkgText),
      workspaces: workspacePaths.map((p, i) => ({ path: p.replace(/\/package\.json$/, ''), pkg: parse(wsTexts[i]) })).filter((w) => w.pkg),
      files: paths, sources,
    },
  };
}
