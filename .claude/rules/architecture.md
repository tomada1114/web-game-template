---
paths:
  - "package.json"
  - "apps/web/package.json"
  - "pnpm-workspace.yaml"
  - "packages/core/src/index.ts"
  - "apps/web/src/platform/**"
  - "apps/web/vite.config.ts"
---

# Before changing the architecture

The design lives in one place per subject, as it stands now: the skill that owns the
subject, or `CLAUDE.md` for the layers and the product scope. Git history holds what it
used to be.

These changes are hard to reverse. The pull request that makes one also rewrites the
owning skill or section, in the present tense and in place of the sentences it replaces:
the current design, what it protects, and where it matters the alternative it rules out.

- a runtime dependency under `dependencies` in `apps/web/package.json` (`packages/core`
  has none); a devDependency only when it changes a gate
- a package boundary: a new workspace package, or a change to what may import what
- core's contract: what `packages/core/src/index.ts` exports, the replay record's shape,
  or what `RULES_VERSION` promises
- the determinism boundary: anything core may read beyond its arguments
- persistence: a `Platform.storage` key or value format, or how storage maps to a
  portal's data module
- an external service: a portal SDK, or any network request beyond it
- distribution: a new portal, the zip layout, or the release workflow
- the engine: a Phaser major version, or replacing the renderer
- the Node major in `package.json`'s `devEngines.runtime`

A new dependency still needs the owner's decision (`CLAUDE.md`, "Security and human
approval").
