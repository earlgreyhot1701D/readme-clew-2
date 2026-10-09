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

## Files added in Block 0 (all of `spike/` deleted at step 20) (spike code, to be discarded after the owner OKs it)

- `spike/_env.mjs`, `spike/_peek-openapi.mjs`
- `spike/s1/inspect.mjs`, `spike/s1/run.mjs`
- `spike/s2/run.mjs`, `spike/s2/readmes/taskpad.md`, `spike/s2/readmes/pixelnotes.md`
- `spike/s3/run.mjs`
- `spike/s4/package.json`, `spike/s4/api/hello.js`, `spike/s4/extension/manifest.json`, `popup.html`, `popup.js`
- `spike/s6/package.json`, `spike/s6/api/card.js`

Outside `spike/`: `LICENSE`, `LEDGER.md`, `BUILD-LOG.md`. `.gitignore` was already correct.
