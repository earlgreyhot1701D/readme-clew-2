// Dev-only fixture mode. Renders fixtures/expected/<name>.json with no API call.
// Active only on localhost (scripts/dev-server.mjs serves /fixtures/expected/). Production has no /fixtures route.
// The allowlist is fixed: the name from the URL is never used to build a path unless it is in this list.
export const FIXTURES = Object.freeze([
  'clean-minimal', 'empty', 'envvar-unread', 'frontend-vite', 'injection', 'jev-confident-mislabel',
  'marketing-claims', 'missing-package', 'monorepo', 'name-pick', 'no-claims', 'npm-start-drift', 'pnpm-monorepo',
]);

export function isDevHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function fixtureName(search, hostname) {
  if (!isDevHost(hostname)) return null;
  let v;
  try { v = new URLSearchParams(search).get('fixture'); } catch { return null; }
  return typeof v === 'string' && FIXTURES.includes(v) ? v : null;
}

export async function loadFixture(name) {
  if (!FIXTURES.includes(name)) throw new Error('Unknown fixture');
  const res = await fetch(`/fixtures/expected/${name}.json`);
  if (!res.ok) throw new Error('Fixture not found');
  return res.json();
}
