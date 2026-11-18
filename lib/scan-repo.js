// One scan, start to finish: GitHub -> Jev + verifiers -> Haiku -> receipt. Shared by api/scan.js (and later badge, og).
// Jev failures throw (an honest error). Haiku failures never do: notes is null and the report stays complete.
import { randomBytes } from 'node:crypto';
import { fetchRepo as githubFetchRepo, MAX_SOURCES } from './github.js';
import { scan } from './pipeline.js';
import { summarize as haikuSummarize } from './summarize.js';
import { buildReceipt } from './receipt.js';
import { createUsage } from './usage.js';
import { isJsProject, NotJsRepoError } from './js-repo.js';
import { askAll, JEV_BUDGET_MS } from './jev.js';

// deps are injectable so tests stay offline: fetchRepo, ask (Glasser), summarize (Haiku), now, runId.
export async function scanRepo({ owner, name }, deps = {}, { skipHaiku = false } = {}) {
  const { fetchRepo = githubFetchRepo, ask, summarize = haikuSummarize, now = Date.now, runId = () => `scan_${randomBytes(4).toString('hex')}` } = deps;
  const t0 = now();
  const stepsMs = {};
  const usage = createUsage();

  let t = now();
  const gh = await fetchRepo({ owner, name });
  stepsMs.github = now() - t;

  // No package.json anywhere: nothing to check against. Stop before any Jev call.
  if (!isJsProject(gh.snapshot)) throw new NotJsRepoError();

  // The real Jev call gets a deadline. The function has 60 s, and Haiku (9 s) and the reply need the last 12 s of it,
  // so a Jev retry only starts if enough of the budget is left. An injected ask (tests) is used as it is.
  const jevAsk = ask ?? ((requests) => askAll(requests, { deadlineAt: t0 + JEV_BUDGET_MS, now }));
  t = now();
  const { report, calls } = await scan({ readme: gh.readme, repo: { owner, name, readmePath: gh.readmePath }, snapshot: gh.snapshot, ask: jevAsk, truncated: gh.truncated === true, strictR5: true });
  stepsMs.jev = now() - t; // includes the rule and verifier steps, which take a few ms
  usage.addJev(calls);
  report.meta.readmeTruncated = gh.truncated === true;

  t = now();
  if (!skipHaiku) {
    // summarize() is fail-open itself; this guard keeps a scan complete even if it were ever replaced by something that throws.
    const h = await Promise.resolve().then(() => summarize(report)).catch(() => ({ notes: null, usage: { status: 'error' } }));
    report.notes = h.notes;
    usage.setHaiku(h.usage);
  }
  stepsMs.haiku = now() - t;

  report.meta.ms = now() - t0;
  report.receipt = buildReceipt({
    runId: runId(), now: new Date(now()), repo: { owner, name }, commit: gh.commit, readme: gh.readme, report, calls: usage.entries(), stepsMs,
    // A finding depends on what was read, so the receipt records that too. See engraphis's recall
    // receipts, which keep k and mode for the same reason.
    params: {
      sourceBudget: MAX_SOURCES,
      sourcesRead: Object.keys(gh.snapshot.sources ?? {}).length,
      tsconfigsRead: Object.keys(gh.snapshot.tsconfigs ?? {}).length,
      bundlerAliases: (gh.snapshot.bundlerAliases ?? []).length,
      workspacesRead: (gh.snapshot.workspaces ?? []).length,
      workspacesTruncated: gh.snapshot.workspacesTruncated === true,
      readmeBytes: Buffer.byteLength(gh.readme),
      readmeTruncated: gh.truncated === true,
    },
  });
  return { report, usage: usage.totals() };
}
