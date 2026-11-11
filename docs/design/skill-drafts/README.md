# Skill drafts

These files are the design decisions for the game template, written as the skills they
will become. They live here, outside `.claude/skills/`, until the code they describe
exists: a skill that names files which are not there yet would mislead an agent and fail
the bootstrap's dangling-reference scan.

- `<name>.md` becomes `.claude/skills/<name>/SKILL.md`; `designing-ui-lock.md` becomes
  `.claude/skills/designing-ui/references/design-lock.md`; `agents-md.md` is the target
  `CLAUDE.md`. Relative links inside the drafts resolve after that move.
- The drafts were written before the repository became Claude Code only. Where one names
  `.agents/skills/`, `pnpm agents:sync`, `.codex/` or `AGENTS.md`, read
  `.claude/skills/` (no mirror, no sync step) and `CLAUDE.md`; a convention tied to
  particular files becomes a rule under `.claude/rules/` rather than a skill
  (`.claude/rules/guidance.md` has the placement test).
- Until then, a draft is the single home for its decisions. A decision that changes is
  rewritten here, in place, in the same change as the code.
- The last issue of the template MVP (listed in the tracking issue) promotes every draft
  in one change and removes this directory.
