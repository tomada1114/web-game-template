# Skill drafts

These files are the design decisions for the game template, written as the skills they
will become. They live here, outside `.agents/skills/`, until the code they describe
exists: a skill that names files which are not there yet would mislead an agent and fail
the bootstrap's dangling-reference scan.

- `<name>.md` becomes `.agents/skills/<name>/SKILL.md`; `designing-ui-lock.md` becomes
  `.agents/skills/designing-ui/references/design-lock.md`; `agents-md.md` is the target
  `AGENTS.md`. Relative links inside the drafts resolve after that move.
- Until then, a draft is the single home for its decisions. A decision that changes is
  rewritten here, in place, in the same change as the code.
- The last issue of the template MVP (listed in the tracking issue) promotes every draft
  in one change and removes this directory.
