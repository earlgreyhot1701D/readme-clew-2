// Refreshes fixtures/corpus/: fetches each repo at HEAD and rewrites the frozen input plus the golden report.
// Needs a GITHUB_TOKEN in the environment (4 API calls per repo) and network. Tests never run this.
// The audit files are NOT written here: they are verdicts on each finding and need a human look.
//   node scripts/freeze-corpus.mjs            # refresh every repo in SLUGS
//   node scripts/freeze-corpus.mjs chalk/chalk
import fs from 'node:fs';
import { fetchRepo } from '../lib/github.js';
import { runPipeline } from '../lib/pipeline.js';
import { isJsProject } from '../lib/js-repo.js';

const SLUGS = ['chalk/chalk', 'hoppscotch/hoppscotch', 'pallets/flask'];
const dir = (p) => new URL(`../fixtures/corpus/${p}`, import.meta.url);
const write = (p, value) => fs.writeFileSync(dir(p), JSON.stringify(value, null, 2) + '\n', 'utf8');

// Jev is not part of the corpus: every line the pre-filter does not decide stays undecided.
const noJev = new Proxy({}, { get: () => ({ choice: 'not_a_claim', confidence: 1 }) });

for (const slug of (process.argv.slice(2).length ? process.argv.slice(2) : SLUGS)) {
  const [owner, name] = slug.split('/');
  const fixture = `${owner}-${name}`;
  const gh = await fetchRepo({ owner, name }, { token: process.env.GITHUB_TOKEN });
  const input = {
    repo: { owner, name, readmePath: gh.readmePath },
    commit: gh.commit,
    truncated: gh.truncated === true,
    readme: gh.readme,
    snapshot: gh.snapshot,
  };
  write(`repos/${fixture}.json`, input);
  if (!isJsProject(gh.snapshot)) {
    console.log(`${fixture}: no package.json, expected report is "not a JS/TS repo"`);
    continue;
  }
  const report = runPipeline({ readme: input.readme, repo: input.repo, snapshot: input.snapshot, jev: { labels: noJev, names: noJev } });
  report.meta.readmeTruncated = input.truncated;
  write(`expected/${fixture}.json`, report);
  console.log(`${fixture} @ ${gh.commit.slice(0, 7)}: ${JSON.stringify(report.counts)}, ${report.meta.linesToJev} of ${report.meta.linesTotal} lines need Jev`);
}
