// Paths a build creates and a repo does not commit. A missing one is Unverifiable, never Contradicted.
// lib/ only counts when package.json has a build script (otherwise lib/ is ordinary source).
const ALWAYS = /^(?:dist|build|out|\.next|coverage)(?:\/|$)/;

export function isBuildOutput(path, repo) {
  const p = String(path ?? '').replace(/^\.\//, '').replace(/^\//, '');
  if (ALWAYS.test(p)) return true;
  return p.startsWith('lib/') && repo?.pkg?.scripts?.build !== undefined;
}

export const BUILD_OUTPUT_RESULT = {
  bucket: 'unverifiable',
  evidence: { file: null, detail: 'Build output, created by the build, not committed' },
};
