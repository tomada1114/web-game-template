import { builtinModules } from "node:module";

import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * The `export *` ban for workspace source.
 *
 * @remarks
 * A package entry re-exports each symbol by name, so what it exposes is
 * readable in a diff of that one file.
 */
const NO_EXPORT_STAR = {
  selector: "ExportAllDeclaration",
  message:
    "`export *` exposes symbols implicitly. Re-export each symbol by name from the package's src/index.ts.",
};

/** Every Vitest file: repository-level, and each workspace package's own. */
const TEST_FILES = ["tests/**/*.ts", "packages/*/test/**/*.ts", "apps/*/test/**/*.ts"];

/** Globals that exist only in Node. */
const NODE_GLOBALS = [
  "process",
  "Buffer",
  "global",
  "__dirname",
  "__filename",
  "require",
  "module",
  "exports",
  "setImmediate",
  "clearImmediate",
];

/** Globals that exist only in a browser page. */
const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "fetch",
  "XMLHttpRequest",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "alert",
];

export default defineConfig([
  // Only generated trees are ignored; everything hand-written is linted,
  // including repository automation and config files. `.claude/skills/` is a
  // generated mirror of `.agents/skills/` (`pnpm agents:sync`), where the real
  // files are linted at their real path — linting the copy too would report
  // the same violation twice, at a path nobody may edit.
  // `.claude/worktrees/` holds full working copies created by agent sessions,
  // linted in their own checkout.
  // A `tests/fixtures/` file is malformed on purpose, so linting it reports
  // the very defect a test asserts on. Build output (`apps/*/dist/`, the
  // portal package under `.package/`, and the declarations `tsc -b` writes to
  // `.tsbuild/`) is bundled or emitted code no tsconfig includes, so a lint
  // after a build would otherwise fail on files nobody wrote.
  globalIgnores([
    "dist/",
    "apps/*/dist/",
    ".package/",
    ".tsbuild/",
    "coverage/",
    ".claude/skills/",
    ".claude/worktrees/",
    "tests/fixtures/",
  ]),
  {
    linterOptions: {
      // A disable directive that no longer suppresses anything is dead weight
      // that hides the next real violation.
      reportUnusedDisableDirectives: "error",
    },
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          // `@ts-ignore` hides an error forever; `@ts-expect-error` fails once
          // the underlying problem is gone, so it is the only allowed escape
          // hatch and it must say why.
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "no-console": "error",
    },
  },
  {
    name: "source/explicit-exports",
    files: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
    rules: {
      // A default export has no stable name for an importer to use, or for a
      // reviewer to read a diff of.
      "no-restricted-exports": [
        "error",
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      "no-restricted-syntax": ["error", NO_EXPORT_STAR],

      // A `switch` over a union is the one place where adding a member to that
      // union silently changes behavior instead of failing to compile. With
      // `considerDefaultExhaustiveForUnions`, a `default` branch is accepted as
      // the deliberate answer, so this asks for a decision rather than for a
      // case per member.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
  {
    // packages/core's tsconfig already compiles with no DOM and no Node types;
    // this names the boundary at the import or the reference itself, so the
    // message says why instead of only "Cannot find name".
    name: "boundaries/core-is-runtime-free",
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                ...builtinModules.filter((name) => !name.startsWith("node:")),
              ],
              message:
                'packages/core runs without Node: see "Architecture" in AGENTS.md. Read the value in apps/web and pass it in.',
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...NODE_GLOBALS.map((name) => ({
          name,
          message:
            'packages/core runs without Node: see "Architecture" in AGENTS.md. Read the value in apps/web and pass it in.',
        })),
        ...DOM_GLOBALS.map((name) => ({
          name,
          message:
            'packages/core runs without a DOM: see "Architecture" in AGENTS.md. Read the value in apps/web and pass it in.',
        })),
      ],
    },
  },
  {
    name: "boundaries/core-through-its-entry",
    files: ["apps/**/*.ts"],
    rules: {
      // Core's entry is its package name, whose `exports` map names only
      // packages/core/src/index.ts. A relative path into its source tree would
      // reach modules that entry deliberately does not expose.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/packages/*/src", "**/packages/*/src/**"],
              message:
                'Import a workspace package by its name, never by a path into its source: see "Architecture" in AGENTS.md.',
            },
          ],
        },
      ],
    },
  },
  {
    name: "automation/node-scripts",
    files: ["scripts/**/*.mjs", ".agents/skills/**/*.mjs"],
    rules: {
      // These files are the CLI surface of repository automation.
      "no-console": "off",

      // Automation must run on plain Node before `pnpm install`, so it is
      // authored as `.mjs` and declares its boundary types in JSDoc, which
      // `checkJs` enforces just as strictly. This rule only recognises
      // TypeScript annotations, so leaving it on would demand syntax that is
      // not valid JavaScript.
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  {
    name: "web/platform-diagnostics",
    files: ["apps/web/src/platform/**/*.ts"],
    rules: {
      // The platform adapter is where the game meets a portal SDK or the
      // browser, so it is the one place a warning or a debug trace is the
      // product. `console.log` stays an error even here.
      "no-console": ["error", { allow: ["warn", "debug"] }],
    },
  },
  {
    // The `writing-tests` skill states these rules in prose; this is what enforces the
    // ones a linter can see. The recommended set is taken as published and the
    // escalations below are the entries this repository will not run on
    // "warn", starting with the two that quietly shrink the suite.
    ...vitest.configs.recommended,
    name: "tests/vitest-rules",
    files: TEST_FILES,
    rules: {
      ...vitest.configs.recommended.rules,

      // "No it.skip/it.todo left on main" and "a focused test never lands".
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",

      // An assertion outside a test reports nothing when it fails, and a test
      // with no assertion passes whatever the code does. `expectTypeOf` is
      // listed because a type test asserts entirely at compile time —
      // those tests have no runtime `expect` and are not meant to.
      "vitest/no-standalone-expect": "error",
      "vitest/expect-expect": [
        "error",
        { assertFunctionNames: ["expect", "expectTypeOf"] },
      ],
      "vitest/valid-expect": "error",

      // One spelling, so a search for a test finds every one of them.
      "vitest/consistent-test-it": ["error", { fn: "it" }],

      // `vitest/require-top-level-describe` is deliberately left off. Several
      // suites here own a fixture for the whole file — a temp git repository,
      // a packed tarball — and set it up in a file-level `beforeAll`, which
      // this rule forbids. Satisfying it would mean wrapping five whole files
      // in an extra describe for no gain in what the tests assert.
      //
      // `vitest/no-conditional-expect` comes from the recommended set and is
      // turned off for the same kind of reason: AGENTS.md prescribes
      // asserting on a caught error inside `catch`, and the workflow and
      // bootstrap suites branch on what the repository actually contains
      // before asserting against it.
      "vitest/no-conditional-expect": "off",
    },
  },
  {
    name: "tests/relaxations",
    files: TEST_FILES,
    rules: {
      // Tests deliberately construct invalid input to prove it is rejected.
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },
  // Must stay last: turns off stylistic rules that would fight Prettier.
  eslintConfigPrettier,
]);
