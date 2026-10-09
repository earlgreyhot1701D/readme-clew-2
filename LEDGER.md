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
