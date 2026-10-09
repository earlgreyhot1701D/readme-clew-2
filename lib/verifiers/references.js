// Verifier: does a README-linked path exist in the repo file tree? Deterministic, no network.
// External URLs are never fetched here, so they are Unverifiable.
import { posix } from 'node:path';

export function verifyReference(ref, repo) {
  if (!ref) return { bucket: 'unverifiable', evidence: { file: null, detail: 'No path or link found on this line' } };
  if (/^https?:\/\//i.test(ref)) {
    return { bucket: 'unverifiable', evidence: { file: null, detail: 'External URL, not checked (no network in the verifiers)' } };
  }
  const path = posix.normalize(ref.split(/[?#]/)[0].replace(/^\//, '')).replace(/\/$/, '');
  if (path === '' || path === '.' || path.startsWith('..')) {
    return { bucket: 'unverifiable', evidence: { file: null, detail: 'Path points outside the repo or at the root' } };
  }
  const files = repo.files ?? [];
  if (files.includes(path) || files.some((f) => f.startsWith(`${path}/`))) {
    return { bucket: 'verified', evidence: { file: path, detail: 'path exists in the repo' } };
  }
  return { bucket: 'contradicted', evidence: { file: path, detail: `${path} is not in the repo file tree` } };
}
