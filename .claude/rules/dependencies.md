---
paths:
  - "package.json"
  - "pnpm-workspace.yaml"
  - "pnpm-lock.yaml"
  - ".github/dependabot.yml"
---

# Dependencies

Open bot pull requests are landed with the `merge-dependabot` skill; this file decides
whether a package may be here at all and what happens at install time.

## Adding a runtime dependency

It is a permanent supply-chain commitment. The pull request that adds one records:

- why a small helper or a Node builtin cannot replace it (`node:util`'s `parseArgs`
  already covers subcommands and strict flags);
- maintenance and release continuity; license (MIT/BSD/Apache-class; copyleft in the
  shipped bundle needs a deliberate reason); open advisories and npm provenance;
- direct and transitive package count, unpacked size, and effect on the built bundle;
- any install script, native binary, or network access, each justified (an install
  script also needs an `allowBuilds` entry);
- supported Node versions and module format against this package's `engines`;
- which dependency field it belongs in, and why.

## How a change lands

- Add or bump with `pnpm add`, never by typing a version into `package.json`; the
  manifest and the regenerated `pnpm-lock.yaml` go in one commit.
- A runtime dependency declares a SemVer range, not a pin: the lockfile owns
  reproducibility.
- Dev dependencies are kept current by bot pull requests, not by hand.

## The release-age cooldown

`pnpm-workspace.yaml` sets `minimumReleaseAge`: a version published too recently does
not resolve. A `^` or `~` range silently resolves to an older, cooled version (expected,
not a bug); an exact pin on a too-young version fails the install. Check how long the
target version has been out before bumping.

Exception, for an urgent security fix only: a human approves one exact `package@version`
entry in `minimumReleaseAgeExclude`. The same pull request cites the advisory, explains
why waiting is riskier, includes the regenerated lockfile, and says when the entry will
be removed. Never a wildcard or an unversioned entry.

## What each supply-chain setting means when it fires

The values live in `pnpm-workspace.yaml`. When one fires, find out why the install is
failing; relaxing it is ruled out in `CLAUDE.md`.

- `strictDepBuilds` with `allowBuilds`: an install script from a package that is not
  allowlisted fails the install on purpose. `lefthook` is the one reviewed entry (its
  postinstall links the hook binary). Another entry weighs as much as a new dependency.
- `strictPeerDependencies`: an unmet or conflicting peer range of an installed
  dependency is a hard failure. This is what makes the TypeScript ceiling real.
- `minimumReleaseAgeStrict` and `minimumReleaseAgeIgnoreMissingTime` close two cooldown
  bypasses: an already-locked version, and registry metadata with no publish time.
- `trustPolicy`, `trustLockfile`, `blockExoticSubdeps`: reject a provenance regression,
  distrust trust metadata in a contributor's lockfile, and refuse transitive
  dependencies from git or tarball URLs.
- `verifyDepsBeforeRun: error`: a `pnpm run` against a stale `node_modules` fails. The
  fix is `pnpm install`.

## The TypeScript ceiling

`typescript` stays below the version `typescript-eslint` caps its peer range at. Do not
"upgrade typescript to latest": raising the ceiling is a coordinated upgrade that waits
for `typescript-eslint`. To test against a version the ceiling forbids, install it in a
fixture project under `tests/fixtures/` and drive it as a child process.

pnpm auto-installs an unmet peer of this package at the highest matching version, and a
`devDependencies` entry for the same package wins without a warning even outside the
peer range; no gate checks that a declared peer range is satisfiable.
