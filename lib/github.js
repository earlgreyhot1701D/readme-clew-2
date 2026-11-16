// Fetches what a scan needs from a PUBLIC GitHub repo (PRD 3, 7.2): README (<=50 KB), commit, file tree,
// root and workspace package.json, .env.example, and at most 20 source files. 4 API calls plus raw reads at the pinned commit.
// Every fetch has a timeout and a try/catch. Private repos are refused (N1) even if the token could read them.
import { parsePnpmWorkspace, parseRootWorkspaces, expandWorkspaces } from './workspaces.js';
const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
export const README_MAX_BYTES = 50 * 1024;
export const MAX_SOURCES = 20;
// 30, not 10: Replit-style repos have artifacts/*, lib/*, and lib/integrations/*, which passes 10. Reads are raw and parallel.
const MAX_WORKSPACES = 30;
const FALLBACK_WS = /^(?:packages|apps|libs|services)\/[^/]+\/package\.json$/;
const FILE_CAP_CHARS = 100_000;
const TIMEOUT_MS = 8000;
const SRC = /\.(?:[cm]?js|[cm]?ts|jsx|tsx|vue|svelte)$/;
const SKIP = /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|tests?|__tests__|e2e)\/|\.d\.ts$|\.(?:test|spec)\.[^/]+$/;

export class GithubError extends Error {
  constructor(code, message, status, retryAfter = null) {
    super(message);
    this.name = 'GithubError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// GitHub sends two different 403s. Primary: x-ratelimit-remaining is 0, wait until
// x-ratelimit-reset. Secondary: an error message, and usually retry-after; without it
// the docs say wait at least a minute. A permanent 403 (access denied) has neither.
// https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
function headerSeconds(headers, name) {
  const raw = headers?.get?.(name);
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.ceil(asNumber);
  // RFC 9110 allows an HTTP-date here; GitHub sends seconds, a proxy may not.
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    const wait = Math.ceil((when - Date.now()) / 1000);
    return wait > 0 ? wait : null;
  }
  return null;
}

function secondsUntilReset(headers) {
  const reset = Number(headers?.get?.('x-ratelimit-reset'));
  if (!Number.isFinite(reset) || reset <= 0) return null;
  const wait = Math.ceil(reset - Date.now() / 1000);
  return wait > 0 ? wait : null;
}

async function saysSecondaryLimit(res) {
  try {
    const body = await res.clone().json();
    return /secondary rate limit|abuse detection/i.test(String(body?.message ?? ''));
  } catch {
    return false;
  }
}

async function request(url, { fetchImpl, headers, as }) {
  // Read this request's token state before awaiting: a sibling call in the same Promise.all
  // may delete headers.authorization while this one is in flight, and its own 401 still needs the retry.
  const sentAuthorization = Boolean(headers?.authorization);
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
  if (res.status === 401 && sentAuthorization) {
    delete headers.authorization; // expired or bad token: public repos work without it
    return request(url, { fetchImpl, headers, as });
  }
  if (res.status === 404) throw new GithubError('not_found', 'Repo not found, or it is not public', 404);
  if (res.status === 429 || res.status === 403) {
    const remaining = res.headers?.get?.('x-ratelimit-remaining');
    const retryAfter = headerSeconds(res.headers, 'retry-after');
    const primary = remaining === '0';
    const secondary = res.status === 403 && !primary && !retryAfter && (await saysSecondaryLimit(res));
    if (res.status === 429 || primary || retryAfter || secondary) {
      const wait = retryAfter ?? (primary ? secondsUntilReset(res.headers) : 60) ?? 60;
      throw new GithubError('rate_limited', 'GitHub rate limit reached, try again later', res.status, wait);
    }
  }
  if (!res.ok) throw new GithubError(res.status >= 500 ? 'unavailable' : 'forbidden', `GitHub returned HTTP ${res.status}`, res.status);
  try { return as === 'text' ? await res.text() : await res.json(); } catch { throw new GithubError('unavailable', 'GitHub sent an unreadable response'); }
}

export const isSourcePath = (p) => SRC.test(p) && !SKIP.test(p);

// Which source files to read when the budget is 20. Path shape first, depth second, name last:
// shipped code (src/, lib/, index.*) beats tooling and benchmarks, because a Missing finding about
// a package the README never names is only interesting when the package actually ships.
// Measured on fastify and pino: runtime findings captured at the 20-file budget went from 29%/45%
// to 93%/100%.
const SOURCE_CLASS = [
  [/^(?:src|lib)\//, 0],
  [/^(?:index|main)\./, 0],
  [/^bin\//, 4],
  [/^(?:build|dist|out)\//, 6],
  [/(^|\/)(?:[^/]*\.config\.[cm]?[jt]s|gulpfile\.[^/]+)$/, 7],
  [/(^|\/)(?:benchmarks?|benches|bench|examples?|demos?|docs|scripts?|tools?)\//, 8],
];

const sourceClass = (p) => SOURCE_CLASS.find(([rx]) => rx.test(p))?.[1] ?? 3;

// SFC slots were tried and refuted by measurement: on hoppscotch (409 components) reserving 5 slots
// gave 18 findings / 8 runtime, against 17 / 10 without the quota, because five JS files were lost.
// Components therefore compete for the normal budget, and the .vue path stays available when a repo
// has few enough files for one to be picked.
const byRank = (a, b) => sourceClass(a) - sourceClass(b)
  || a.split('/').length - b.split('/').length
  || a.localeCompare(b);

export function pickSources(paths) {
  return paths.filter(isSourcePath).sort(byRank).slice(0, MAX_SOURCES);
}

export function cutReadme(text) {
  if (Buffer.byteLength(text) <= README_MAX_BYTES) return { text, truncated: false };
  const cut = Buffer.from(text).subarray(0, README_MAX_BYTES).toString('utf8').replace(/\uFFFD$/, '');
  return { text: cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0)), truncated: true };
}

// -> { readme, readmePath, truncated, commit, snapshot: { pkg, workspaces, workspacesTruncated, files, sources } }
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
  const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
  // Workspaces come from pnpm-workspace.yaml and the root package.json. The old folder regex is the fallback.
  const [pkgText, yamlText] = await Promise.all([
    paths.includes('package.json') ? soft('package.json') : null,
    paths.includes('pnpm-workspace.yaml') ? soft('pnpm-workspace.yaml') : null,
  ]);
  let wsDirs = expandWorkspaces([...parsePnpmWorkspace(yamlText), ...parseRootWorkspaces(parse(pkgText))], paths);
  if (!wsDirs.length) wsDirs = paths.filter((p) => FALLBACK_WS.test(p)).map((p) => p.replace(/\/package\.json$/, ''));
  const workspacesTruncated = wsDirs.length > MAX_WORKSPACES;
  const workspacePaths = wsDirs.slice(0, MAX_WORKSPACES).map((d) => `${d}/package.json`);
  const envPaths = ['.env.example', '.env.sample'].filter((p) => paths.includes(p));
  const srcPaths = pickSources(paths);
  // A tsconfig one folder above the code carries the "@app/*" aliases. Read a few, nearest first:
  // without them an aliased specifier looks like an npm package.
  const tsDirs = [...new Set(srcPaths.map((p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')))];
  const tsconfigPaths = [...new Set(['tsconfig.json', ...tsDirs.map((d) => (d ? `${d}/tsconfig.json` : 'tsconfig.json'))])]
    .filter((p) => paths.includes(p)).slice(0, 5);
  const [readmeRaw, wsTexts, envTexts, srcTexts, tsTexts] = await Promise.all([
    raw(readmePath),
    Promise.all(workspacePaths.map(soft)),
    Promise.all(envPaths.map(soft)),
    Promise.all(srcPaths.map(soft)),
    Promise.all(tsconfigPaths.map(soft)),
  ]);
  const sources = {};
  srcPaths.forEach((p, i) => { if (srcTexts[i] != null) sources[p] = srcTexts[i]; });
  envPaths.forEach((p, i) => { if (envTexts[i] != null) sources[p] = envTexts[i]; });
  const tsconfigs = {};
  tsconfigPaths.forEach((p, i) => { if (tsTexts[i] != null) tsconfigs[p] = tsTexts[i]; });
  // A repo can keep a one-line pointer instead of a README: zod's README.md is the text
  // "packages/zod/README.md". Following it once is honest; judging the pointer is not.
  const pointer = readmeRaw.trim().match(/^([\w./-]+\.md)$/i);
  const followed = pointer && pointer[1] !== readmePath && paths.includes(pointer[1]) ? pointer[1] : null;
  const readmeText = followed ? await raw(followed) : readmeRaw;
  const { text, truncated } = cutReadme(readmeText);
  return {
    readme: text, readmePath: followed ?? readmePath, truncated, commit,
    snapshot: {
      pkg: parse(pkgText),
      workspaces: workspacePaths.map((p, i) => ({ path: p.replace(/\/package\.json$/, ''), pkg: parse(wsTexts[i]) })).filter((w) => w.pkg),
      workspacesTruncated, // true when some workspace package.json files were not read
      files: paths, sources, tsconfigs,
    },
  };
}
