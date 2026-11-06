---
name: updating-docs
description: >
  Decides whether a change needs a documentation update and which surface it lands on —
  README.md, docs/**, TSDoc in packages/core/src/** or apps/web/src/**, or CHANGELOG.md
  — for edits touching packages/core/src/index.ts, README.md, CONTRIBUTING.md, or
  docs/**. Use when triaging whether a PR needs a doc change, updating the README
  example after an API change, or deciding if an internal refactor needs no docs at all.
---

# Updating Documentation

**Owns:** whether a change needs a documentation update, and which surface it lands on.
**Does not own:** the PR body's release line and CHANGELOG entries (`releasing-builds`);
what the game core exports (`writing-game-core` § API and state).

## Decide on observability, not location

Documentation impact is decided by what a **user can observe**, not by which directory
the edit began in. An internal refactor, a test-only change, and skill maintenance under
`.agents/skills/` or `.claude/skills/` need no documentation change — say so explicitly.
Deciding that nothing is needed is a legitimate outcome of this skill, not a shortcut to
be double-checked away.

A change is user-observable when it alters a signature, a default, an observable runtime
behavior, an error's `code`, a supported Node version, or an installation step. If none
of those moved, stop here.

## Sweep the right surfaces

When a change is user-observable, sweep every surface it touches — do not stop at the
first one that seems relevant:

- The README example, if the change affects what it shows.
- The affected pages under `docs/**`.
- TSDoc comments in `packages/core/src/**` or `apps/web/src/**` for the symbol that
  changed.
- CHANGELOG.md, when the change implies a release. **REQUIRED:** follow
  `releasing-builds` for the release line and the entry itself; this skill only flags
  that one is owed.

The README example and any affected `docs/` page land in the same pull request as the
change they describe; this skill decides which surface the update belongs on.

## Purpose per file

Each file has one job; do not blur them:

- `README.md` — the value proposition readable in 30 seconds, the install command, a
  minimal working example, and supported Node/runtime versions. Nothing more.
- `CONTRIBUTING.md` — local setup, the main `pnpm` commands, how to run tests, release
  intent, and the PR process.
- `CHANGELOG.md` — owned by release pull requests; `releasing-builds` holds how an entry
  is worded.

## What belongs in prose

Document non-obvious behavior, architecture decisions, and trade-offs. Do not restate
what the code or the type system already says — the same principle TSDoc follows in
workspace source. If a reader could get the fact from the signature or from running the
code, it does not need a sentence here.

## Code examples must compile

No test compiles the fenced `ts` examples in README.md or the `@example` blocks in
workspace source, so nothing catches a stale snippet. A change to
`packages/core/src/index.ts` that breaks a documented snippet updates that snippet in
the same commit as the signature change.
