// GitHub line links, built by code from owner, repo, path, and line number. Pure.
const SAFE = /^[A-Za-z0-9_.-]+$/;

export function lineLink({ owner, name, readmePath = 'README.md', line }) {
  if (!SAFE.test(owner ?? '') || !SAFE.test(name ?? '')) throw new Error('lineLink: bad owner or repo name');
  if (!Number.isInteger(line) || line < 1) throw new Error('lineLink: bad line number');
  const path = String(readmePath).split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${owner}/${name}/blob/HEAD/${path}?plain=1#L${line}`;
}
