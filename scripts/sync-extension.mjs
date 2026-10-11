// Copies the modules the page and the extension popup share from web/ into extension/ (PRD: popup and page share render code).
// web/ is the source of truth and the only place these files are edited. The copies are byte for byte, and a test fails if one differs.
// There is no build step: this is a plain file copy. Run: node scripts/sync-extension.mjs   (add --check to only compare)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Everything the popup imports from the page code, plus the files those import. The test checks this list is closed.
export const SHARED_JS = ['dom.js', 'view-model.js', 'ui-state.js', 'verdict.js', 'scan-state.js', 'scan-client.js', 'site.js',
  'render-strips.js', 'render-sections.js', 'disclosure.js', 'export.js', 'download.js'];
export const SHARED_CSS = ['tokens.css', 'layout.css', 'findings.css', 'chrome.css'];
export const MASCOTS = ['calm', 'curious', 'worried', 'tangled', 'tilt'].map((m) => `${m}.png`);

export const NOTE = 'These files are copies of the files with the same names in ../web/ (and ../web/mascot/ for the pictures).\n'
  + 'They are made by: node scripts/sync-extension.mjs\n'
  + 'Do not edit them here. Edit the file in web/ and run the script again. A test fails if a copy differs from its source.\n';

// -> [{ from, to }] as paths relative to the repo root
export function plan() {
  return [
    ...[...SHARED_JS, ...SHARED_CSS].map((f) => ({ from: `web/${f}`, to: `extension/shared/${f}` })),
    ...MASCOTS.map((f) => ({ from: `web/mascot/${f}`, to: `extension/mascot/${f}` })),
  ];
}

// -> the copies that are missing or differ from their source
export function drift() {
  const bad = [];
  for (const { from, to } of plan()) {
    const dst = join(ROOT, to);
    if (!existsSync(dst) || !readFileSync(join(ROOT, from)).equals(readFileSync(dst))) bad.push(to);
  }
  const noteAt = join(ROOT, 'extension/shared/README.txt');
  if (!existsSync(noteAt) || readFileSync(noteAt, 'utf8') !== NOTE) bad.push('extension/shared/README.txt');
  return bad;
}

export function sync() {
  for (const { from, to } of plan()) {
    mkdirSync(dirname(join(ROOT, to)), { recursive: true });
    copyFileSync(join(ROOT, from), join(ROOT, to));
  }
  writeFileSync(join(ROOT, 'extension/shared/README.txt'), NOTE);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--check')) {
    const bad = drift();
    console.log(bad.length ? `out of date:\n${bad.join('\n')}` : 'extension copies match web/');
    process.exit(bad.length ? 1 : 0);
  }
  sync();
  console.log(`copied ${plan().length} files into extension/`);
}
