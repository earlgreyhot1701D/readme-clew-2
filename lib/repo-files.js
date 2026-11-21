// Which files a scan reads, and how much of the README. No network here: this module is pure so the
// budgets and the ranking can be tested and measured without a fetch.
//
// The source budget is 60. It was 20 because the PRD fixed that number before any accuracy measurement
// existed. Measured on 20 repositories at the same ranking: 20 files report 65 Missing findings, 40 report
// 94 (+45%), 60 report 119 (+83%), and 51 of the 54 extra names sit in shipped code while 43 are declared
// runtime dependencies. The reads are parallel, so 60 costs at most a second more and about 5 MB instead
// of 1.5 MB.

export const README_MAX_BYTES = 50 * 1024;
export const MAX_SOURCES = 60;
// One file never contributes more than this, so a generated 4 MB bundle cannot dominate the read.
export const FILE_CAP_CHARS = 100_000;

const SRC = /\.(?:[cm]?js|[cm]?ts|jsx|tsx|vue|svelte)$/;
const SKIP = /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|tests?|__tests__|e2e)\/|\.d\.ts$|\.(?:test|spec)\.[^/]+$/;

export const isSourcePath = (p) => SRC.test(p) && !SKIP.test(p);

// Which source files to read when the budget is 60. Path shape first, depth second, name last:
// shipped code (src/, lib/, index.*) beats tooling and benchmarks, because a Missing finding about
// a package the README never names is only interesting when the package actually ships.
// Measured on fastify and pino: runtime findings captured at the 20-file budget went from 29%/45%
// to 93%/100% after this ranking; the budget itself was measured later, see the header.
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
  // A tree from GitHub has unique paths, but a duplicated path would spend the budget twice.
  return [...new Set(paths)].filter(isSourcePath).sort(byRank).slice(0, MAX_SOURCES);
}

export function cutReadme(text) {
  if (Buffer.byteLength(text) <= README_MAX_BYTES) return { text, truncated: false };
  const cut = Buffer.from(text).subarray(0, README_MAX_BYTES).toString('utf8').replace(/\uFFFD$/, '');
  return { text: cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0)), truncated: true };
}
