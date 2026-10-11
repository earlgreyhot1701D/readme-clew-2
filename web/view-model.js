// Pure functions behind render.js. No DOM, no network. Every value comes from the report object (PRD 3b).
import { defaultOpen, bucketNote } from './ui-state.js';
import { jevVerdict } from './verdict.js';

export const BUCKETS = ['contradicted', 'missing', 'unverifiable', 'verified'];
export const BUCKET_LABEL = { contradicted: 'CONTRADICTED', missing: 'MISSING', unverifiable: 'UNVERIFIABLE', verified: 'VERIFIED' };
export const MOODS = ['calm', 'curious', 'worried', 'tangled'];
export const DEMO_REPO = 'https://github.com/earlgreyhot1701D/readme-clew'; // pre-filled on load
export const DEMO_SHORT = 'earlgreyhot1701D/readme-clew'; // what USE DEMO REPO types into the field

// Status strip (STYLE 6). Restates the bucket result. Never shows a confidence number.
export function statusStrip(mood, counts = {}) {
  switch (mood) {
    case 'tangled': return { mood, text: `DRIFT FOUND // ${counts.contradicted ?? 0} CONTRADICTED` };
    case 'worried': return { mood, text: `GAPS FOUND // ${counts.missing ?? 0} MISSING` };
    case 'curious': return { mood, text: 'MOSTLY UNVERIFIABLE // FEW CLAIMS COULD BE CHECKED' };
    default: return { mood: 'calm', text: 'NO DRIFT FOUND IN CHECKED CLAIMS' };
  }
}

// Fixed speech line per mood, used when notes.summary is null (PRD 5).
const FALLBACK = {
  tangled: 'Some README lines do not match the code. Start with the Contradicted rows.',
  worried: 'Nothing is contradicted, but the code does things the README never mentions.',
  curious: 'Most lines could not be checked. Read the Unverifiable rows.',
  calm: 'The claims I could check match the code.',
};
export function fallbackLine(mood) { return FALLBACK[mood] ?? FALLBACK.calm; }

export function bubbleText(report) {
  const s = report?.notes?.summary;
  return typeof s === 'string' && s.trim() ? s : fallbackLine(report?.mood);
}

// Which PNG to show (web/mascot/<file>.png). A head tilt means Jev was unsure somewhere. There is one tilt picture,
// so it stands in for calm and curious. Worried and tangled keep their own picture, because a tilted calm clew
// beside "DRIFT FOUND" would say the wrong thing. No CSS rotation: each pose is its own art.
export function clewPose(mood, tilt) {
  const m = MOODS.includes(mood) ? mood : 'calm';
  return { file: tilt === true && (m === 'calm' || m === 'curious') ? 'tilt' : m };
}

// Only GitHub https links are ever put in an href.
export function safeLink(link) {
  return typeof link === 'string' && /^https:\/\/github\.com\//.test(link) ? link : null;
}

// "file: detail". Skips a null file, and skips the file when the detail already starts with it.
export function evidenceText(ev) {
  if (!ev) return '';
  const file = typeof ev.file === 'string' ? ev.file : '';
  const detail = typeof ev.detail === 'string' ? ev.detail : '';
  if (!file) return detail;
  if (!detail || detail.startsWith(file)) return detail || file;
  return `${file}: ${detail}`;
}

// One finding row (STYLE 7). quote is passed through untouched. Missing findings have no quote, so the code name is the headline.
export function rowModel(f) {
  const isJev = f.decidedBy === 'jev';
  const verdict = jevVerdict(f); // words for rows Jev kept away from a code check
  const hasConf = isJev && typeof f.confidence === 'number' && !verdict; // the bar is only for rows that went to a code check
  const pct = hasConf ? Math.round(Math.max(0, Math.min(1, f.confidence)) * 100) : null;
  return {
    id: f.id,
    bucket: f.bucket,
    lineLabel: typeof f.line === 'number' ? `L${f.line}` : 'CODE ONLY',
    link: typeof f.line === 'number' ? safeLink(f.link) : null,
    typeLabel: String(f.claimType ?? '').toUpperCase(),
    decidedLabel: `DECIDED BY: ${isJev ? 'JEV' : 'RULE'}`,
    headline: typeof f.quote === 'string' ? f.quote : String(f.name ?? ''),
    isQuote: typeof f.quote === 'string',
    evidence: evidenceText(f.evidence),
    verdict,
    showConfidence: hasConf,
    confidence: hasConf ? f.confidence.toFixed(2) : null,
    confidencePct: pct,
    unsure: f.lowConfidence === true,
  };
}

// Sections in PRD order. Empty buckets stay, so the ledger never looks broken.
export function bucketSections(report) {
  return BUCKETS.map((b) => {
    const rows = (report.findings ?? []).filter((f) => f.bucket === b).map(rowModel);
    return { bucket: b, label: BUCKET_LABEL[b], count: rows.length, rows, empty: rows.length === 0, open: defaultOpen(b, rows.length), note: rows.length ? bucketNote(report, b) : null }; // an empty bucket says NONE FOUND once, not twice
  });
}

export function countChips(counts = {}) {
  return BUCKETS.map((b) => ({ bucket: b, label: BUCKET_LABEL[b], count: counts[b] ?? 0 }));
}

// Record strip fields (STYLE 5). Missing values show a dash, never an invented number.
export function recordFields(report) {
  const dash = (v) => (v === undefined || v === null || v === '' ? '-' : String(v));
  const r = report.repo ?? {};
  return [
    { label: 'REPO', value: r.owner && r.name ? `${r.owner}/${r.name}` : '-' },
    { label: 'COMMIT', value: dash(report.receipt?.commit) },
    { label: 'README LINES', value: dash(report.meta?.linesTotal) },
    { label: 'SENT TO JEV', value: dash(report.meta?.linesToJev) },
    { label: 'MODEL', value: dash(report.meta?.jevModel) },
    { label: 'TIME', value: formatMs(report.meta?.ms) },
  ];
}

// "1 LINE", "2 LINES", "- LINES" (unknown)
export function lines(n) {
  return `${n} ${n === 1 ? 'LINE' : 'LINES'}`;
}

export function footerText(report) {
  const total = report.meta?.linesTotal;
  const jev = report.meta?.linesToJev;
  const rules = report.receipt?.lines?.decidedByRule;
  const byJev = report.receipt?.lines?.decidedByJev ?? jev;
  if (typeof byJev !== 'number') return `DECIDED BY RULES: ${lines('-')} // DECIDED BY JEV: ${lines('-')}`;
  const r = typeof rules === 'number' ? rules : typeof total === 'number' ? total - byJev : '-';
  return `DECIDED BY RULES: ${lines(r)} // DECIDED BY JEV: ${lines(byJev)}`;
}

// ISO time -> "2026-10-10 18:22 UTC" (always UTC, so it reads the same everywhere). Anything else -> "-".
export function formatScanTime(iso) {
  const d = typeof iso === 'string' || iso instanceof Date ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '-';
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

// 0 -> "0 ms", 640 -> "640 ms", 3616 -> "3.6 s"
export function formatMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '-';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// Repo input. Accepts a GitHub URL or owner/name. Returns { ok, url, owner, name } or { ok: false }.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
export function parseRepoInput(input) {
  if (typeof input !== 'string' || input.length > 300) return { ok: false };
  const s = input.trim();
  let owner; let name;
  if (/^[^/\s:]+\/[^/\s:]+$/.test(s)) {
    [owner, name] = s.split('/');
  } else {
    let u;
    try { u = new URL(s); } catch { return { ok: false }; }
    if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.username || u.password || u.port) return { ok: false };
    [owner, name] = u.pathname.split('/').filter(Boolean);
  }
  name = (name ?? '').replace(/\.git$/, '');
  if (!owner || !name || !OWNER.test(owner) || !NAME.test(name) || name === '.' || name === '..') return { ok: false };
  return { ok: true, owner, name, url: `https://github.com/${owner}/${name}` };
}

// ?repo=owner/name -> full URL, or null for anything invalid.
export function deepLinkRepo(search) {
  let v;
  try { v = new URLSearchParams(search).get('repo'); } catch { return null; }
  const p = v ? parseRepoInput(v) : { ok: false };
  return p.ok ? p.url : null;
}

// State strips (STYLE 11).
export const STATES = {
  idle: 'ENTER A PUBLIC GITHUB REPO AND PRESS SCAN',
  badInput: 'NOT A GITHUB REPO URL // USE https://github.com/owner/repo',
  notFound: 'REPO NOT FOUND OR NOT PUBLIC',
  rateLimited: 'TOO MANY SCANS // TRY AGAIN IN A MINUTE',
  notJs: 'NOT A JS/TS REPO // THIS TOOL CHECKS package.json PROJECTS',
  failed: 'SCAN FAILED // NOTHING WAS STORED // TRY AGAIN',
};
export function loadingText(owner, name) { return `SCANNING ${owner}/${name} ...`; }

export function errorState(httpStatus, code) {
  if (httpStatus === 404 || code === 'github_not_found' || code === 'github_no_readme') return STATES.notFound;
  if (code === 'not_js_repo') return STATES.notJs;
  if (httpStatus === 429 || code === 'rate_limited') return STATES.rateLimited;
  if (httpStatus === 400 && (code === 'bad_url' || code === 'missing_repo')) return STATES.badInput;
  return STATES.failed;
}
