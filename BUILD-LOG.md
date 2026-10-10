# BUILD-LOG

## Block 0: Spikes (Spike tier)

Oct 8, 2026

1. Read AGENTS.md and PRD.md (sections 8, 3c, 4.1, 3e). Loaded the TypeSafe skill from `gh:typesafe-ai/skills/skills/typesafe-ai`.
2. Proposed the plan for S1-S6. Owner approved.
3. Checked `node --version`: v24.11.1. `process.loadEnvFile` exists.
4. Housekeeping: added `LICENSE` (Apache 2.0, text from apache.org). `.gitignore` already held the four required lines, left unchanged.
5. Read the Glasser and TypeSafe docs for the request format.
6. Wrote spike helpers: `spike/_env.mjs`, `spike/s1/inspect.mjs`, `spike/_peek-openapi.mjs`.
7. First run stopped before any network call: `.env` was empty. Owner added the key.
8. S1: ran `spike/s1/inspect.mjs` (free), then `spike/s1/run.mjs` (one Choice call to `jev-1.13.0`). PASS.
9. Logs: the edit tool errors on 0-byte files, so I deleted the two empty files (LEDGER.md, BUILD-LOG.md) and recreated them with full content.
10. S2 prep: wrote two small sample READMEs in `spike/s2/readmes/` (`taskpad.md`, `pixelnotes.md`). The first draft had two lines with two claims each, so I split them. Showed the 10 lines and expected labels. Owner approved, with one change: the two env var lines lose their backticks (they would be decided by the 3c pre-filter). I edited both lines.
11. S2: wrote `spike/s2/run.mjs` and ran it, one call per line. 10 of 10 match. No misses, so no threshold anchor.
12. S3: wrote `spike/s3/run.mjs` and picked the `expressjs/express` README (283 lines). One call with all 283 questions was rejected: Glasser allows at most 100 questions per call. Re-ran in batches of 100 (3 calls): about 1.4 s, $0.0024. Ran it a second time after adding a blank vs non-blank confidence split; labels moved on 4 to 5 lines between runs.
13. S5: read the Vercel WAF rate-limiting doc. Hobby gets 1 rate-limit rule per project. Research only, no code.
14. Wrote results to LEDGER.md. S1, S2, S3, S5 done. Stopped for the owner. S4 and S6 are next, after the owner's Vercel deploy.

15. Owner decisions: gate threshold held to Block 2 (provisional 0.7 in `gate.js` for Block 1), PRD.md now v1.2 (owner edit), spike code kept until S4 and S6 are done. Recorded in LEDGER.md. Added the S3 `state` note to LEDGER.md.
16. S6 library check: `@vercel/og` 1.0.3 (published 2026-09-22, not deprecated, Node 22+). Read the Vercel OG doc and the Deployment Protection doc. Nothing installed yet.
17. S4: wrote `spike/s4/` (package.json, `api/hello.js`, `extension/manifest.json`, `popup.html`, `popup.js`). Not deployed, I do not run the deploy.
18. S6: wrote `spike/s6/package.json` and `spike/s6/api/card.js`. No dependency installed, waiting for the owner's OK on `@vercel/og`.

19. Owner closed Block 0 early to save time. S4 folds into Block 6, S6 into Block 6b (`@vercel/og` 1.0.3 approved for 6b only; if it fails the card becomes a STUB). Recorded both in LEDGER.md as "folded, not run", reason: time.
20. Deleted `spike/` entirely, as the owner asked. Kept `LICENSE`, `LEDGER.md`, `BUILD-LOG.md`. Block 0 closed.

## Block 1: rules, candidates, verifiers, buckets on fixtures (Working tier)

Oct 8, 2026

1. Re-read AGENTS.md (200-line cap) and PRD v1.2 (sections 3, 3b, 3c, 3e, 4, 5, 9, 9b).
2. Committed Block 0 (PRD.md, AGENTS.md, LICENSE, LEDGER.md, BUILD-LOG.md), message "Block 0 closed; PRD v1.2; AGENTS.md file size cap". Pushed to `main` (59ba5c9..b940b17).
3. First file: `tests/file-size.test.js`, plus `package.json` (type module, `npm test` = `node --test`, no dependencies). Showed the size test failing with a temporary 218-line file in `lib/`, deleted the file, test green.
4. Wrote `lib/`: `segment`, `prefilter`, `candidates`, `gate` (0.7, PROVISIONAL), `links`, `mood`, `buckets`, `report`, `pipeline`, and `verifiers/` (`dependencies`, `commands`, `envvars`, `references`, `coverage`). No file near the cap.
5. Wrote 10 fixtures, each with a README, a repo snapshot (`fixtures/repos/`), mocked Jev answers (`fixtures/jev-mock/`), and a hand-written expected report (`fixtures/expected/`): clean-minimal, npm-start-drift, frontend-vite, envvar-unread, missing-package, marketing-claims, empty, no-claims, monorepo, injection.
6. Ran every fixture and checked the output against what each one is meant to show before writing the expected files.
7. Wrote `tests/`: file-size, segment, prefilter, candidates, gate (with name-pick tests), verifiers, buckets, mood, links, report, fixtures, plus `helpers.js`. 102 tests, all pass.
8. Showed every test failing at least once: three rounds of deliberate one-line breaks (75 in total), restoring after each round. Details in LEDGER.md.
9. Logged known limits, deviations, and decisions in LEDGER.md. Stopped at the Block 1 QA checkpoint.

Not touched: `PRD.md`, `AGENTS.md`, anything outside the approved file list. `README.md` appeared in the working tree during this block. I did not create it.

## Block 2: Jev through Glasser (Working tier)

Oct 8, 2026

1. Committed and pushed Block 1 ("Block 1: deterministic core, 102 tests", `df0cc13`). README.md (Claude's Credits section) kept.
2. Proposed the Block 2 file list. Owner approved with four changes: two-line fixture, README-as-state default with a dangerous-routes tie-breaker, the dependency criterion blind spot, and the $0.08 spend guard.
3. Wrote `lib/questions.js` and `lib/jev.js`; added `scan()` to `lib/pipeline.js`; added the prose guard to `lib/verifiers/dependencies.js`.
4. Wrote `tests/questions.test.js` and `tests/jev.test.js`; updated `tests/verifiers.test.js`, `tests/helpers.js`, `tests/fixtures.test.js`. Added fixtures `jev-confident-mislabel` and `name-pick`. 141 tests pass offline.
5. Showed every new test failing: two rounds of deliberate breaks, each restored.
6. Picked four real public READMEs at pinned commits and wrote `fixtures/golden/hard-cases.md` + `hard-cases.repo.json`. Built the 64-line golden set (`fixtures/golden/golden-set.json`), stratified into halves A and B (32 each).
7. Wrote `evaluation/run-eval.js` (live runner with the $0.08 guard and counts-only usage log) and `evaluation/analyze.js` (offline analysis).
8. Stopped before any Jev call. Owner approved the golden set.
9. Fixed 14 cancelled tests the owner found in `tests/jev.test.js`. Root cause: `AbortSignal.timeout` is unref'd, so a hanging request lets the process exit. Reproduced with a script, replaced it with an `AbortController` and a normal `setTimeout` in `lib/jev.js`. 141 pass, 0 cancelled. Reports now count cancelled as failed.
10. Committed "Block 2: Jev client, questions, prose guard, golden set" (`a5f09a2`). Not pushed.
11. Live eval: split A README-as-state (6 calls), split A line-as-state once (32 calls), one criteria revision (dependency and env_var), split A again, then threshold 0.8 set in `lib/gate.js`, then split B twice with the end-to-end hard-cases scan. 56 Glasser calls, $0.007397.
12. Updated `tests/gate.test.js` and `tests/questions.test.js` for the final threshold and criteria. Showed them failing once (three tests red), restored.
13. Wrote results to LEDGER.md. Stopped at the Block 2 QA checkpoint. Uncommitted: the threshold and criteria change, test updates, `evaluation/results-*.json`, `evaluation/usage-log.jsonl`, LEDGER.md, BUILD-LOG.md.

## Files added in Block 0 (all of `spike/` deleted at step 20) (spike code, to be discarded after the owner OKs it)

- `spike/_env.mjs`, `spike/_peek-openapi.mjs`
- `spike/s1/inspect.mjs`, `spike/s1/run.mjs`
- `spike/s2/run.mjs`, `spike/s2/readmes/taskpad.md`, `spike/s2/readmes/pixelnotes.md`
- `spike/s3/run.mjs`
- `spike/s4/package.json`, `spike/s4/api/hello.js`, `spike/s4/extension/manifest.json`, `popup.html`, `popup.js`
- `spike/s6/package.json`, `spike/s6/api/card.js`

Outside `spike/`: `LICENSE`, `LEDGER.md`, `BUILD-LOG.md`. `.gitignore` was already correct.
