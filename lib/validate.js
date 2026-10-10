// Input validation for /api/scan (PRD 7.2 item 2). Pure. Never trusts the front end.
export const MAX_BODY_BYTES = 4096;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export class ValidationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.status = status;
  }
}

// "https://github.com/owner/repo" (optional .git, trailing slash, /tree/... path) -> { owner, name }
export function parseRepoUrl(input) {
  if (typeof input !== 'string' || input.length > 300) throw new ValidationError('bad_url', 'Enter a GitHub repo URL like https://github.com/owner/repo');
  let u;
  try { u = new URL(input.trim()); } catch { throw new ValidationError('bad_url', 'Enter a GitHub repo URL like https://github.com/owner/repo'); }
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.username || u.password || u.port) {
    throw new ValidationError('bad_url', 'Only https://github.com/owner/repo URLs are supported');
  }
  const [owner, rawName] = u.pathname.split('/').filter(Boolean);
  const name = (rawName ?? '').replace(/\.git$/, '');
  if (!owner || !name || !OWNER.test(owner) || !REPO.test(name) || name === '.' || name === '..') {
    throw new ValidationError('bad_url', 'The URL must name a repo: https://github.com/owner/repo');
  }
  return { owner, name };
}

// rawBody: the request body as text. Returns { owner, name }.
export function validateBody(rawBody) {
  if (typeof rawBody !== 'string' || rawBody.length === 0) throw new ValidationError('missing_body', 'Send a JSON body with a "repo" field');
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) throw new ValidationError('body_too_large', 'Request body is too large', 413);
  let body;
  try { body = JSON.parse(rawBody); } catch { throw new ValidationError('bad_json', 'The body must be valid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.repo !== 'string') {
    throw new ValidationError('missing_repo', 'The body must be {"repo": "https://github.com/owner/repo"}');
  }
  return parseRepoUrl(body.repo);
}
