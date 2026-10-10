# LEDGER

Decisions, findings, and wrong turns. Counts only, never README text, prompts, or model output.

## Block 0: Spikes

Status: CLOSED Oct 8, 2026. S1, S2, S3, S5 done. S4 and S6 folded, not run (time).

### Jev call log

All charges are Glasser's `charge_usd`, not estimates. Model is `jev-1.13.0` on every row. Dates are Oct 8, 2026.

| # | Spike | Purpose | Calls | Round trip (ms) | Input tokens | Output tokens | Charge (USD) |
|---|---|---|---|---|---|---|---|
| 1 | S1 | One Choice question on one README-style line | 1 | 495 | 422 | 68 | 0.00002 |
| 2 | S2 | Claim-type label, one call per line, 10 lines | 10 | 480, 837, 327, 276, 261, 247, 243, 286, 290, 204 | 4,218 | 693 | 0.000201 |
| 3 | S3 | Whole README in one call (283 questions) | 1 | 491 | 0 | 0 | 0.00 (rejected, HTTP 400, no run) |
| 4 | S3 | Whole README, batches of 100 (3 calls), run A | 3 | 636, 402, 311 | 51,441 | 19,395 | 0.002378 |
| 5 | S3 | Same as #4, run B (blank vs non-blank confidence split added) | 3 | 658, 385, 361 | 51,441 | 19,397 | 0.002378 |
| | | **Total** | 18 | | | | **0.004977** |

Free calls: 1 `inspect` of `typesafe` `/v1/systemone`, 0.00.

Prepaid balance impact: about half a cent of the $11.

### S1: Can a script call Jev through Glasser and get a typed answer?

**PASS.**

Evidence:
- Request: `POST https://api.glasser.ai/v1/runs`, header `Authorization: Bearer <key>`, required header `Idempotency-Key` (a UUID), body `{ provider: "typesafe", endpoint: "/v1/systemone", input: { model, state, questions } }`. The TypeSafe response is in the run's `output` field (`output.answers.<id>`, `output.usage`).
- Docs used: https://glasser.ai/docs/api-reference/runs/create.md, https://glasser.ai/docs/how-it-works.md, https://glasser.ai/docs/cli.md (gives the base URL `https://api.glasser.ai`), https://docs.typesafe.ai/api.md, https://docs.typesafe.ai/primitives/choice.md.
- Free `inspect`: version 1, sync, 45,000 ms timeout, `per_token` $0.0462 per 1M input tokens, cap $0.002957 per run, every failure clause charges $0.00. Input requires `state` and `questions`; `model` is optional.
- Result: HTTP 200, COMPLETED, model `jev-1.13.0`, one Choice answer with `choice`, `probabilities` over all six options, and `confidence`. Round trip 495 ms.

Findings:
- Use `charge_usd` for cost. Money values are exact decimal strings.
- Failures are free on every clause.

Cost: $0.00002.

### S2: Does Jev label README lines well enough?

**PASS. 10 of 10 match.**

Setup: 2 synthetic sample READMEs written for the spike (`spike/s2/readmes/`), 10 lines, one call per line, the six claim types from PRD 4.1. Expected labels were approved by the owner before any call. Per the owner's change, the two env var lines were rewritten without backticks so they are not decided by the 3c pre-filter.

| Expected label | Lines | Matches | Confidence on matches |
|---|---|---|---|
| command | 1 | 1 | 1.00 |
| dependency | 2 | 2 | 1.00, 0.99 |
| env_var | 2 | 2 | 0.93, 0.99 |
| file_or_url | 2 | 2 | 0.98, 1.00 |
| unverifiable | 1 | 1 | 1.00 |
| not_a_claim | 2 | 2 | 1.00, 0.98 |

Confidence on the hard cases: "Inspired by ..." scored `not_a_claim` at 0.98 and "We use React ..." scored `dependency` at 0.99. The env var line with no variable name scored `env_var` at 0.99. The lowest confidence on any correct match was 0.93 (env var, name present but no backticks).

**Threshold: S2 cannot set it.** There were no misses, so there is no "confidence where it's wrong" to anchor a number. Gate threshold stays open (see S3 findings and the open item below).

Caveat: 10 hand-written lines is a small, easy sample. It supports "good enough to proceed", not a measured error rate.

Cost: $0.000201.

### S3: Can one call handle a whole README?

**FAIL as written (one call). PASS with batches of 100.**

Setup: README of `expressjs/express` (public, JS), 10,371 bytes, 283 lines. Every line, blanks included, sent as one Choice question each. Line text went into each question as a named field.

Evidence:
- One call with 283 questions: rejected, HTTP 400 `validation_failed`, "at most 100 questions". No run was created, no charge.
- Batches of 100 (3 calls, sequential, 100 + 100 + 83 questions):
  - Run A: 1,382 ms wall, 51,441 input tokens, 19,395 output tokens, $0.002378.
  - Run B: 1,414 ms wall, same tokens (19,397 output), $0.002378.
  - Slowest single call 658 ms. All 283 answered, 0 failed.
- Bar was under 5 s and under $0.01. Both met with room: about 1.4 s and about $0.0024. Cost is about $0.0000084 per line, or about 182 input tokens plus 69 output tokens per line.

Findings:
1. **Hard limit: 100 questions per call.** It is in the live validator but not in the `inspect` input schema. PRD 3 says "ONE batched call"; the real design is one call per 100 questions. After the 3c pre-filter, most READMEs will fit in one call, but the code must chunk.
2. **Batch size that works: 100** (the maximum). Calls can also run in parallel; I measured sequential only.
3. **Billing is on input tokens only.** Input was 51k tokens and output 19k; the 19k output tokens are not charged.
4. **Blank lines are free certainty.** All 75 blank lines scored confidence 1.00. They would be decided by the pre-filter anyway.
5. **Many non-blank lines have low confidence.** Of 208 non-blank lines, 116 were under 0.9, 74 were under 0.7, and the lowest was 0.23. This is raw lines with no pre-filter, in a link-heavy README. I did not check which labels these were, so I cannot say how many are real ambiguity versus lines the pre-filter would have removed.
6. **Labels are not fully repeatable.** Same input, same pinned model, two runs: 4 to 5 lines changed label (for example `file_or_url` 76 then 75, `not_a_claim` 178 then 180, `command` 15 then 14). PRD 3c says pinning gives "the same README gets the same labels". It does not guarantee it. The gate and the tests need to expect small variation.

7. **What was sent as `state` (owner question for Block 2).** In S3, neither the line nor the README was the `state`. `state` was a constant string ("A line from a GitHub README."), and each line went into its own question as a named field (`instructions.line`), with the question text referring to it. The question also carried the six-option criteria, so the criteria were repeated 283 times. In S1 and S2 the line itself was the `state`, one call per line. So S3's low-confidence numbers come from lines with no README context. Block 2 compares README-as-state (one question per line, the question naming the line) against line-as-state, since context may raise confidence.

Cost: $0.004756 (runs A and B, plus $0 for the rejected call).

### S5: Does Vercel's free (Hobby) plan offer a firewall rate-limit rule?

**YES.**

Source: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

Hobby limits from the doc's table:
- Rate-limit rules: **1 per project**. (Hobby also allows 3 custom firewall rules in total.)
- Counting keys: **IP** and **JA4 Digest**. No User Agent or header keys (Enterprise only).
- Algorithm: **fixed window** only (token bucket is Enterprise).
- Window: **10 s minimum, 10 min maximum**. Default 60 s. Default request limit 100.
- Included: **1,000,000 allowed requests**.
- Actions: default 429, Log, Deny, Challenge.
- Counters are kept per region. Traffic with the same key in several regions can exceed the limit once per region.

What it means for README Clew 2:
- One rule is enough for PRD 7.4 (for example `/api/scan`, IP key, 60 s window). It cannot give `/api/scan` and `/api/badge` separate limits unless one rule matches both paths.
- It is better than the in-function limiter, since it runs before the function. It is still not exact, because of the per-region counters. The prepaid Glasser balance stays the real ceiling, as PRD 7.4 says.
- I read the doc only. I did not create a rule or test it. Whether Hobby is hard-capped or billed after 1M requests is not stated on this page.

Cost: $0.

### S4: Can a Chrome MV3 popup call a Vercel function?

**FOLDED, NOT RUN.** Reason: time (owner call, Oct 8, 2026).

S4 folds into Block 6: the real popup calling the real `/api/scan` is the test. The open question stays open until then: can an MV3 popup with `host_permissions` read a Vercel function response that has no CORS headers (the PRD 7.3 setup)? Deploy-protection note for Block 6: Standard Protection leaves production domains public but restricts the generated deployment URL (https://vercel.com/docs/deployment-protection), so the popup must call the production domain.

The spike code (hello-world function, tiny MV3 popup) was written but never deployed. It was deleted with `spike/`.

### S6: Can a Vercel function render a 1200x630 PNG card?

**FOLDED, NOT RUN.** Reason: time (owner call, Oct 8, 2026).

S6 folds into Block 6b. `@vercel/og` 1.0.3 is approved for Block 6b, not before. If it fails there, the social card (M20) becomes a STUB. The "under 3 s on the deployed function" bar still applies and is checked in 6b. Nothing was installed and the hello-card handler was never deployed; it was deleted with `spike/`.

Library check done before the fold (Oct 8, 2026):
- `@vercel/og` 1.0.3, published 2026-09-22 (1.0.1 on 2026-08-08, 1.0.2 on 2026-08-24). Not deprecated on npm. Needs Node 22 or newer. Description: "Generate Open Graph Images dynamically from HTML/CSS without a browser".
- Dependencies it pins: `satori` 0.33.5 (satori latest is 0.44.0, published today, so the package runs an older Satori) and `@resvg/resvg-wasm` 2.4.1.
- Vercel docs (https://vercel.com/docs/og-image-generation) say it is supported on the Node.js runtime, default size 1200x630, and has a 500 KB limit on the bundle's assets (JSX, CSS, fonts, images). Only flexbox layouts. Fonts: ttf, otf, woff. Only Noto Sans is built in.
- Not checked: a changelog. The package metadata points to `github.com/vercel/og`, which returns 404 now, so I could not read release notes there. The npm publish dates are the evidence it is maintained.
- Measured size on npm: 7.7 MB unpacked.

### Owner decisions (Oct 8, 2026)

1. **Gate threshold: held until Block 2.** Block 1 mocks use a provisional 0.7 in `gate.js`, marked PROVISIONAL. In Block 2, measure confidence only on lines labeled `dependency`, `command`, `env_var`, or `file_or_url` after the 3c pre-filter. Low confidence between `not_a_claim` and `unverifiable` cannot produce Contradicted, so the gate does not need to cover it.
2. **PRD.md was updated by the owner to v1.2** with the spike results (batches of 100, label drift, gate scope, S5 rate rule, Q4 resolved). I do not edit PRD.md. Re-read it before Block 1. Sections 3, 3c, 7.2, 7.4, 9, and 12 changed.
3. **S3 state question for Block 2:** answered above (finding 7). Block 2 compares README-as-state against line-as-state.
4. **S4 and S6 go ahead.** Propose the S6 library before installing. (Superseded by decision 6.)
5. **Spike code is kept until S4 and S6 are done.** (Superseded by decision 6.)
6. **Block 0 closed early, to save time (Oct 8, 2026).** S4 and S6 are folded, not run (see their entries). `@vercel/og` 1.0.3 is approved for Block 6b only. All of `spike/` was deleted; this LEDGER holds the evidence. Kept: `LICENSE`, `LEDGER.md`, `BUILD-LOG.md`.

### Open items

- S2 used 10 easy hand-written lines. Re-run on real READMEs and harder lines when the Block 2 golden set exists.

## Block 1: rules, candidates, verifiers, buckets on fixtures (Working tier)

Oct 8, 2026. No network, no Jev calls. 102 tests pass offline.

### Known limits (owner asked for the first two to be logged)

1. **One name per line.** A finding carries one `name`. "Built with Express and better-sqlite3" has two candidates, so Jev must pick one (PRD 4.2), and only that package is verified. The other is not checked. With no pick, the claim is Unverifiable.
2. **Coverage is packages only.** `verifiers/coverage.js` finds packages that code imports and the README never mentions. It does not find env vars that code reads, or scripts, that the README skips. Stub comment is in the file.
3. **Candidate finder is heuristic.** Package names come from backticks, cue phrases ("built with", "uses", "powered by", and a few more), and words in parentheses. A parenthesized word like "(optional)" becomes the package candidate "optional". If Jev labels that line `dependency` at high confidence, the verifier can report Contradicted. The gate only catches low-confidence labels. Needs a look in Block 2.
4. **Env var tokens need an underscore.** `PORT` alone is not a pre-filter env var (so `README` or `JSON` do not trigger it). A line about `PORT` goes to Jev, gets no name candidate, and ends up Unverifiable.
5. **Pre-filter limits.** HTML comments spanning several lines are not detected. Indented (4-space) code blocks are not treated as fences. Only ``` and ~~~ fences count.
6. **External URLs are always Unverifiable.** `npx some-tool` is Unverifiable unless the package is declared. Verifiers never touch the network.
7. **Import detection is regex-based.** It reads `import ... from`, `import()`, and `require()` with string literals. Dynamic specifiers built from variables are not seen.
8. **Name-pick path is only tested inline.** Every fixture's mock has `names: {}`, because no fixture line has two candidates. The pick logic is covered by tests in `tests/gate.test.js`, not by a fixture.
9. **Jev label drift (S3) is not modeled.** Mocks are fixed. Block 2 live checks have to allow for a few lines changing.

### Decisions and deviations

- **Fence marker lines** (` ``` ` and `~~~`) are decided `not_a_claim` by the pre-filter. PRD 3c has no row for them; without a rule they would go to Jev. PRD 3c should get a row. I did not edit PRD.md.
- **"One Verified, one Contradicted, one Missing per verifier" (PRD 9b):** only `coverage.js` can return Missing. The other four verifiers got Verified, Contradicted, and an Unverifiable case instead (no name, external URL, no package.json). `coverage.js` got Missing, clean, and an edge case.
- **Gate scope** follows PRD v1.2: only Jev's verifier-bound labels are gated. When Jev also picks a name, the gate uses the lower of the label and pick confidences, and the finding is marked `decidedBy: jev`. The threshold is 0.7, marked PROVISIONAL in `lib/gate.js`.
- **Mood:** "mostly Unverifiable" means at least half of the findings. Empty report is calm.
- **`npm start` with no start script** is Verified only if `server.js` is in the tree (npm's own fallback).
- **Monorepo:** scripts and dependencies are looked up in the root and in each workspace `package.json`.
- **Expected reports** in `fixtures/expected/` were written by hand from what each fixture is meant to show, then compared with the pipeline output. They are golden files, so they would also pin a wrong behavior if I misjudged it. The explicit assertions in `tests/fixtures.test.js` (headline cases) are written in code, not copied from output.
- **`report.js`** leaves `notes: null` (Block 4) and `receipt: null` (Block 3). `meta.ms` is passed in; tests use 0.
- **`tests/helpers.js`** is not in the approved file list. It is a 32-line fixture loader that three test files share.
- **Missing findings** use `line: null`, `quote: null`, `link: null` (PRD 3b says "no line or link").

### Tests shown failing (AGENTS.md rule)

Method: break one line of source code, run the suite, read which tests go red, restore, confirm green. Three rounds, 75 deliberate breaks across all 14 `lib/` files.
- Round 1: 14 breaks (one per source file). 48 tests went red, at least one in every test file.
- Round 2: about 55 breaks aimed at the remaining tests. 82 tests went red.
- Round 3: 7 breaks for the tests still green or masked. Test 65 (relative link inside a sentence) needed two breaks to its regex (start and end anchors). Test 66 (fence marker) had been hidden by another break in round 2, so it got its own.
- `tests/file-size.test.js` was shown red earlier with a temporary file in `lib/` (218 lines, over the cap), then the file was deleted.
- Result: all 102 tests went red at least once. After each round every break was restored and the suite was green at 102 of 102.
- Weak spots: some fixture tests went red together with others on every break (they compare whole reports). That shows they are sensitive, not that they test one thing.

### Wrong turns

- First attempt to run a review script with `node -e` lost its quotes in PowerShell. Switched to a small script file, deleted afterwards (`tests/_review.js`).
- My first temporary oversize file had 218 lines, not 201. Still over the cap, so the demonstration holds.
- Fixed one detail in `candidates.js` before testing: backticked names with capitals (`Express`) were being rejected as package names.

## Block 2: Jev through Glasser (Working tier)

Oct 8, 2026. Status: DONE, at the QA checkpoint. 141 tests pass, 0 cancelled. Live eval run. Jev spend $0.007397 of the $0.10 budget.

### Fixes to Block 1 known limits

- **Limit #3 FIXED (prose guard).** `lib/verifiers/dependencies.js`: a dependency name that appears only in prose (not in backticks, a code fence, or an install command) can now be Verified or Unverifiable, never Contradicted. "(optional)" or "(beta)" as a package candidate ends as Unverifiable with the note "appears only in prose". Without a context argument the verifier treats the name as prose, the safe default. This also covers a confident Jev mislabel that the confidence gate cannot catch.
- **Limit #8 FIXED (name-pick path).** New fixture `name-pick` uses the names path: one line where Jev picks one of two candidates (weaker of label and pick confidence is used) and one where Jev answers `none_of_these` (the line stays Unverifiable).
- New fixture `jev-confident-mislabel`: the mock labels "Inspired by Notion and Obsidian." and "Works with Notion (beta)." as `dependency` at 0.95. The second line is the one that shows the guard: without it the result is Contradicted (the `beta` candidate is not in package.json), with it the result is Unverifiable. The first line has no package candidate, so it was Unverifiable either way.

### Decisions and deviations

- **Questions follow the MLH lessons (README.md Credits).** Criteria describe what each verifier checks and what it cannot see, with no example lines. The dependency criterion has the owner's blind-spot sentence about products, services, and words in parentheses. One test sentence in the instruction. "When in doubt, choose unverifiable." Name-pick questions have a `none_of_these` option.
- **State designs.** README-as-state: whole README as state (numbered lines), one question per line, 100 questions per call. Line-as-state: the line is the state, one call per line, concurrency 5. README-as-state is the default. Line-as-state wins only with fewer dangerous routes on split A (owner's tie-breaker).
- **Answers are checked.** `jev.js` rejects a response whose model is not `jev-1.13.0`, whose answer is missing, or whose choice is not one of the options sent.
- **Retries.** One retry on 429, 503, 529 with the same Idempotency-Key, so the retry is a read and is never charged twice. Timeouts are not retried (40 s timeout, Glasser deadline 45 s).
- **`evaluation/analyze.js` was added** (not in the approved list). It is the offline half of the eval: threshold sweeps and drift from saved results, no network, no cost. It keeps `run-eval.js` to one job.
- **Golden set stores no README text.** `fixtures/golden/golden-set.json` holds line numbers, a 10-character hash of each line, the expected label, a hard-case flag, and the split. README text is fetched at pinned commit SHAs when the eval runs; the runner stops before any call if a hash does not match. Four real READMEs: shadcn-ui/taxonomy, vercel/platforms, chalk/chalk, mckaywrigley/chatbot-ui. Hard cases are in a small synthetic README, `fixtures/golden/hard-cases.md`, with a repo snapshot so the end-to-end false-Contradicted count is real.
- **Label vs outcome.** The eval counts exact-label errors, but the harmful error is a *wrong route*: a line that should not reach a verifier does, or the wrong verifier gets it. Unverifiable vs not_a_claim confusion is harmless.

### Tests shown failing (new code)

Two rounds of deliberate breaks across `jev.js`, `questions.js`, `pipeline.js`, and the guard in `dependencies.js` (about 35 breaks, all restored, suite green after each round). Every new test went red at least once. Three groups needed a dedicated break after another break hid them: the guard's code-context tests, the name-pick fixture tests, and four `jev.js` tests (token counts, network vs timeout, missing key, error passthrough in `scan`).

### Cancelled tests (found by the owner, fixed)

`npm test` on the owner's machine showed 127 pass and 14 cancelled ("Promise resolution is still pending but the event loop has already resolved"), starting at the timeout test in `tests/jev.test.js`. The summary line said "fail 0", so it was easy to miss. I had only searched my own output for pass and fail, and on my machine nothing was cancelled, which hid it.
- **Cause (reproduced):** `AbortSignal.timeout()` uses an unref'd timer. When a request hangs and nothing else keeps the event loop alive, Node exits with the promise pending. A small script with a hanging fake fetch exited silently with code 0. This is a real bug in `lib/jev.js`, not only a test problem.
- **Fix:** `callJev` now uses an `AbortController` with a normal (ref'd) `setTimeout`, cleared on every path. The same script now prints `settled with timeout`.
- **Going forward:** every test report counts cancelled as failed, and prints pass, fail, cancelled, skipped, todo. Result now: 141 pass, 0 fail, 0 cancelled.
- **Honest gap:** I cannot make the original cancellation happen on this machine's `node --test`, so I showed the bug with the script, not with the test going red here.

### Live eval (golden set, 64 lines, approved by owner)

Model `jev-1.13.0` via Glasser. Split A tuned the design, criteria, and threshold. Split B (32 lines) is held out and was run twice after everything was frozen. All figures are Glasser's `charge_usd`. Per-call lines (counts only) are in `evaluation/usage-log.jsonl`; per-line answers (ids, choices, confidences, no text) are in `evaluation/results-*.json`.

| Run | What | Calls | Questions | Wall time | Cost (USD) |
|---|---|---|---|---|---|
| A-readme | split A, README-as-state, criteria v1, plus end-to-end hard-cases scan | 6 | 32 + 19 | 1,479 ms | 0.001558 |
| A-line | split A, line-as-state, criteria v1 (run once, as agreed) | 32 | 32 | 2,396 ms | 0.000951 |
| A-readme-r2 | split A, README-as-state, criteria v2, plus end-to-end | 6 | 32 + 19 | 1,669 ms | 0.001634 |
| B-run1 | split B, frozen config, plus end-to-end | 6 | 32 + 19 | 1,332 ms | 0.001627 |
| B-run2 | same as B-run1 | 6 | 32 + 19 | 1,323 ms | 0.001627 |
| **Total** | | **56** | **236** | | **0.007397** |

Totals: 159,510 input tokens, 16,190 output tokens, $0.007397. The MCP balance went from $10.995023 to $10.987626, which matches. Each source README is one call, so the "calls" column counts README-sized calls, not lines.

**State design: README-as-state wins (kept as the default).**
| On split A, threshold 0.8 | README-as-state v1 | line-as-state v1 | README-as-state v2 |
|---|---|---|---|
| Calls for 32 lines | 6 (5 on golden lines + 1 for the end-to-end scan) | 32 | 6 |
| Wall time | 1.5 s | 2.4 s (concurrency 5) | 1.7 s |
| Exact-label errors | 10 | 10 | 8 |
| Wrong routes, any confidence | 3 | 3 | 1 |
| Wrong routes passing the 0.8 gate | 2 | 1 | 1 |
| Bound lines reaching their verifier | 8 of 11 | 5 of 11 | 8 of 11 |
| Mean confidence, bound-expected lines | 0.895 | 0.812 | 0.873 |

- Line-as-state had one fewer wrong route at the gate (1 vs 2). I did not take it: it is one line (P22), inside run-to-run noise, and it lost 3 of 11 bound lines of coverage. It also costs about one call per line, so a 100-line README would need about 100 calls (about 7 s at the speed measured here). Owner's rule says line-as-state wins "only if" it has fewer dangerous routes, which is a necessary condition, not a sufficient one. Owner can overrule.
- Line-as-state was run once on criteria v1 only, so v2 was not compared with it.

**One criteria revision (v2), as allowed.** Added to the `dependency` criterion: "If you are not sure the name is a published npm package, choose unverifiable." Added to the `env_var` criterion: "It needs the variable name to be written on the line." Effect on split A: errors 10 to 8, wrong routes 3 to 1. Two wrong routes disappeared (H33 "reads the port from the environment" as env_var, and B121 `scoop install` as command). P22 (shadcn/ui as dependency, 0.86) remains.

**Final threshold: 0.8** (`lib/gate.js`, PROVISIONAL tag removed). On split A the number of wrong routes passing the gate was 1 from 0.50 to 0.85, then 0 at 0.90 (cost: 2 more bound lines lost, 8 of 11 down to 6 of 11). The data could not choose inside 0.50 to 0.85, so 0.8 is MLH's conservative prior, kept because lowering it gains coverage but no safety, and raising it to 0.9 loses coverage to block one line that the pipeline already handles (P22 has no package name candidate, so it ends Unverifiable).

**Held-out split B, frozen config, threshold 0.8, N = 32 distinct lines (11 with a verifier-bound expected label):**
| | Run 1 | Run 2 |
|---|---|---|
| Exact-label errors | 9 of 32 | 9 of 32 |
| Wrong routes (any confidence) | 3 | 3 |
| Wrong routes passing the gate | 0 | 0 |
| Bound lines reaching their verifier | 9 of 11 | 9 of 11 |
| False Contradicted, end-to-end hard-cases scan | 0 | 0 |
| True drift found (lines 23, 29, 31) | 3 of 3 | 3 of 3 |

- The 9 errors: 5 are `not_a_claim` answered as `unverifiable` (harmless), 1 is `dependency` answered as `unverifiable` (P3, a coverage miss), and 3 are wrong routes (T63 `command` at 0.62, B114 `command` at 0.22, B150 `file_or_url` at 0.30). All three wrong routes are well under 0.8, so the gate stops them.
- **Drift per distinct line:** 0 of 32 lines changed label between the two runs. Mean confidence change 0.013, largest 0.08. Compare S3 (4 to 5 of 283 lines changed on identical input), so this sample is too small to say drift is gone.
- **Blind spots:** all 9 wrong lines were wrong in both runs, so the errors are per line, not random. That matches the MLH lesson that a better criterion, not more runs, fixes them.

**Caveats, stated plainly.**
- N is small: 32 held-out lines, 11 with a verifier-bound expected label, from 4 READMEs plus one synthetic README. One line moves a rate by 3 points. This supports "safe enough to continue", not a measured error rate.
- Across A and B, 4 lines were routed to a wrong verifier. One (P22 at 0.86) would have passed the 0.8 gate; the other 3 were below 0.62.
- Real-README false Contradicted is a proxy (wrong routes passing the gate), because Block 3's `github.js` does not exist yet. The real false-Contradicted count is from the synthetic hard-cases README, where it was 0 in 4 end-to-end scans (A-readme, A-readme-r2, B-run1, B-run2).
- 5 of the 9 B errors being `not_a_claim` answered as `unverifiable` shows Jev leans toward "can't tell", which is the safe side by design.
- Expected labels were mine, approved by the owner. A few are judgment calls (listed when the set was shown).

### Open items after Block 2

- P22-type lines (a product or design system written like a package) still get a confident `dependency` label. They end Unverifiable today only because the candidate finder finds no package name. A candidate finder that proposes more names would remove that protection.
- Re-run the eval on real repos with snapshots after Block 3 (`github.js`), which makes the false-Contradicted count real for real READMEs.

## Block 3+4: scan API, GitHub fetch, receipt, Haiku summary (Full tier)

Oct 9, 2026, evening. Status: code and offline tests done (197 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo). Not deployed yet. The deployed scans wait for the owner's Vercel steps.

### Sources for the Jev limits

- **Enforced limits:** https://docs.typesafe.ai/models.md (read Oct 9, 2026). Jev 1.13 takes 64K tokens per request, and 32K tokens for state plus the longest single question. `lib/jev-budget.js` enforces both.
- **Where we first saw the limit:** DigitalOcean, "Jev: an AI model that can't write a sentence", dev.to, Oct 9 2026, https://dev.to/digitalocean/jev-an-ai-model-that-cant-write-a-sentence-3cj. My own search could not find the post by title; the owner supplied the URL.
- **Rule:** estimate tokens before every call (3 characters per token, deliberately pessimistic). Over budget: trim the README state first, at a line boundary. Reject with an honest error only when one question cannot fit. Every question carries its own line text, so trimming the state loses context, never the line being judged. Trimmed calls are counted (`usage.jev.trimmedCalls`).

### Haiku model

`claude-haiku-5-5`, from Anthropic's Haiku 5.5 migration guide (a fixed id, no date suffix, no alias). The PRD still says 4.5; the owner said Claude is updating it. Prices from the Haiku 5.5 page: $0.10 per million input tokens and $0.50 per million output tokens (prompts up to 100K). The Haiku cost in the receipt is an estimate and labeled so. Request rules followed: no temperature, top_p, or top_k; no assistant prefill; `output_config.effort` is `low` so thinking stays short (thinking tokens count toward max_tokens).
- **NOT confirmed live.** The free `GET /v1/models` call returned HTTP 400: the key is not scoped to a workspace, so the request needs an `anthropic-workspace-id` header. `lib/summarize.js` sends that header from `ANTHROPIC_WORKSPACE_ID` when it is set. Until the id is set (locally and on Vercel), Haiku calls will fail and the scan returns `notes: null` (fail-open), which is the designed behavior. The exact request body (`output_config.effort`) has also not been tested against the live API.
- Local note: if the shell already has an empty ANTHROPIC_API_KEY, `process.loadEnvFile` does not overwrite it, because it skips variables that already exist. Scratch scripts used `util.parseEnv` instead.

### Decisions and deviations

- GitHub fetch uses **4 API calls**, not 3. The extra `GET /repos/o/r` checks `private`, so a token that can read the owner's private repos can never be used to scan one (N1).
- The GitHub token goes only to api.github.com, never to raw.githubusercontent.com (tested).
- CORS (PRD 7.3): the allow-origin header is sent only when the request origin equals the function's own origin. The extension needs no CORS header because it calls through host_permissions.
- Error mapping: 400, 413, 405, 429 for bad requests; 404 for missing or private repos or no README; 422 when one question is too big; 502, 503, 504 for GitHub, Glasser, or timeouts. Glasser error details are never sent to the client.
- Haiku input is counts, claim types, buckets, who decided, and names that are one safe token (a sentence-like name from a README is dropped). No quotes, no evidence text, no README text. Its output must be exactly five short strings, stripped of links and markup, or it is rejected.
- `scanRepo` also catches a throwing `summarize`, so a Haiku failure can never fail a scan.
- `receipt.stepsMs` has github, jev (this includes the rule and verifier steps), and haiku. Rules and verifiers are not timed separately.
- The tests found a real bug: the first state trimmer counted raw text, but the estimate counts JSON-escaped text. The trim now loops until the estimate fits.

### Live check from this machine (not the deployed function)

`lukeed/polka`, live GitHub and live Jev, Haiku skipped. 647 README lines, 373 sent to Jev in 4 calls (3 with a trimmed README state), 2.8 s total (GitHub 1.1 s, Jev 1.7 s). Jev cost $0.009130, 197,581 input tokens. Result: 2 verified, 143 unverifiable, 14 missing, 0 contradicted. The 14 Missing are mostly packages imported by example folders in the repo (for example `node-fetch`, `body-parser`).

### Known limits added

1. Coverage (Missing) counts packages imported by example or demo folders, which can overstate Missing on repos with examples. A fix would skip `examples/` and `docs/`. Not done (outside this block's scope).
2. Only 20 source files are read, shallowest first, so deep imports can be missed.
3. Large READMEs cost more: the 647-line README above cost $0.009, near the old $0.01 target, because each of 373 questions carries the criteria text.
4. The per-IP limiter is best effort (in memory, per instance). The Vercel firewall rule and the prepaid balances are the real ceilings (PRD 7.4).
5. The token estimate is conservative and not calibrated against Jev's tokenizer, so some trimming may happen that was not strictly needed.
