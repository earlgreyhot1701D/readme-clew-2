// Test helper: loads a fixture (README, repo snapshot, mocked Jev answers) and runs the pipeline. Offline.
import { readFileSync, existsSync } from 'node:fs';
import { runPipeline } from '../lib/pipeline.js';

const dir = (p) => new URL(`../fixtures/${p}`, import.meta.url);

export const FIXTURES = ['clean-minimal', 'npm-start-drift', 'frontend-vite', 'envvar-unread', 'missing-package',
  'marketing-claims', 'empty', 'no-claims', 'monorepo', 'injection'];

export function loadFixture(name) {
  const read = (p) => readFileSync(dir(p), 'utf8');
  const expectedPath = dir(`expected/${name}.json`);
  return {
    name,
    readme: read(`readmes/${name}.md`),
    snapshot: JSON.parse(read(`repos/${name}.json`)),
    jev: JSON.parse(read(`jev-mock/${name}.json`)),
    expected: existsSync(expectedPath) ? JSON.parse(readFileSync(expectedPath, 'utf8')) : null,
  };
}

export function runFixture(name, overrides = {}) {
  const f = loadFixture(name);
  const report = runPipeline({
    readme: f.readme,
    repo: { owner: 'fixture', name, readmePath: 'README.md' },
    snapshot: f.snapshot,
    jev: f.jev,
    ...overrides,
  });
  return { ...f, report };
}
