# The corpus

Three real public repos, frozen at one commit, run through the same pipeline as production.
The point is to measure the checks that need no model, on code nobody wrote for us — and to notice
the day one of them starts saying something wrong.

`repos/<fixture>.json` is the input (README, file tree, package.json files, the source files the scan would read).
`expected/<fixture>.json` is the whole report the pipeline produces for it.
`audit/<fixture>.json` is the part a script cannot do: one verdict per finding, checked against the frozen files.

## What the numbers mean

Refreshed with `node scripts/freeze-corpus.mjs`. Jev is not part of this corpus, so a line the pre-filter
does not decide stays undecided and is counted, never judged. Every number below is about that first half.

| repo | commit | README lines | left to Jev | verified | unverifiable | missing | contradicted |
|---|---|---:|---:|---:|---:|---:|---:|
| chalk/chalk | `7211001` | 331 | 191 | 1 | 2 | 2 | 0 |
| hoppscotch/hoppscotch | `55908a7` | 299 | 192 | 0 | 0 | 27 | 0 |
| pallets/flask | `49943b5` | 54 | — | — | — | — | — |

Flask has no `package.json`, so the scan stops before Jev and says so. That row is the Python question
as it stands today, with nothing to measure until there is an adapter.

## What the audit found

32 findings, and not one of them asks a maintainer to edit the README:

| verdict | count | what it is |
|---|---:|---|
| `false` | 2 | chalk imports `#ansi-styles` and `#supports-color`. Both are package subpath imports, declared under `"imports"` in chalk's own `package.json`. The finding says they are not listed, which is wrong |
| `no_action` | 27 | every hoppscotch Missing comes from a build or test entry point (`vite.config.ts`, `eslint.config.mjs`, `tsup.config.ts`, `prisma.config.ts`, `tailwind.config.ts`, …), not from a file the published packages import at runtime |
| `correct` | 3 | chalk: the install command, and two env vars that stay Unverifiable because not all source files were read |

One class is measured but not frozen, because its snapshot is 340 KB: `sindresorhus/got` reports 4 Missing,
and 3 are imports written inside a `/** @example */` block — `import {z} from 'zod';` on line 29 of
`source/as-promise/types.ts` is documentation, not code. The fourth is `create-cert`, a devDependency
imported by `benchmark/server.ts`. The same scan also finds nothing wrong with got's README, so this is
noise, not a false accusation of the README.

## The rules of this corpus

- A finding may be `false` only with a reason in `audit/`, and `tests/corpus.test.js` fails when a finding
  appears without a verdict. The false count is a ratchet: it can go down when the bug is fixed, never up.
- `contradicted` must stay at 0 on every repo. That is the promise, and this file is where it is measured.
- Refreshing a repo rewrites `repos/` and `expected/`, and the audit has to be reviewed again by hand.

## Licenses

The frozen files are verbatim copies of public repositories, kept only as test input. Nothing here
implies authorship, and the licences stay with their projects:

| repo | commit | license |
|---|---|---|
| chalk/chalk | `7211001` | MIT |
| hoppscotch/hoppscotch | `55908a7` | MIT |
| pallets/flask | `49943b5` | BSD-3-Clause |

