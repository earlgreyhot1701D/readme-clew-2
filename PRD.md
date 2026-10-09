# README Clew 2 - PRD

**Version:** 1.2 (Oct 8, 2026: Block 0 spike results applied)
**Changelog:** v1.0 approved Oct 7. v1.1 Oct 7: owner added M21 (Praxi Clew-style receipt). Successor projects confirmed allowed. v1.2 Oct 8: spike results (LEDGER.md, Block 0). Glasser caps a call at 100 questions, so Jev runs in batches. Pinning the model does not guarantee identical labels. Gate threshold moves to Block 2 and applies only to verifier-bound labels. Vercel Hobby rate rule confirmed. Q4 resolved.
**Owner:** La Shara Cordero
**Hackathon:** AdaL "What Would Jev Do?" (Oct 6-11, 2026)
**Repo:** `readme-clew-2` (new repo, all code written this week)
**Status:** Approved by owner, Oct 7, 2026. Changes from here are dated PRD edits with a reason.

> AI assisted. Human approved. Powered by NLP.

---

## 0. Done line

```
DONE LINE
Done sentence:  A builder looking at any public JS/TS repo on GitHub can click
                Scan and see which README claims match the code, with the
                README quote, the code evidence, and Jev's confidence,
                without me.

Judge path:     1. Open the live page. A demo repo is already filled in. Click Scan.
                2. See four buckets. Each finding shows its README quote, code
                   evidence, and a confidence bar. The clew's speech bubble
                   holds Haiku's summary.
                3. Download the ZIP from the GitHub release, load unpacked in
                   Chrome, open any public repo, click the icon. Same scan.
                (Under 3 minutes)

Submission:     [ ] Project ZIP (source + assets)
                [ ] Live URL (Vercel)
                [ ] Screenshots of the final experience
                [ ] Demo video made with AdaL Video Producer (goes in the
                    social post and the build summary)
                [ ] Public social post that says "built with AdaL" and tags AdaL
                [ ] Build summary: what, who it's for, how Jev + AdaL were used,
                    and "Workflows or Sandboxes" (see Open questions)
                [ ] Submitted before Sun Oct 11, 11:59 PM PT

Done is not:    Chrome Web Store listing        -> STUB
                Badges drawn inside GitHub page -> STRETCH (rules in section 6)
                Python and Go repos             -> STUB
                Firefox version                 -> STUB
                Private repos                   -> NEVER in v1

Ship by:        Sat Oct 10, 8 PM PT (deadline Sun Oct 11, 11:59 PM PT)
```

When the done line is met, the build stops. Anything else goes to STUB.

---

## 1. Why this exists

AI-assisted builders ship code faster than they update READMEs. The README says `npm start`, the code defines `start:prod`, and nobody finds out until a stranger copies the command and it fails.

README Clew (May 2026, Replit Buildathon) proved the idea. Its own README lists two honest limits:

1. Claude was *asked* to quote the README word for word. That was a prompt rule, not a code check.
2. Prose labels like "Frontend (Vite)" sometimes got pulled out as package names, which produced false Contradicted findings.

README Clew 2 is a rebuild from scratch that fixes both by changing who decides what:

| Job | README Clew (v1) | README Clew 2 |
|---|---|---|
| Find claims in the README | Claude extracts and quotes | Code splits the README into lines. Jev labels each line. The quote *is* the line, so word-for-word is guaranteed by code |
| Pick the real package/script/path name | Claude | Code finds candidates, Jev picks one, with confidence |
| Decide Verified / Contradicted | Five deterministic verifiers | Same five checks, rewritten. Still fully deterministic |
| Low certainty | Not reported | Low-confidence calls go to Unverifiable, never Contradicted |
| Summary | Claude Sonnet | Claude Haiku, from structured findings only |
| Form | Web page | Chrome extension + web page + bookmarklet |
| Speed | 10-20 s | About 1.4 s of Jev time for a 283-line README, in 3 batches (spike S3) |

**Who it's for:** self-taught and AI-assisted builders who want to check their own receipts before someone else does. Also hackathon judges, who read a lot of READMEs.

---

## 2. Scope

### MUST

| # | Feature |
|---|---|
| M1 | Scan any public GitHub repo (JS/TS) from a URL |
| M2 | Split the README into lines deterministically, including lines inside code fences |
| M2b | Deterministic pre-filter decides the obvious lines before Jev sees anything (section 3c) |
| M3 | Jev labels each candidate line by claim type (via Glasser) |
| M4 | Code finds name candidates per line. Jev picks the real one when there is more than one |
| M5 | Confidence gate: below threshold goes to Unverifiable with a "low confidence" tag |
| M6 | Five deterministic verifiers: dependencies, commands, env vars, file/URL references, code-vs-package coverage |
| M7 | Four buckets: Verified, Unverifiable, Missing, Contradicted. Each finding shows the README line, the code evidence, and confidence |
| M8 | Haiku writes a summary line plus one note per bucket, from structured findings only. Fail-open |
| M9 | Mascot (original yarn-ball clew) in popup and on the live page. Speech bubble, mood, head tilt (section 5) |
| M10 | Live web page on Vercel with `?repo=` deep links and a pre-filled demo repo |
| M11 | Chrome extension (Manifest V3): popup scans the repo in the current tab |
| M12 | Bookmarklet that opens the live page with the current repo filled in |
| M13 | GitHub release with the extension ZIP and load-unpacked instructions |
| M14 | One Vercel function holds all keys, validates input, rate-limits, times out |
| M15 | Report output as specified in section 3b, including links to the exact README line on GitHub |
| M16 | Demo video made with AdaL Video Producer, under 2 minutes |
| M17 | "Try it" section in the README with judge install steps (section 6) |
| M18 | JSON export: "Download JSON" button saves the report object (3b) as a file. Built in the browser, nothing stored |
| M19 | Status badge: `/api/badge?repo=owner/name` returns an SVG with the four counts. Embeddable in any README (section 3d) |
| M20 | Social card: `/api/og?repo=owner/name` returns a 1200x630 PNG with repo name, counts, and the clew's mood. The `?repo=` page links use it as their preview image (section 3d) |
| M21 | Scan receipt in every report, plus a build-week usage report of every real Jev and Haiku call (section 3e) |

### STUB (comment stubs with implementation notes, not built)

| # | Feature | Note |
|---|---|---|
| S1 | Chrome Web Store listing | Review time does not fit the week |
| S2 | Python and Go repos | New candidate patterns + verifiers per language |
| S3 | Firefox | Unlisted self-signed add-on |
| S5 | Glasser fallback to OpenRouter's Jev | Only if Glasser goes down mid-week |
| S6 | Auto-tuned confidence threshold | v2 uses one fixed threshold set in Block 2 |

### STRETCH

| # | Feature | Rules |
|---|---|---|
| X1 | Badges and line marks drawn inside GitHub's page | Rule 1: runs only after a click, never on page load. Rule 2: if the README box is not found, fall back to the popup silently |

### NEVER

| # | Behavior |
|---|---|
| N1 | Scan private repos |
| N2 | Store scans, READMEs, or code after the request ends. No database. The only thing kept is the CDN cache of badge and card images (counts, repo name, mood; no README text), which expires on its own (section 3d) |
| N3 | Rewrite or grade anyone's README |
| N4 | Let Jev or Haiku decide Verified or Contradicted. Only the verifiers decide |
| N5 | Scan automatically on page load |
| N6 | Put any key in the extension, the web page, or the repo |
| N7 | Send raw README text to Haiku |
| N8 | Render user or repo content with `innerHTML`. `textContent` only |
| N9 | Log README text, code, prompts, model output, or keys |

---

## 3. Architecture

```
 Chrome extension popup        Live web page            Bookmarklet
 (MV3, host_permissions   (Vercel static, ?repo=)   (opens live page with
  for the API domain)                                 ?repo= filled in)
          \                        |
           \                       |
            v                      v
        ┌──────────────────────────────────────┐
        │  POST /api/scan   (Vercel function)   │
        │  validate -> rate limit -> timeouts   │
        └──────────────────┬───────────────────┘
                           │
         1. github.js      │  README (<=50 KB), package.json, file tree, <=20 source files
         2. segment.js     │  README -> numbered lines (code)
         2b. prefilter.js  │  obvious lines decided by rules, never sent to Jev (code)
         3. candidates.js  │  per line: backticked commands, package-like tokens,
                           │  UPPER_SNAKE env vars, paths, URLs (code, regex)
         4. jev.js         │  batched calls via Glasser, max 100 questions per call
                           │  (Glasser limit; about 3 calls for a 283-line README):
                           │    per line  -> Choice: claim type
                           │    per multi-candidate line -> Choice: which name
         5. gate.js        │  verifier-bound labels below threshold -> Unverifiable
                           │  ("low confidence")
         6. verifiers/     │  five deterministic checks -> buckets
         7. summarize.js   │  Haiku: counts + types + validated names only.
                           │  9 s timeout, fail-open
                           v
                  { buckets, notes, meta }
```

### Files (one file, one responsibility)

```
readme-clew-2/
  api/
    scan.js              entry: wires the steps, nothing else
    badge.js             SVG status badge (section 3d)
    og.js                social card PNG (section 3d)
  lib/
    validate.js          github.com/owner/repo check, body size
    ratelimit.js         per-IP limit (best effort, see 7.4)
    github.js            fetch README, package.json, tree, source files
    segment.js           README -> lines with line numbers
    prefilter.js         rule-based decisions for obvious lines (section 3c)
    candidates.js        regex candidate finder per line
    report.js            builds the report object (section 3b), pure function
    receipt.js           builds the scan receipt (section 3e), pure function
    usage.js             counts calls, tokens, and cost per model during a run
    links.js             GitHub line links, pure function
    jev.js               Glasser -> Jev request/response, try/catch, timeout
    questions.js         builds the Jev question set from lines + candidates
    gate.js              confidence threshold logic
    buckets.js           merges verifier results into four buckets
    summarize.js         Haiku call, structured input only, fail-open
    mood.js              bucket counts -> mascot mood (pure function)
    pipeline.js          the scan steps, shared by scan.js, badge.js, og.js
    badge-svg.js         counts -> SVG string, pure function
    og-card.js           counts + mood -> card layout, pure function
    verifiers/
      dependencies.js
      commands.js
      envvars.js
      references.js
      coverage.js
  web/
    index.html  app.js  render.js  export.js  styles.css
    mascot/              clew SVG states (calm, curious, worried, tangled, tilt)
  extension/
    manifest.json  popup.html  popup.js  render.js  popup.css
    mascot/              same SVG states
    content.js           STRETCH only, empty stub until X1
  bookmarklet/
    bookmarklet.js       source + build note
  fixtures/
    readmes/             sample READMEs incl. edge cases + injection test
    jev-mock/            recorded Jev answers for offline tests
    expected/            expected buckets per fixture
  PRD.md  AGENTS.md  LEDGER.md  BUILD-LOG.md  README.md  LICENSE
```

---

## 3b. Report output

The same report object feeds the popup, the live page, and the tests. `report.js` builds it; nothing else shapes it.

### Report object (returned by `/api/scan`)

```json
{
  "repo": { "owner": "earlgreyhot1701D", "name": "readme-clew-2", "readmePath": "README.md" },
  "counts": { "verified": 9, "unverifiable": 4, "missing": 2, "contradicted": 1 },
  "findings": [
    {
      "id": "f-07",
      "bucket": "contradicted",
      "claimType": "command",
      "line": 42,
      "quote": "npm start",
      "name": "start",
      "evidence": { "file": "package.json", "detail": "scripts has start:prod, no start" },
      "decidedBy": "rule | jev",
      "confidence": 0.93,
      "lowConfidence": false,
      "verifier": "commands",
      "link": "https://github.com/OWNER/REPO/blob/HEAD/README.md?plain=1#L42"
    }
  ],
  "notes": { "summary": "string or null", "buckets": { "verified": "...", "unverifiable": "...", "missing": "...", "contradicted": "..." } },
  "mood": "calm | curious | worried | tangled",
  "tilt": true,
  "meta": { "linesTotal": 120, "linesToJev": 38, "jevModel": "jev-1.13.0", "readmeTruncated": false, "ms": 2400 },
  "receipt": { "...": "see section 3e" }
}
```

Rules:

- `quote` is always the exact README line text, copied by code. Never model output.
- `confidence` is null when `decidedBy` is `rule`.
- `notes` can be null (Haiku failed or timed out). The report is still complete.
- Missing findings have no `line` or `link`; their evidence points at code.

### Report layout (popup and page share `render.js`)

| Order | Section | Content |
|---|---|---|
| 1 | Header | Repo name, scan time, four counts as colored chips |
| 2 | The clew | Mood pose, head tilt if any low confidence, speech bubble (Haiku summary or fixed fallback) |
| 3 | Contradicted | First, because it's the drift. Each row: line number link, quote, evidence, confidence bar |
| 4 | Missing | What code does that the README never mentions |
| 5 | Unverifiable | Low-confidence rows marked "Jev wasn't sure" |
| 6 | Verified | Collapsed by default. The receipts |
| 7 | Footer | "Decided by rules: X lines. Decided by Jev: Y lines." Plus the honest limitations link |

Every row shows who decided it: a rule or Jev. That makes the deterministic/AI split visible to judges.

Popup is compact: header, clew, counts, top 3 Contradicted, and an "Open full report" link to the live page with `?repo=`.

---

## 3c. Deterministic pre-filter

Rules decide the obvious lines first. Jev only sees what rules can't settle. Same pattern as Agenda Watch: heuristics first, model on miss.

| Line looks like | Rule decision | Sent to Jev? |
|---|---|---|
| Empty, horizontal rule, HTML comment | `not_a_claim` | No |
| Heading with no backticks | `not_a_claim` | No |
| Badge or image markdown only | `not_a_claim` | No |
| Inside a code fence and starts with `npm`, `pnpm`, `yarn`, `npx`, `node`, `bun` | `command` | No |
| Contains `process.env.X` or a bare `UPPER_SNAKE` token in backticks | `env_var` | No |
| Only a relative link `[text](./path)` | `file_or_url` | No |
| Anything else | undecided | Yes |

Also deterministic:

- **Model pinned** to `jev-1.13.0`, not `jev-latest`, so the model can't change mid-week. Recorded in `meta.jevModel`. Pinning does not make labels identical: spike S3 saw 4 to 5 of 283 lines change label between two identical runs. Tests use mocked Jev answers, so CI stays deterministic; live checks allow for small drift.
- **Threshold** is one fixed number stored in `gate.js`. Block 1 uses a provisional 0.7, marked PROVISIONAL. The final value is set in Block 2.
- **The gate applies only to verifier-bound labels:** `dependency`, `command`, `env_var`, `file_or_url`. Wavering between `not_a_claim` and `unverifiable` can't produce Contradicted, so it isn't gated. Block 2 measures confidence on verifier-bound lines only, after the 3c pre-filter.
- **Line links** built by code from owner, repo, path, and line number.

---

## 3d. Badge, social card, and JSON export (all new for v2)

v1 kept the last 50 scans in server memory to feed its badge and cards. v2 has no server memory. Instead, each badge or card request runs its own scan, and Vercel's CDN caches the finished image.

| Output | How it's made | Cached | Contains |
|---|---|---|---|
| JSON export | `export.js` in the browser turns the report object already on screen into a file download | Not cached. Nothing leaves the browser | The full report object (3b) |
| Status badge | `/api/badge` runs the pipeline with Haiku skipped, then `badge-svg.js` draws the counts | CDN, 24 h (`Cache-Control: s-maxage=86400`) | Repo-independent label, four counts. Repo name is never drawn into the SVG |
| Social card | `/api/og` runs the pipeline with Haiku skipped, then `og-card.js` lays out the image | CDN, 24 h | Repo name (already validated by regex), four counts, the clew's mood pose |

Rules:

- Badge and card never call Haiku. One scan's worth of Jev calls per cache miss, same limits as a scan.
- Badge and card share `pipeline.js` with the scan, so the counts always match what the page shows.
- If a scan fails, the badge says "scan failed" and the card shows the clew with no counts. Never a broken image.
- Badge embed snippet is shown on the report page with a Copy button:
  `![README Clew 2](https://<live URL>/api/badge?repo=owner/name)`
- Each `?repo=` page sets `og:image` to `/api/og?repo=owner/name`, so pasting the link into LinkedIn or X shows the card.

Image rendering library for the card is chosen in spike S6.

---

## 3e. Scan receipt and build usage report (M21)

Modeled on Praxi Clew's `usage_report.md` and `trace`. The receipt records each scan. The usage report records the build week.

### Scan receipt (inside every report, and in the JSON export)

```json
"receipt": {
  "runId": "scan_7f3a91c2",
  "scannedAt": "2026-10-09T18:22:04Z",
  "repo": "owner/name",
  "commit": "a1b2c3d",
  "readmeSha256": "...",
  "reportSha256": "...",
  "lines": { "total": 120, "decidedByRule": 82, "decidedByJev": 38, "lowConfidence": 3 },
  "calls": [
    { "provider": "Glasser", "model": "jev-1.13.0", "calls": 3, "inputTokens": 52000, "costUsd": "0.0024" },
    { "provider": "Anthropic", "model": "<haiku id>", "calls": 1, "inputTokens": 310, "outputTokens": 90, "status": "ok | timeout | skipped" }
  ],
  "stepsMs": { "github": 640, "rules": 12, "jev": 310, "verifiers": 25, "haiku": 1900 },
  "architecture": "Rules and verifiers decide what's true. Jev labels lines. Haiku explains."
}
```

Rules:

- Built by `receipt.js` from counts code already has. No model writes any part of it.
- `reportSha256` is the fingerprint of the report without the receipt, so anyone can re-check it from the JSON export.
- Shown on the page as a collapsed "Receipt" panel under the footer, and in full in the JSON export.
- Nothing is stored server-side (N2 holds). Badge and card requests produce a receipt but don't return it.
- Jev cost is exact: Glasser returns `charge_usd` per run. Haiku cost is an estimate from published per-token prices, labeled "est."

### Build usage report (`evaluation/usage_report.md`)

- Every real Jev and Haiku call made from the build machine (Block 2 onward: evals, live checks, demo recording) appends one line to `evaluation/usage-log.jsonl`: time, run id, purpose, model, calls, tokens, est. cost. Counts only, never content (N9).
- `node tools/usage-report.js` turns the log into `evaluation/usage_report.md`: totals, per-model table, est. cost against the $11 Glasser balance, and the architecture note.
- Spike calls (Block 0) are recorded by hand in LEDGER.md, since spike code isn't kept.
- Production calls on Vercel are not logged (N2). The Glasser dashboard is the source for those, and the report says so.
- AdaL's own session logs (HTML, one per session) are copied into `build-record/` as the record of how the code was built. AdaL's completion checks also use Jev; the build summary mentions it.

---

## 4. Model authority check

### 4.1 Jev: label each line

```
Responsibility:      Label a README line by claim type
Role:                Investigator
Why probabilistic:   README prose is irregular human writing
Stays deterministic: line splitting, line numbers, quote text,
                     every Verified/Contradicted decision
Verified by:         Schema (Jev cannot return a type outside the list)
                     + verifiers check every labeled claim against code
On failure:          Mislabel -> wrong verifier runs -> usually Unverifiable.
                     Low confidence never reaches Contradicted (gate).
                     Glasser error -> scan returns an honest error state
Ordinary software:   Regex alone was considered. It cannot tell "we use React"
                     from "inspired by React". Kept as the candidate finder
```

Choice options for claim type:

| Option | Meaning |
|---|---|
| `dependency` | Says a package is used |
| `command` | Documents a command to run |
| `env_var` | Mentions an environment variable the code reads |
| `file_or_url` | Points to a path or link |
| `unverifiable` | A claim code cannot check ("blazingly fast", "85 tests") |
| `not_a_claim` | Headings, prose, thanks, licenses |

### 4.2 Jev: pick the real name

```
Responsibility:      Choose which code-found candidate is the real name
Role:                Investigator
Why probabilistic:   "Frontend (Vite)" vs "vite" needs reading, not matching
Stays deterministic: the candidate list itself (regex), the final lookup
Verified by:         The verifier looks the chosen name up in package.json / code
On failure:          Wrong pick -> verifier finds nothing -> Unverifiable,
                     never Contradicted when confidence is low
Ordinary software:   Single-candidate lines skip Jev entirely
```

Only lines with 2+ candidates get this question. Jev chooses from at most 255 options; candidates per line will be far below that.

### 4.3 Haiku: summary and bucket notes

```
Responsibility:      Explain finished findings in plain words
Role:                Presenter
Why probabilistic:   It's writing for people
Stays deterministic: every count, bucket, and finding it describes
Verified by:         A human can compare the summary to the buckets on screen
On failure:          9 s timeout or error -> no bubble text, mascot shows a
                     fixed line from mood.js, findings still render
Ordinary software:   A template sentence. Rejected as too narrow (owner call, Oct 7)
Input:               Bucket counts, claim types, regex-validated names only.
                     No README text, no quotes, no code (N7)
```

### 4.4 Wrapper test

Remove Jev and Haiku. What's left: a repo fetcher, a line splitter, a candidate finder, and five verifiers that still work on single-candidate lines. Not a wrapper.

---

## 5. Mascot (the clew)

An original ball of thread with a loose end. Not based on any existing character.

| Signal | Source | Rule (pure function in `mood.js`) |
|---|---|---|
| Speech bubble | Haiku summary | Fallback: fixed line per mood |
| Mood: tangled | Verifiers | Any Contradicted |
| Mood: worried | Verifiers | No Contradicted, any Missing |
| Mood: curious | Verifiers | Mostly Unverifiable |
| Mood: calm | Verifiers | Everything else |
| Head tilt | Jev | Any low-confidence finding |

Poses are hand-made SVG states. No generated art at runtime.

---

## 6. Distribution

| Route | How | For |
|---|---|---|
| Live page | Vercel URL with a demo repo pre-filled | Judges with no install. Listed first everywhere |
| Load unpacked | GitHub release ZIP, `chrome://extensions`, Developer mode, Load unpacked | Judges, devs |
| Bookmarklet | Drag to bookmarks bar. Opens live page with `?repo=` | Everyone else, any browser |

The bookmarklet only navigates. It never fetches from inside GitHub's page.

### "Try it" section for the README (judge install steps)

```
Fastest (no install, 30 seconds)
  1. Open <live URL>. A demo repo is already filled in.
  2. Click Scan.

Chrome extension (2 minutes)
  1. Download readme-clew-2-extension.zip from the latest GitHub release.
  2. Unzip it.
  3. Open chrome://extensions and turn on Developer mode (top right).
  4. Click "Load unpacked" and pick the unzipped folder.
  5. Open any public JS/TS repo on GitHub, click the clew icon, click Scan.

Bookmarklet (any browser)
  1. Drag the "Scan this repo" button from the live page to your bookmarks bar.
  2. On any GitHub repo, click it. The live page opens with that repo filled in.
```

Each step gets a screenshot in the README. The release notes repeat the extension steps.

### Demo video (AdaL Video Producer)

Under 2 minutes. AdaL makes it from screen recordings and stills we capture; this is visible proof of "Effective use of AdaL" across the workflow, not only coding.

| Beat | Shows |
|---|---|
| 1 | The problem: a README that says `npm start` and a package.json that doesn't have it |
| 2 | Live page scan, the clew going "tangled", the Contradicted row with its line link |
| 3 | Footer split: decided by rules vs decided by Jev, with a confidence bar |
| 4 | Extension popup on a real repo |
| 5 | One line on how it was built: AdaL + Jev via Glasser + Haiku |

The video file is generated after Block 7, so it shows the real deployed product.

---

## 7. Security and the floor

### 7.1 Keys

| Key | Lives in | Never in |
|---|---|---|
| Glasser | Vercel env var | extension, page, repo, logs, agent prompts |
| Anthropic | Vercel env var | same |
| GitHub token | Vercel env var | same |

### 7.2 Floor items (live from the first run, every tier)

| # | Item | Rule |
|---|---|---|
| 2 | Validation | URL must match `github.com/owner/repo`. Body <= 4 KB. README truncated at 50 KB |
| 4 | Outbound rate | Jev in batches of up to 100 questions (about 3 calls for a typical README), one Haiku call per scan. GitHub calls capped |
| 6 | Errors | `try/catch` on every fetch. Every failure has a visible, honest message |
| 8 | Logging | Request id, path, status, timing, counts only |
| 9 | Cost bounds | Glasser balance is prepaid ($11). Anthropic spend cap set before Block 4 |
| 11 | Prompt injection | README never reaches Haiku. Jev only returns typed answers. Injection fixture in tests |

### 7.3 CORS

The extension calls the API through `host_permissions`. The API allows only its own site origin for browser requests.

### 7.4 Rate limiting (honest version)

In-function per-IP limits on serverless are best effort, because instances don't share memory. Real protection is the prepaid Glasser balance and the Anthropic spend cap.

Spike S5 (LEDGER.md): Vercel Hobby allows 1 rate-limit rule per project (and 3 custom firewall rules total), keyed by IP or JA4, fixed window of 10 s to 10 min, counted per region so not exact. Plan: one rule covering `/api/scan`, `/api/badge`, and `/api/og` together. Source: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

### 7.5 11-point pre-deploy checklist (Full tier)

| # | Item | Plan |
|---|---|---|
| 1 | Authorization | N/A: no accounts, public repos only |
| 2 | Validation / sanitization | 7.2 |
| 3 | CORS | 7.3 |
| 4 | Rate limiting | 7.4 |
| 5 | Password reset expiration | N/A: no auth |
| 6 | Frontend error handling | Error, empty, and timeout states in popup and page |
| 7 | Database indexes | N/A: no database |
| 8 | Logging | 7.2 |
| 9 | Alarms | Glasser balance + Anthropic cap |
| 10 | Rollback | Vercel instant rollback to last good deploy |
| 11 | Prompt injection | 7.2 |

---

## 8. Spikes (Block 0, Spike tier)

Each spike answers one yes/no question. Either answer ends it. Results go in LEDGER.md before any code is discarded.

| Spike | Question | Pass if |
|---|---|---|
| S1 | Can a script call Jev through Glasser and get a typed answer? | One Choice answer with probabilities and confidence comes back |
| S2 | Does Jev label README lines well enough? (10 lines from 2 fixtures) | At least 8 of 10 land in the right claim type. Note the confidence where it's wrong; that sets the threshold |
| S3 | Can one call handle a whole README? | A typical README in one call, under 5 s, cost under $0.01. If not, record the batch size that works |
| S4 | Can the MV3 popup call a Vercel function? | Popup gets a JSON response from a hello-world function |
| S5 | Does Vercel's free plan offer a firewall rate rule? | Yes or no, recorded. No code |
| S6 | Can a Vercel function render a 1200x630 PNG card? (check the library is current, not deprecated) | A hello-world card renders on the deployed function in under 3 s |

`Tier: Spike. No tests, no pinning, no sync scripts. Answer the question, commit, stop.`

---

## 9. Build order

| Block | Scope | Disposition | Tier |
|---|---|---|---|
| 0 | Spikes S1-S6 | discard (findings to LEDGER) | Spike |
| 1 | `segment`, `candidates`, five verifiers, `buckets`, `gate`, `mood` on fixtures with mocked Jev answers. No network | promote | Working |
| 2 | `jev.js` + `questions.js` via Glasser, swapped in for the mock. Batches of 100. Compare README-as-state against line-as-state and keep whichever gives higher confidence on verifier-bound lines. Set the final gate threshold | promote | Working |
| 3 | `github.js` + `/api/scan` with validation, limits, timeouts, logging floor, `receipt.js`, `usage.js` | promote | Full |
| 4 | `summarize.js` (Haiku), fail-open | promote | Full |
| 5 | Live page: render fixture JSON first, then wire to API. Mascot states. Deep links. Demo repo | promote | Full |
| 6 | Extension popup, same render module | promote | Full |
| 6b | JSON export, `/api/badge`, `/api/og`, `og:image` tags, badge copy snippet | promote | Full |
| 7 | Bookmarklet, release ZIP, README (with its own badge), screenshots, `usage_report.md` generated, AdaL session logs in `build-record/` | promote | Full |
| 8 | Demo video with AdaL Video Producer, screenshots | n/a | n/a |
| 9 | Social post, build summary, submission form | n/a | n/a |
| 10 | STRETCH X1, only if the done line is already met and submission is sent | promote | Full |

Every block ends with a QA checkpoint:

1. PASS or FAIL, checked on the deployed thing, not the repo.
2. Is anything from a spike still in this? Promote and re-rigor, or discard.
3. Does this move toward the done line? If the done line is met, stop.

---

## 9b. Test plan

All CI tests run offline: no Glasser, no Anthropic, no GitHub. Jev answers come from `fixtures/jev-mock/`. Every new test must be shown failing once (break the thing, watch it go red, restore) before it counts.

### Unit tests (Block 1, pure functions)

| File | Tests |
|---|---|
| `segment.js` | Line numbers match source. Code-fence lines kept. CRLF and LF give the same result |
| `prefilter.js` | One case per rule row in 3c, plus a line that must stay undecided |
| `candidates.js` | Finds `vite` in "Frontend (Vite)". Finds backticked commands, `UPPER_SNAKE`, paths, URLs. Finds nothing in plain prose |
| `gate.js` | Below threshold goes to Unverifiable. Low confidence never produces Contradicted |
| each verifier | One Verified, one Contradicted, one Missing case per verifier |
| `buckets.js` | Every finding lands in exactly one bucket |
| `mood.js` | One case per mood row in section 5, plus tilt |
| `report.js` | Output matches the schema in 3b. `quote` equals the source line exactly |
| `links.js` | Correct `?plain=1#L` link for nested README paths |
| `validate.js` | Rejects non-GitHub URLs, oversize bodies, missing fields |
| `badge-svg.js` | Counts render. Output is valid SVG. No input text reaches the SVG unescaped |
| `og-card.js` | Each mood gives a layout. A repo name at max length still fits |
| `export.js` | Downloaded JSON equals the report object exactly |
| `receipt.js` | Line counts add up (rule + Jev = total). `reportSha256` matches a re-hash of the report. No README text in the receipt |
| `usage.js` | Totals equal the sum of logged calls. Log lines contain no content fields |

### Fixture tests (Block 1 onward)

| Fixture | Purpose |
|---|---|
| Clean minimal README | Everything Verified |
| `npm start` vs `start:prod` | The headline Contradicted case |
| "Frontend (Vite)" prose | v1's false positive. Must not be Contradicted |
| Env var mentioned, never read | Contradicted |
| Code imports a package the README never mentions | Missing |
| Marketing claims ("blazingly fast") | Unverifiable |
| Empty README, no-claims README, monorepo | Edge cases |
| Injection README ("ignore previous instructions...") | Report is normal. Haiku input contains none of that text |

Each fixture has an expected report in `fixtures/expected/`.

### Product-promise test (Block 3)

Runs the whole pipeline on every fixture, twice:

1. Normal (mocked Jev, mocked Haiku): four buckets, every finding has quote, evidence, and `decidedBy`.
2. Jev and Haiku forced to fail: the scan returns an honest error for Jev, and a complete report with `notes: null` for Haiku.

### Live checks (manual, not CI, costs money)

| Check | When | Pass |
|---|---|---|
| Jev label eval on the golden set | After Block 2 | At least 8 of 10 lines labeled right (same bar as spike S2). Run twice and record how many labels drift |
| Deployed scan of 3 real repos | Every Full-tier block | Report renders, timings in `meta.ms` under 10 s |
| Badge in a real README, card in a real LinkedIn/X preview | Block 6b | Badge shows counts on GitHub. Pasted link shows the card |
| Extension load-unpacked from the release ZIP | Block 7 | Works on a clean Chrome profile |

### Standing harness

| Check | What |
|---|---|
| Lint | Correctness rules only, in CI |
| Caught failures become tests | Every bad Jev label found in an audit is saved with its input. Caught: must stay caught. Known limit: pinned as an expected failure that turns red the day it starts passing |
| CI | Unit + fixture + product-promise tests on every push |

---

## 10. Schedule

| Day | Plan |
|---|---|
| Wed Oct 7 (night) | PRD approved, AGENTS.md, repo created, Block 0 |
| Thu Oct 8 | Blocks 1-2 |
| Fri Oct 9 | Blocks 3-5 |
| Sat Oct 10 | Blocks 6, 6b, 7, 8 (extension, export/badge/card, release, demo video). **Ship by 8 PM PT** |
| Sun Oct 11 | Buffer, social post, submit. Hacktoberfest Week 1 also due |

---

## 11. Tools and longevity

| Tool | Use | Check |
|---|---|---|
| AdaL desktop app (Preview) | Builds everything. `@PRD.md` + AGENTS.md (read every turn) for context | Confirmed running on Windows Oct 7. Engineer mode is CLI-only; not used. Image paste doesn't work on Windows; use `@file` |
| Jev (pinned jev-1.13.0, via Glasser) | Line labels, name picks | Pinned so labels don't shift mid-week |
| AdaL Video Producer | Demo video | Built into AdaL, loads on request |
| Glasser | Paid access to Jev, $11 credit | `POST https://api.glasser.ai/v1/runs`, provider `typesafe`, endpoint `/v1/systemone`. Max 100 questions per call, 45 s deadline, failed runs charge $0. Also eligible for "Best use of Glasser" |
| Claude Haiku 4.5 | Summary | Confirm model id is current before Block 4 |
| Vercel (Hobby) | Live page + function | 300 s max duration, 2 GB memory |
| Chrome MV3 | Extension | Current extension platform |
| TypeSafe agent skill | Teaches AdaL Jev patterns | Try `@skills:gh:typesafe-ai/skills/skills/typesafe-ai`. Not in AdaL's docs, so fallback: copy SKILL.md into `.adal/skills/typesafe-ai/` |
| record-demo-video skill | Captures screen recordings of the live app with Playwright | AdaL Video Producer needs footage supplied; it doesn't record the screen |

---

## 12. Honest limitations (ships in the README)

- JavaScript and TypeScript only.
- Public repos only.
- Jev's labels are calibrated, not perfect. Low-confidence calls are shown as Unverifiable, which means some real drift will be reported as "can't tell."
- The verifiers check names and existence, not meaning. A README that says `npm test` runs 85 tests is checked for the `test` script, not the count.
- Monorepo discovery uses conventional folder names only.
- Rate limiting is best effort. The real ceiling is the prepaid Glasser balance.
- Jev's labels can shift slightly between identical runs, even with the model pinned. A scan run twice may differ on a few lines.

---

## 13. Open questions

| # | Question | Who | Blocks |
|---|---|---|---|
| Q1 | What does "Workflows or Sandboxes" mean in the build summary? | AdaL Discord | Submission |
| Q2 | ~~Is a successor to an earlier project allowed if all code is new?~~ Resolved Oct 7: yes | AdaL Discord | Done |
| Q3 | ~~Carry over badge / social cards / JSON export?~~ Resolved Oct 7: all three are MUST, built new | Owner | Done |
| Q4 | ~~Exact Glasser request format for Jev~~ Resolved Oct 8 in spike S1 (see section 11, Glasser row) | Spike S1 | Done |
