---
name: create-pr
description: >
  Use when opening or updating a pull request by hand, outside shipping-issues: asked to
  "open a PR", "create a pull request", "push this and make a PR", or to refresh the
  title or body of the PR already open for the current branch. Covers the preconditions
  (not on main, a clean tree, one PR per branch), running pnpm check first, a
  Conventional Commits title check-pr-title.yml accepts, filling
  .github/PULL_REQUEST_TEMPLATE.md's Summary, Release, Test Plan, and Checklist
  honestly, and git push, gh pr create, and gh pr edit.
---

# Create PR

**Owns:** opening a pull request for the current branch, or updating the one already
open for it: the preconditions, the gate run before it, the title, the body, and the
push. **Does not own:** shipping an issue end to end through CI and merge
(`shipping-issues`); landing a bot's dependency PR (`merge-dependabot`); making the
commits the PR carries (`smart-commit`).

`CLAUDE.md`'s "Security and human approval" sets the scope: a request for a pull request
covers the task branch, its commits, the push, and the PR, and stops there. Use
`smart-commit` for the commits.

Every step below ends in either the next step or a stop. A stop is reported with what
was found and what would clear it; it never becomes a PR with the problem left in it.

## 1. Preconditions

Gather the state before running anything:

```bash
git branch --show-current
git status --short
git fetch origin main
git log --oneline origin/main..HEAD
gh pr list --head <branch> --state open --json number,url,title
```

- **On `main`, or detached:** create a task branch before committing, preserving
  existing changes. Never commit on `main`.
- **Uncommitted or untracked changes:** separate this task's changes from unrelated
  work, then commit the task's changes with `smart-commit`. The gate must judge the
  committed tree the reviewer will see; do not include someone else's work.
- **No commits ahead of `main`:** stop; there is nothing to propose.
- **A PR already open for the branch:** update it in step 6 with `gh pr edit`. Never
  open a second PR for the same branch: the first one's review and CI history would be
  stranded on a duplicate.

## 2. The gate

Run `pnpm check`. It never rewrites a file, so a pass proves the _committed_ tree is
green. `pnpm fix` is the mutating step: it rewrites files and proves nothing about what
was committed.

- **A failure stops the PR.** Fix it on the branch, or report it. Formatting is fixed
  with `pnpm fix`, committed with `smart-commit`, and judged by running the gate again.
  Never weaken a gate to make it pass (`CLAUDE.md`).
- **A check this host cannot run** (a denied process or network permission) is reported
  as not run, with the exact command, its failure, and the CI job that covers it. Never
  describe the gate as passed, and never retry a denied command under another spelling.
- **Then `git status --short` again.** The gate writes only ignored output. Anything
  else that changed means the branch differs from what was judged: inspect it, commit
  the task's changes, and run the gate again.

`pnpm check` does not spell-check; the `Typos` workflow does, on the pull request. Where
`typos` is installed, `typos --config typos.toml` runs the same check locally. The Test
Plan names each command that ran.

## 3. Read the diff for what the gate cannot judge

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```

Each row feeds a line of the body or a checklist item:

| In the diff                                                                                               | Then                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A new package in a `package.json`                                                                         | Stop unless the owner already signed off on that package; then put the record `.claude/rules/dependencies.md` asks for in the body.     |
| A weakened gate (`CLAUDE.md`'s list: a lowered coverage threshold, a removed ESLint rule, a skipped test) | Stop. A human decides, and a legitimate gate change never rides in the PR whose red run it would turn green (`.claude/rules/gates.md`). |
| New behavior without a test that covers it                                                                | Stop and add the test. **REQUIRED:** `tdd`.                                                                                             |
| A change a player or a portal sees: the built game's behavior, its files or their URLs, an error `code`   | `Release: needed — <what the player sees>`. Everything else is `Release: none`.                                                         |
| A change under `packages/core/`                                                                           | Keep exactly one `Rules version:` line.                                                                                                 |
| A command, a setup step, or a default someone working here observes changed                               | `README.md` and the affected docs change on this branch.                                                                                |
| A removed or changed public behavior                                                                      | A breaking change: call it out in the Summary, in one line a reader can act on, and mark the title with `!`.                            |

A row that does not apply holds trivially; say so in the body rather than leaving the
reader to guess ("No new dependency").

## 4. Title

`<type>(<scope>)<!>: <summary>`, under 72 characters, in English. The title becomes the
squash-merge commit subject, so the type is not decoration.

- Choose a type from the `types:` input of `.github/workflows/check-pr-title.yml`, the
  accepted list. `.github/workflows/pr-label.yml` derives the PR's label from it; a type
  it maps to nothing gets no label.
- The scope is optional. When used, it is the area the change lives in, matching recent
  history (`git log --format=%s -20`).
- The summary is imperative and lower-case, with no trailing period, and says what the
  change does, not which files it touches.
- For a branch whose commits mix types, take the most significant one: `feat` over `fix`
  over the rest.

## 5. Body

Fill `.github/PULL_REQUEST_TEMPLATE.md` in its own order, keeping its headings, and
write it to a file outside the checkout (the scratch or temp directory the host
provides), so it never shows up as an untracked file in the tree the gate judged.

- **Summary.** One to three lines: what the change does and why, then any breaking
  change or dependency line step 3 called for. Then `Closes #N` on its own line when the
  branch resolves an issue; a bare `#N` closes nothing. Ask rather than guess when it is
  unclear which issue the branch closes.
- **Release.** Exactly one `Release:` line, decided in step 3. Exactly one
  `Rules version:` line when the diff touches `packages/core/`; otherwise delete both.
- **Test Plan.** The commands actually run, each with its verdict line (`pnpm check` →
  passed). For a behavior observed rather than asserted, the lines `running-the-app`
  says to keep. Never a command that was not run, and never a raw log.
- **Checklist.** Tick an item only when its evidence exists. A box ticked on trust is
  the one defect in this PR a reviewer cannot see.

## 6. Create or update

```bash
git push -u origin <branch>
gh pr create --base main --head <branch> --title "<title>" --body-file <body-file>
```

For a branch that already has an open PR, push, then update that PR instead:

```bash
gh pr view <number> --json title,body
gh pr edit <number> --title "<title>" --body-file <body-file>
```

Read the current body first and carry over anything a human added to it: `gh pr edit`
replaces the body whole.

- A push rejected as non-fast-forward stops: the remote branch has commits this checkout
  does not. Never force-push to get past it.
- `--body-file`, never an inline `--body` built from a heredoc or command substitution:
  the shell expands backticks and `$` in a body before `gh` sees them.
- Run no `--web` flag or anything else that opens a browser; print the PR's URL instead.

Report the URL, the title, and every checklist item as it was ticked. The PR is then the
requester's: watching CI and merging are not this skill's.
