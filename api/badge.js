// STUB (PRD M19, not built). /api/badge?repo=owner/name would return an SVG with the four counts.
// Why it is a stub: we store nothing, so there is no saved result to draw from. Every badge view would have to run a
// fresh scan, and every scan bills Shara's Glasser and Anthropic keys. A README badge is viewed by every visitor and by
// GitHub's image proxy, so the cost would be set by strangers, not by us.
// What it would need before it is built: a stored last result per repo (which PRD section 2 says NEVER: no database),
// or a hard cap on scans per repo per day that does not need storage. Neither is decided.
// If it is ever built: validate ?repo= on the server, return a grey "not scanned" SVG on any failure (never a broken
// image), cache at the CDN, and log request id, path, status, timing, and counts only.
export default function handler(req, res) {
  res.statusCode = 404;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('Not built yet.');
}
