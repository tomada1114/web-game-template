---
paths:
  - "CLAUDE.md"
  - ".claude/rules/*.md"
  - ".claude/skills/**/*.md"
  - ".claude/agents/*.md"
---

# Writing guidance for agents

Every line here is copied into every game generated from this template and is paid for
in context there. Add the least that changes behavior, and remove what nothing loads.

## Where a new instruction goes

Take the first that fits:

1. **A config can enforce it** → put it in the config; write nothing, or one line naming
   the gate.
2. **A current model does it unprompted, or the neighbouring code shows it** → write
   nothing.
3. **It must hold before the task is known** (approval, secrets, the gate prohibition) →
   `CLAUDE.md`. Keep that file under 120 lines.
4. **It is met mid-task in particular files** → a rule under `.claude/rules/` with a
   `paths` list. Rules load when a matching file is read, so they must be short, and a
   glob that matches no tracked file is dead: `tests/skills-frontmatter.test.ts` fails
   on one.
5. **It is a procedure someone asks for by name or intent** (ship an issue, land bot
   pull requests) → a skill under `.claude/skills/<name>/SKILL.md`.

One fact, one place: point at the owner instead of restating it, and never quote a
config value into prose.

## Skills

- Frontmatter is `name` (identical to the directory name) and `description`. The
  description is the trigger: the situations, commands, and error strings that should
  load the skill, never a summary of its workflow. English only; the length cap and the
  shape are enforced by `tests/skills-frontmatter.test.ts`.
- One directory level under `.claude/skills/`, no nested file named `SKILL.md`, no
  symlinks. Keep `SKILL.md` under 200 lines and move detail into `<skill>/references/`,
  linked by relative path.
- Name only skills and files that exist. A backticked repository path in any Markdown
  file must resolve in a generated repository.
- Name sub-agent tiers by role (`executor`, `architect`, `scout`, `worker`), never by
  model or effort. The files under `.claude/agents/` are generated copies; do not edit
  them by hand.

Skills, rules, and this file are formatted and spell-checked like any other source: run
`pnpm fix` after editing one.
