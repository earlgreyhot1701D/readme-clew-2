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

14. Owner approved. Committed and pushed "Block 2: live eval, threshold 0.8, timeout fix, criteria v2" (`86c87f1`).

## Pause before Block 3+4 (logged by Claude, architect)

Oct 9, 2026, evening

1. AdaL researched and proposed Block 3+4 (scan API, GitHub fetch, receipt, Haiku summary, Vercel). Findings: Claude Haiku 5.5 is the current Haiku (PRD said 4.5); Jev 1.13 limits are 32K tokens for state plus the longest question and 64K per request (docs.typesafe.ai/models.md). Proposed three extra files: `lib/jev-budget.js`, `lib/scan-repo.js`, `vercel.json`.
2. Owner set the Anthropic spend cap and added `ANTHROPIC_API_KEY` to `.env`. Owner approved the proposal.
3. AdaL hit its weekly plan-credit limit before building anything. Credits return after the deadline. Working tree clean at `86c87f1`; no Block 3+4 code exists.
4. Owner emailed the AdaL team to ask about hackathon credits. Owner chose not to buy a top-up.
5. Plan: Claude does prep only, no build code (PRD update, Block 3+4 split into smaller prompts so each AdaL turn costs less). Cutoff Sat Oct 10, 12:00 PM PT. If credits come back, AdaL builds from the smaller prompts. If not, the owner decides the next step at the cutoff.

6. Resumed Fri Oct 9 evening on Shara's own Anthropic key via /byoak.

## Block 3+4: scan API, GitHub fetch, receipt, Haiku summary (Full tier, one block)

Oct 9, 2026, evening

1. Tree clean at `86c87f1`. Checked the free Anthropic `GET /v1/models` call: HTTP 400, "This API key is not scoped to a workspace" (needs an `anthropic-workspace-id` header). The id `claude-haiku-5-5` is confirmed from Anthropic's Haiku 5.5 migration guide, not from the live call.
2. Wrote `lib/validate.js`, `ratelimit.js`, `github.js`, `jev-budget.js`, `usage.js`, `receipt.js`, `summarize.js`, `scan-repo.js`, `api/scan.js`, `vercel.json`. Changed `lib/jev.js` (`askAll` uses `jev-budget.js`, 40 s timeout kept).
3. Tests: `validate` (with ratelimit), `github`, `jev-budget`, `receipt-usage`, `summarize`, `handler`, `product-promise`. 197 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo.
4. Showed every new test failing: three rounds of deliberate breaks (about 75), each restored by script. Round 1 left 15 green, round 2 targeted them and left 2 (a weak test and one that could not fail), round 3 fixed those. Two tests were rewritten because they could not fail.
5. One live scan from this machine (GitHub + Jev, Haiku skipped): see LEDGER.
6. Did not touch PRD.md, AGENTS.md, README.md, or the gate.

## Files added in Block 0 (all of `spike/` deleted at step 20) (spike code, to be discarded after the owner OKs it)

- `spike/_env.mjs`, `spike/_peek-openapi.mjs`
- `spike/s1/inspect.mjs`, `spike/s1/run.mjs`
- `spike/s2/run.mjs`, `spike/s2/readmes/taskpad.md`, `spike/s2/readmes/pixelnotes.md`
- `spike/s3/run.mjs`
- `spike/s4/package.json`, `spike/s4/api/hello.js`, `spike/s4/extension/manifest.json`, `popup.html`, `popup.js`
- `spike/s6/package.json`, `spike/s6/api/card.js`

Outside `spike/`: `LICENSE`, `LEDGER.md`, `BUILD-LOG.md`. `.gitignore` was already correct.

## Block 5: live page (built, awaiting QA checkpoint, not committed)

What exists:

- `web/`: `index.html`, `app.js` (wiring), `view-model.js` (pure), `render.js` (DOM, `textContent` only), `fixture-mode.js` (localhost only, fixed allowlist of 13 names), `tokens.css`, `layout.css`, `findings.css`, and `mascot/` with 5 hand-made line-art SVGs (calm, curious, worried, tangled, tilt).
- `scripts/dev-server.mjs`: local only (not under `web/`, so never published). Serves `web/` plus `fixtures/expected/`, and sends the same security headers as `vercel.json`.
- `vercel.json`: `outputDirectory: web`, the scan function limit kept, and headers: CSP (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- Polish: "1 LINE" vs "LINES", scan time as `2026-10-11 02:16 UTC`, time in ms or s.
- Download JSON is a disabled stub button with a comment (Block 6b).
- `?repo=owner/name` fills the field and never scans. PRD says only that deep links exist (M10), not that they scan. The demo repo is `earlgreyhot1701D/readme-clew` (v1).

Tests: 246 total, 246 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo. New in this block: `tests/web-view-model.test.js` (17), `tests/no-unsafe-dom.test.js` (2), `tests/web-assets.test.js` (5). Each was shown failing: 38 deliberate breaks, one at a time, each restored. Failures found along the way: the no-unsafe-dom test caught the word "innerHTML" in my own comment in `render.js` (reworded), and a regex backtracking bug in my CSS test (fixed). A rule row with a stray confidence value was added to the tests after a break showed a gap.

Checked on the preview (`vercel deploy`, not `--prod`; it sits behind Vercel login, so checks used `vercel curl`): `/` 200, `/app.js`, `/tokens.css`, `/mascot/tangled.svg` 200, `/api/scan` GET 405 (still works), `/fixtures/...`, `/lib/...`, `/scripts/...` 404 (not published), CSP and the other headers present. CSP console errors: none, checked in headless Chrome against the dev server with the same headers (page renders fully, including confidence bars set through CSSOM).

Not done in this block: no live scan from the page (the Scan button path is written but was not run against the API, by the "no more live scans" decision), no real-device phone check, no commit yet.

Committed as `84aab98` ("Block 5: live page, fixture render, scan wiring").

## Block 5 Phase A: header, tabs, KEY, ABOUT, accordions, not-JS/TS check (2026-10-10, not committed)

What I did:

1. **Not-a-JS/TS repo (item 8).** `lib/js-repo.js` (new): `isJsProject(snapshot)` and `NotJsRepoError`. `lib/scan-repo.js` throws it right after the GitHub fetch, before any Jev call. `api/scan.js` maps it to HTTP 422, code `not_js_repo`. The page shows `NOT A JS/TS REPO // THIS TOOL CHECKS package.json PROJECTS`.
2. **Header and intro.** Intro line under the title, a HOW? disclosure button (`aria-expanded`, `aria-controls`, real button, no hover tooltip).
3. **Tabs.** SCAN / KEY / ABOUT as real buttons with `role="tab"` and `aria-selected`, arrow, Home and End keys, SCAN by default. `tabs.js` imports only `ui-state.js`, so switching a tab cannot start a scan (a test proves it).
4. **KEY and ABOUT** are static HTML in `index.html` (no JS, no `innerHTML`). ABOUT has the three steps, the limits, the address, and six links, all `rel="noopener noreferrer"`. I added two limits the brief did not list, because they are true and in the LEDGER: READMEs over 50 KB are cut and only 20 source files are read. TypeSafe points at https://typesafe.ai (it resolved; docs.typesafe.ai only redirects). I checked all six links returned 200 before building.
5. **Site footer** on every tab, with the exact text.
6. **Accordions.** Each bucket is a disclosure (`aria-expanded`, `aria-controls`). Defaults: Contradicted and Missing open, Unverifiable and Verified closed, and an empty bucket opens so NONE FOUND shows. First 10 rows, then SHOW ALL N. Rows are built only when a section is first opened.
7. **The report footer "HONEST LIMITATIONS"** now opens the ABOUT tab (`data-goto-tab`), so it no longer points at a README anchor that did not exist yet.
8. **Public address.** `web/site.js` has `SITE_URL = https://readme-clew-2.vercel.app` and `deepLink()`. A test fails if any hashed preview URL appears in `web/`.
9. **Files split to stay under 200 lines:** `dom.js`, `disclosure.js`, `ui-state.js`, `tabs.js`, `site.js`, `render-sections.js`, `chrome.css`, `pages.css`.

Freeze, measured with the saved 152-row v1 report in real Chrome (Playwright in TEMP):

| | Before | After |
|---|---|---|
| Rows drawn at first | 152 | 4 |
| DOM elements | 2,039 | 222 |
| Accessibility snapshot | 56,028 chars | 871 chars |
| Layout | 63 ms | 18 ms |
| Full-page screenshot | 574 ms | 72 ms |
| Layout at 6x slower CPU | 783 ms | 258 ms |

The page itself never froze for me: it renders 152 rows in about 60 ms. Turning off the scanline overlay and the stagger changed nothing. The likely cause was the browser tool choking on a 56 KB accessibility tree and a very tall page. Fewer nodes fix that.

Tests: 276 total, 276 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo (246 before this block). New files: `js-repo.test.js` (5), `ui-state.test.js` (7), `tabs-no-scan.test.js` (6), `web-copy.test.js` (11), plus changes to `web-view-model.test.js` and `web-assets.test.js`. Shown failing: 42 deliberate breaks, one at a time, each restored. 41 turned a test red. The one that did not (`rows.length <= 10` changed to `< 10`) is an equivalent change, since 10 rows give the same output either way.

Real browser check (Playwright, real CSP headers, 1200 px and 390 px): 54 of 54 behaviors pass, including defaults, SHOW ALL (140 rows in about 40 ms), keyboard tabs, HOW?, footer link, no horizontal scroll, no console errors, and zero requests to `/api/` while switching tabs.

Preview deploy (not `--prod`), checked with `vercel curl`: all new files 200, `GET /api/scan` 405. One live scan of v1 on the preview: HTTP 200 in 3.8 s, `notes.summary` present, Anthropic `ok` (1 call), Jev $0.006041. The page puts that exact summary in the bubble (checked by rendering the live response, not the fallback). A scan of a Python repo (`hung-jury`) returned 422 `not_js_repo` with no Jev or Haiku call.

Mascot (item 6): `design/mascot/build.mjs` writes two styles (A thin single stroke, B heavier double-line wraps) into `design/mascot/a/` and `/b/`, and `design/mascot-preview.html` shows both next to the current art and at 64, 32 and 16 px. Stopped here for Shara's pick. `web/mascot/` is unchanged.

## Block 5a: verifier fix for pnpm monorepos (2026-10-10, Working tier)

Why: the demo repo (`earlgreyhot1701D/readme-clew`) showed 7 false positives. Details in LEDGER ("Found in the demo").

What I did:

1. `lib/workspaces.js` (new, pure): parses `pnpm-workspace.yaml` `packages:` and root `workspaces`, expands `dir/*` and exact dirs, resolves a package name or path to a workspace.
2. `lib/github.js`: reads `pnpm-workspace.yaml` (one extra raw read, no extra API call), uses declared workspaces and keeps the old folder regex as the fallback. `MAX_WORKSPACES` 10 to 30. Sets `snapshot.workspacesTruncated`.
3. `lib/verifiers/commands.js`: workspace targeting (`--filter/-F`, `--workspace/-w`, `yarn workspace`), value-taking flags consumed, directory flags Unverifiable, unresolved targets Unverifiable.
4. `lib/verifiers/dependencies.js` and `coverage.js`: when workspaces were truncated, "not declared" is Unverifiable and the Missing wording is neutral. (`coverage.js` was not named in the proposal. It carries the "not listed in package.json" wording, so it needed the one-line change.)
5. Fixtures: `pnpm-monorepo`, `readme-clew-v1-regression`, and `fixtures/v1-pnpm-workspace.yaml` (v1's real file). Both new expected files were generated from the pipeline, then reviewed line by line against intent. Added both names to `tests/helpers.js`.
6. Tests: 197 to 222 (all pass, 0 fail, 0 cancelled, 0 skipped, 0 todo). New: `tests/workspaces.test.js` (8), github (4), verifiers (9), fixtures (4 including the 2 report-equals tests).
7. Showed the new tests failing: 19 deliberate breaks, one at a time, each restored by a throwaway script outside the repo. Every break turned at least one new test red. The full suite was re-run green afterwards.
8. One live rescan of v1 from this machine (GitHub + Jev, keys from `.env`, never printed): 0 contradicted, 4 missing, 8 verified, 140 unverifiable.

Not touched: PRD.md, AGENTS.md, README.md, api/, web/.

## Block 5 Phase B: raster clew art, favicons, social card (2026-10-10, commit `6f662f2`)

- The 5 poses are PNGs in `web/mascot/` (calm, curious, worried, tangled, tilt), square, shown at 120 px with `width` and `height` set. Alt text is `The clew, <mood>`. The old SVGs are deleted. The A/B generator stays in `design/`.
- `clewPose`: `tilt.png` for calm and curious when Jev was unsure. Worried and tangled keep their own picture (one picture per pose, no CSS rotation).
- Favicons: `favicon-32.png` and `favicon-16.png` as `rel="icon"`, `favicon-180.png` as `apple-touch-icon`. No SVG favicon.
- Social card: `web/social-card.png` (1200x630). Tags: `og:title`, `og:description`, `og:image` (absolute, `https://readme-clew-2.vercel.app/social-card.png`), `og:url`, `og:type`, `og:image:width/height`, `twitter:card=summary_large_image`. No code depends on the picture, only its size (test).
- Tests 279 (all pass). Changed tests were shown failing: 17 breaks, all red, every binary file restored byte for byte.
- LEDGER notes the art is AI-generated (ChatGPT by Shara, cut out by Claude). PRD.md not touched.

## Block 5 Phase C: UI polish (2026-10-10, web/ only, no lib/ or api/ changes)

1. **Input:** placeholder `owner/repo or https://github.com/owner/repo`, and a USE DEMO REPO button that fills `earlgreyhot1701D/readme-clew` and does not scan.
2. **Count chips are buttons** (`aria-label` "Contradicted, 2, go to section"). A click opens the section if closed, scrolls to it, and focuses its header (`navigate.js`).
3. **Bucket notes:** `notes.buckets[bucket]` as one line under the header, via `textContent`. No note means no element.
4. **JSON export (M18, pulled forward from 6b):** DOWNLOAD JSON saves the exact report object as `readme-clew-2_<owner>_<repo>_<short sha>.json` from a Blob, then revokes the object URL. No request is made. The button lives in the report footer, so it exists only once a report does.
5. **Rescan:** the old report stays while a new scan runs. A SCANNING strip shows above it and SCAN is disabled. Success replaces the report, error keeps the old one under an error strip. A state machine (`scan-state.js`) holds the rule.
6. **Phones (under 600 px):** confidence row stacks, track is full width, metadata on its own line, scanlines at 0.25 instead of 0.6.
7. **After a scan:** scroll to the first non-empty bucket among Contradicted, Missing, Unverifiable and focus its header. If all three are empty, focus the status strip. No smooth scrolling under reduced motion. A closed section stays closed.

New files: `ui-state.js` (grown), `scan-state.js`, `export.js`, `download.js`, `navigate.js`. All under 200 lines.

Real bugs the browser run found (unit tests could not):
- **Focus after a scan did nothing.** The staggered reveal used `visibility: hidden`, and a hidden element cannot take focus. It now fades with `opacity`. Earlier QA used reduced motion, which skips the animation, so it never showed.
- **The phone track stayed 140 px wide.** The 600 px rules sat above the base `.track` rule, so the base rule won. The block now comes last, and a test checks the order.
- State strips were upper-casing the repo name in `SCANNING owner/name`. GitHub names are case-sensitive, so `text-transform: none` now applies.
Each is covered by a test that fails when the bug is put back.

Tests: 317 total, 317 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo (279 before Phase C). New: `scan-state.test.js` (9), `export.test.js` (6), `navigate.test.js` (9), plus additions to `ui-state`, `web-copy` and `web-assets`. Shown failing: 48 deliberate breaks, one at a time, plus 3 for the bugs above. 47 turned red first time. The one that did not (a vacuous `indexOf` order check) was fixed and now fails.

Browser check (Playwright, real CSP headers, `/api/scan` answered by mocks using the real live response, so no scan billed): 49 of 49 behaviors pass at 1200 px and 390 px.

Committed as `e864c8f`.

## Block 5 Phase D: clear, home clew, site basics, analytics, summary wording (2026-10-10)

1. **CLEAR** button next to SCAN. It empties the field, removes the report and any strip, drops `?repo=` (other parameters stay) with `history.replaceState`, resets SCANNED to a dash, and puts focus in the field. Off while a scan runs. It never calls the API. The rule lives in `scan-state.js` (`clear` event, ignored while scanning); `withoutRepoParam` is in `site.js`.
2. **Home clew:** the idle state shows `calm.png` beside the idle text (one `clewImg` helper builds every clew picture).
3. **Empty buckets** show NONE FOUND only. The Haiku note is hidden when the count is 0 (`bucketSections`).
4. **Haiku summary (`lib/summarize.js`, prompt only):** plain English for a developer, lead with contradictions then missing, name a few missing packages, verified last and brief, the Unverifiable count only when nothing else exists, one or two sentences. Same structured data. Details:
   - The prompt never contains "mood" or "low-confidence" (or any talk of confidence). The request is built by `promptInput`, which is the same information as `buildInput` with renamed keys (`mood` is `overall`, `lowConfidenceFindings` is `unsureLabels`, `lowConfidence` is `unsure`), so the model is never handed either word.
   - A reply that uses either word anywhere is rejected, so the report falls back to the fixed line (fail-open, as before).
   - The summary is cut to two sentences in code (`twoSentences`). The live reply had three.
   - Live check on the demo repo (1 scan, preview): "No README claims were contradicted by the code. Four dependencies the code uses are missing from the README: esbuild-plugin-pino, orval, drizzle-kit, and pino-http. Eight claims were verified." No banned words, no Unverifiable count. Three sentences, which is why the two-sentence cap was added. The cap is covered by tests, not re-scanned.
5. **Site basics in `web/`:** `robots.txt` (allow all, `Disallow: /api/`, Sitemap line), `sitemap.xml` (the one production URL), `404.html` (site style, the curious clew, a link home, root-absolute paths so it works at any depth), canonical link, description, `theme-color` `#0A1214`.
6. **Vercel Web Analytics:** `<script defer src="/_vercel/insights/script.js">` (same origin, CSP unchanged). ABOUT has "Anonymous page-view counts through Vercel Analytics. No cookies. Scans are never stored." The input hint changed from "NOTHING IS STORED" to "SCANS ARE NEVER STORED", because page views are now counted.

Dev server (`scripts/dev-server.mjs`) now serves `404.html` with status 404 for unknown paths, a stub for the Analytics script, and PNG, TXT and XML types.

Tests: 340 total, 340 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo (317 before). New: `site-basics.test.js` (8), CLEAR cases in `scan-state.test.js` (5), empty-bucket note in `web-view-model.test.js`, 11 in `summarize.test.js`. Shown failing: 42 deliberate breaks plus the two-sentence cap. All turned a test red. One slipped first time ("say how confident you are", because only "confidence" was banned); the test now also bans "confident".

Browser check (Playwright, real CSP headers, mocked `/api/scan`): 48 of 48 pass at 1200 px and 390 px, including CLEAR, the home clew, hidden empty-bucket notes, the 404 page at a deep path, robots and sitemap, and the Analytics script with no CSP error.

Committed as `5e5e507`.

### Phase D addition: say what Jev decided on Unverifiable rows (web/ only)

On Unverifiable rows decided by Jev, the bare "JEV CONFIDENCE 0.95" bar is replaced with words, as plain text with no bar (`web/verdict.js`, new, pure):

- a code type (dependency, command, env_var, file_or_url) with `lowConfidence` true: `JEV THOUGHT: COMMAND (0.62), BELOW THE 0.8 BAR` (`env_var` shows as `ENV VAR`, `file_or_url` as `FILE OR URL`)
- any other type: `JEV: NOT A CHECKABLE CLAIM (0.95 SURE)`
- a code type that was sure enough went to a code check, so it keeps the bar. Verified rows decided by Jev keep it too.

The KEY line on confidence now describes all three. `rowModel` carries a `verdict` field, `renderRow` draws it as a paragraph, and the 0.8 bar and the code types are pinned to `lib/gate.js` by a test (no `lib/` change). On the real v1 report the 140 Jev-decided Unverifiable rows split 31 THOUGHT, 86 NOT A CHECKABLE CLAIM, and 23 with a bar. Tests: 351 total, 351 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo (340 before). 20 deliberate breaks, all turned a test red. Browser check: 10 of 10 pass at 1200 px and 390 px.

Committed as `c8dd621`. Production: `ad04a76` (blank scan field), live at https://readme-clew-2.vercel.app.

## Hardening: Haiku reason codes, retries, per-field guard, TRY AGAIN (2026-10-11)

Approved after one of two production demo scans fell back to the fixed clew line with no way to tell why. Files: `lib/summarize.js`, `lib/jev.js`, `lib/usage.js`, `lib/scan-repo.js`, `api/scan.js`, and in `web/` `scan-state.js`, `render.js`, `app.js`, `chrome.css`.

1. **Haiku reason codes** `http_429`, `http_5xx`, `http_4xx`, `network`, `timeout`, `parse`, `banned`, `max_tokens`, in the receipt and the counts-only log line (`haiku`, `haikuRetried`, `jevRetried`). Codes and numbers only, never text.
2. **Banned-word guard per field:** only the offending summary or bucket note is dropped, the rest of the reply stays.
3. **Haiku: one retry** on 429, 5xx, or a network error, only if 3 s of the 9 s budget remain after a 200 to 600 ms jittered wait. Receipt: `retried: true`. Never on 4xx, timeout, parse, banned, or max_tokens.
4. **Jev: one retry** on 5xx, a network error, or a timeout, with a new idempotency key, only if 8 s of the Jev budget remain (48 s of the 60 s function, kept clear of Haiku). Never on a 4xx. A Glasser 429 is no longer retried (it was before, with the same key).
5. **TRY AGAIN** button on the error strip: re-sends the same repo, one click, never automatic, gone while scanning. Not offered for bad input, not found, or not JS/TS.

Tests: 420 total, 420 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo (353 before). New files: `haiku-retry.test.js` (24, with `summarize.test.js`), `jev-retry.test.js` (20), `retry-receipt.test.js` (13), `try-again.test.js` (13). The retry rules use a fake fetch and a fake clock, so no test waits or touches the network. Shown failing: 63 deliberate breaks, one at a time. 61 turned a test red the first time. Two did not ("timeout made retryable" and "the retry timer is not cut to the remaining budget"), because the existing tests could not tell them apart. Two tests were added and both breaks now go red. Real-browser check of TRY AGAIN: all 24 behaviors pass at 1200 px and 390 px.

## Block 6: Chrome extension popup

Built in the last session, finished and checked here. Popup 400 px wide, activeTab plus one API host permission, click to scan (opening the popup never scans). Shows the top 3 Contradicted, else the top 3 Missing. OPEN FULL REPORT (opens the site with ?repo=) with the note, and DOWNLOAD JSON from the report in hand. No input, HOW? or KEY. Shared files are copied from web/ by scripts/sync-extension.mjs; a drift test fails if they differ. content.js is a stub (STRETCH X1), not in the manifest.

Tests: 452 total, 452 pass, 0 fail. Real-Chrome QA (Chrome 155, unpacked, mocked API): not a repo page, idle, scanning, error with TRY AGAIN, report. Shots in design/shots/ext-*.png. Production already served 3d4f4bc (TRY AGAIN live).

## Block 7: bookmarklet, usage report, ZIPs

- Coverage verifier scope fix and bad-input text (see LEDGER). Rescan of lukeed/polka: 0 Missing (was 14).
- Bookmarklet: bookmarklet/bookmarklet.js (navigates only), built into web/bookmarklet-href.js by scripts/build-bookmarklet.mjs, drag link on the ABOUT tab. Test runs the real source in a sandbox with no network.
- M19 badge left as a stub (LEDGER).
- tools/usage-report.js writes evaluation/usage_report.md from Glasser's run and balance history (counts and money only).
- Extension ZIP built. GitHub release v0.1.0 NOT created: waits for Shara to say the README is in.
- Submission ZIP built from git archive of main, not committed.

Tests: 464 total, 464 pass, 0 fail.

## Close (logged by Claude, architect)

Oct 10, 2026, 10:26 PM PT

1. AdaL mapped an HTTP 403 from /api/scan to the rate-limit message ("TOO MANY SCANS"), because the Vercel Hobby firewall can only Deny with 403. Commit a48ccf7, deployed to production. Extension ZIP on release v0.1.0 replaced; source ZIP rebuilt.
2. Final suite: 465 tests, 465 pass, 0 fail.
3. Self-scan of this repo through production: 0 Contradicted, 0 Missing.
4. Build closed. Remaining work is docs and submission.
5. Home: GET IT strip (extension release, bookmarklet button to ABOUT, source) added to the SCAN panel. web/ only, one test.
