# AGENTS.md - README Clew 2

Read this every session. The spec is `PRD.md` (approved; check its Version line for the current revision). If anything here conflicts with PRD.md, PRD.md wins. Say so in one line and follow it.

## What this project is

A Chrome extension, a live web page, and one Vercel function that check whether a public GitHub repo's README matches its code. Rules and five deterministic verifiers decide what's true. Jev (via Glasser) labels README lines and picks names. Claude Haiku writes the summary from structured findings only.

## How we work (non-negotiable)

1. **Propose first.** Before editing, list the files you will create or change and what each change does. Wait for "approved."
2. **DO NOT refactor other code.** Touch only the files named in the current block.
3. **One block at a time.** Build order is PRD section 9. Stop at the end of the block for a QA checkpoint.
4. **Respect the tier in the prompt.** Spike: no tests, no pinning, no sync scripts, no README. Answer the question, commit, stop. Working: happy path plus known edge cases. Full: PRD section 7.5 checklist.
5. **Stub, don't build.** Anything not in the current block gets a comment stub with implementation notes, never a half-feature.
6. **Mock data first.** Render from `fixtures/` before wiring any API.
7. **Verify against files, not memory.** Read the file before claiming what it does.
8. **Log your work** in `BUILD-LOG.md` (what you did, block by block). Decisions and findings, including wrong turns, go in `LEDGER.md`.

## Scope labels

Every feature in PRD section 2 is MUST, STUB, STRETCH, or NEVER. NEVER means never, even if it looks easy. Key NEVERs:

- No private repos.
- No database. Nothing stored after a request, except the CDN cache of badge and card images.
- Jev and Haiku never decide Verified or Contradicted. Only the verifiers do.
- Raw README text never goes to Haiku.
- No scan on page load. Click only.

## Security rules (every file, every tier)

- `textContent`, never `innerHTML`, for any user or repo content. No `eval()`.
- Keys (`GLASSER_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`) live only in Vercel env vars, read via `process.env` inside `api/` and `lib/`. Never in `web/`, `extension/`, fixtures, logs, commits, or prompts.
- Validate input on the client AND the server. Never trust the front end.
- `try/catch` on every fetch, with a meaningful error state. Never a blank screen or a broken image.
- Logs hold request id, path, status, timing, and counts only. Never README text, code, prompts, or model output.
- `quote` in a finding is always copied by code from the README line. Never model output.

## Layout

```
api/          Vercel functions: scan.js, badge.js, og.js (thin, wiring only)
lib/          one file, one responsibility (see PRD section 3)
lib/verifiers/  dependencies, commands, envvars, references, coverage
web/          live page (static)
extension/    Chrome MV3 popup
bookmarklet/  bookmarklet source
fixtures/     readmes/, jev-mock/, expected/
```

No god files. One file, one purpose. If a file starts doing two jobs, propose a split.

- **Hard cap: 200 lines per file** in `api/`, `lib/`, `web/`, `extension/`, `bookmarklet/`. Fixtures, tests, and docs are exempt.
- The cap is enforced by `tests/file-size.test.js`, which fails `node --test` when any capped file goes over. Don't raise the cap or add exemptions without my approval.
- If a change would push a file over 200 lines, stop and propose the split first.

## Stack

- Node.js, plain JavaScript, ES modules. No framework, no build step for `web/` or `extension/`.
- Tests: Node's built-in test runner (`node --test`). All CI tests run offline with `fixtures/jev-mock/`. No network in tests.
- Jev model pinned to `jev-1.13.0`.
- Before adding any dependency: check it's current (docs, changelog, last release). Propose it first.

## Tests

- Every new test must be shown failing once (break the code, watch it go red, restore) before it counts.
- Every bad Jev label found in an audit becomes a saved fixture.
- PRD section 9b is the test plan.

## Writing rules (README, UI text, commit messages, docs)

- No em dashes.
- No filler words: delve, landscape, straightforward, genuinely, honestly, seamless, robust.
- Short, plain, honest. Limitations are stated, not hidden.
- Sign-off line in the README: "AI assisted. Human approved. Powered by NLP."
