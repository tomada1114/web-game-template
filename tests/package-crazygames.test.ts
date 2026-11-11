import { Buffer } from "node:buffer";
import consoleModule from "node:console";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import {
  ZipError,
  checkZip,
  createZip,
  main,
  readZip,
} from "../scripts/package-crazygames.mjs";

// Every run here packages a fixture repository in a fresh temporary
// directory, never this checkout: no real Vite build, and neither the real
// apps/web/dist nor the real .package/ is read or written. The fixture
// installs a stand-in for Vite where the script resolves the real one, so the
// script's own spawn, arguments and environment are what run.
//
// scripts/package-crazygames.mjs imports `console` from "node:console", so
// the spies target that module — see tests/clean.test.ts.

const ZIP_NAME = ".package/fixture-game-1.2.3-crazygames.zip";

// Records how it was called, then copies apps/web/portal-build to the
// requested output directory the way `vite build` writes one: to `dist`
// unless --outDir says otherwise, cleared first only under --emptyOutDir.
const STAND_IN_VITE = `
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(
  "vite-call.json",
  JSON.stringify({
    args,
    cwd: process.cwd(),
    platform: process.env.VITE_PLATFORM ?? null,
  }),
);
if (fs.existsSync("build-error.txt")) {
  process.stderr.write(fs.readFileSync("build-error.txt", "utf8"));
  process.exit(3);
}
const flag = args.indexOf("--outDir");
const outDir = flag === -1 ? "dist" : args[flag + 1];
if (args.includes("--emptyOutDir")) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
if (fs.existsSync("portal-build")) {
  fs.cpSync("portal-build", outDir, { recursive: true });
}
`;

const INDEX_HTML =
  '<!doctype html>\n<script type="module" src="./assets/game.js"></script>\n';

type Tree = Record<string, string | Buffer>;

const workspaces: string[] = [];
let stdout: MockInstance<typeof consoleModule.log>;
let stderr: MockInstance<typeof consoleModule.error>;

function writeTree(directory: string, tree: Tree): void {
  for (const [relative, content] of Object.entries(tree)) {
    const file = path.join(directory, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

/**
 * A fixture repository whose portal build produces `build`, with a local
 * build already sitting in apps/web/dist.
 */
function makeRoot(build: Tree, overrides: Tree = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "package-crazygames-test-"));
  workspaces.push(root);
  writeTree(root, {
    "package.json": JSON.stringify({ name: "fixture-game", version: "9.9.9" }),
    "apps/web/package.json": JSON.stringify({
      name: "@fixture-game/web",
      version: "1.2.3",
    }),
    "apps/web/node_modules/vite/package.json": JSON.stringify({
      name: "vite",
      bin: { vite: "bin/vite.js" },
    }),
    "apps/web/node_modules/vite/bin/vite.js": STAND_IN_VITE,
    "apps/web/dist/index.html": "<!doctype html>\n<p>the local build</p>\n",
    "apps/web/dist/assets/local.js": "export const platform = 'local';\n",
    ...overrides,
  });
  writeTree(path.join(root, "apps/web/portal-build"), build);
  return root;
}

/** A fixture file's content as bytes; a name the fixture lacks matches nothing. */
function asBuffer(content: string | Buffer | undefined): Buffer {
  return typeof content === "string"
    ? Buffer.from(content)
    : (content ?? Buffer.from("not in the fixture"));
}

/** Every file under a directory, keyed by slash-separated relative path, as hex. */
function snapshot(directory: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = path.join(entry.parentPath, entry.name);
        return [
          path.relative(directory, file).split(path.sep).join("/"),
          readFileSync(file).toString("hex"),
        ];
      }),
  );
}

/** Everything the script printed to one stream, as a single string. */
function printed(spy: MockInstance): string {
  return spy.mock.calls.map((call) => String(call[0])).join("\n");
}

function caught(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

interface StoredFile {
  name: string;
  data: Buffer;
  method: number;
  recordedCrc: number;
  recordedSize: number;
}

/**
 * Read an archive the way a streaming unzip does: walk the local file headers
 * from byte 0, with no help from the central directory the script's own
 * reader relies on. Returns the files and the offset the walk stopped at.
 */
function walkLocalHeaders(archive: Buffer): { files: StoredFile[]; end: number } {
  const files: StoredFile[] = [];
  let cursor = 0;
  while (archive.readUInt32LE(cursor) === 0x04034b50) {
    const compressedSize = archive.readUInt32LE(cursor + 18);
    const nameStart = cursor + 30;
    const nameEnd = nameStart + archive.readUInt16LE(cursor + 26);
    const dataStart = nameEnd + archive.readUInt16LE(cursor + 28);
    files.push({
      name: archive.toString("utf8", nameStart, nameEnd),
      data: inflateRawSync(archive.subarray(dataStart, dataStart + compressedSize)),
      method: archive.readUInt16LE(cursor + 8),
      recordedCrc: archive.readUInt32LE(cursor + 14),
      recordedSize: archive.readUInt32LE(cursor + 22),
    });
    cursor = dataStart + compressedSize;
  }
  return { files, end: cursor };
}

/** Offset of the first central-directory header, read from the end record. */
function centralDirectoryOffset(archive: Buffer): number {
  return archive.readUInt32LE(archive.length - 22 + 16);
}

beforeEach(() => {
  stdout = vi.spyOn(consoleModule, "log").mockImplementation(() => undefined);
  stderr = vi.spyOn(consoleModule, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  while (workspaces.length > 0) {
    const dir = workspaces.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("packaging a build", () => {
  const everyByte = Buffer.from(Array.from({ length: 256 }, (_, value) => value));
  const build: Tree = {
    "index.html": INDEX_HTML,
    "assets/game.js": "document.body.textContent = 'fixture';\n".repeat(50),
    // The CRC-32 check input: every implementation must answer 0xCBF43926.
    "assets/check.txt": "123456789",
    "assets/img/piñata-🎮.bin": everyByte,
    "empty.txt": "",
  };

  it("writes the build's contents to .package/<name>-<web version>-crazygames.zip", () => {
    const root = makeRoot(build);

    expect(main([], root)).toBe(0);
    expect(stderr).not.toHaveBeenCalled();
    expect(printed(stdout)).toContain(ZIP_NAME);

    const archive = readFileSync(path.join(root, ZIP_NAME));
    const { files, end } = walkLocalHeaders(archive);
    expect(files.map((file) => file.name)).toEqual([
      "assets/check.txt",
      "assets/game.js",
      "assets/img/piñata-🎮.bin",
      "empty.txt",
      "index.html",
    ]);
    for (const file of files) {
      expect(file.data.equals(asBuffer(build[file.name]))).toBe(true);
      expect(file.recordedSize).toBe(file.data.length);
      expect(file.method).toBe(8);
    }
    expect(files[0]?.recordedCrc).toBe(0xcbf43926);
    // The central directory starts where the files end, and counts them all.
    expect(centralDirectoryOffset(archive)).toBe(end);
    expect(archive.readUInt16LE(archive.length - 22 + 10)).toBe(5);
  });

  it("records the same names, bytes and CRC-32s in the central directory", () => {
    const root = makeRoot(build);

    expect(main([], root)).toBe(0);
    const entries = readZip(readFileSync(path.join(root, ZIP_NAME)));
    expect(entries.map((entry) => entry.name)).toEqual([
      "assets/check.txt",
      "assets/game.js",
      "assets/img/piñata-🎮.bin",
      "empty.txt",
      "index.html",
    ]);
    for (const entry of entries) {
      expect(entry.data.equals(asBuffer(build[entry.name]))).toBe(true);
    }
  });

  it("builds apps/web for the portal into .package/crazygames, sourcemaps off", () => {
    const root = makeRoot(build);

    expect(main([], root)).toBe(0);
    const call = JSON.parse(
      readFileSync(path.join(root, "apps/web/vite-call.json"), "utf8"),
    ) as { args: string[]; cwd: string; platform: string | null };
    expect(call.platform).toBe("crazygames");
    expect(call.cwd).toBe(realpathSync(path.join(root, "apps/web")));
    expect(call.args).toEqual([
      "build",
      "--outDir",
      path.join(root, ".package/crazygames"),
      "--emptyOutDir",
      "--sourcemap",
      "false",
    ]);
    expect(
      Object.keys(snapshot(path.join(root, ".package/crazygames"))).sort(),
    ).toEqual(Object.keys(build).sort());
  });

  it("leaves the local build in apps/web/dist byte-for-byte unchanged", () => {
    const root = makeRoot(build);
    const dist = path.join(root, "apps/web/dist");
    const before = snapshot(dist);

    expect(main([], root)).toBe(0);
    expect(Object.keys(before)).toHaveLength(2);
    expect(snapshot(dist)).toEqual(before);
  });

  it("writes a byte-identical zip for an identical build", () => {
    const root = makeRoot(build);

    expect(main([], root)).toBe(0);
    const first = readFileSync(path.join(root, ZIP_NAME));
    expect(main([], root)).toBe(0);
    expect(readFileSync(path.join(root, ZIP_NAME)).equals(first)).toBe(true);
  });
});

describe("the checks on the written zip", () => {
  it("fails ERR_ZIP_LAYOUT when the only index.html is in a subfolder", () => {
    const root = makeRoot({ "game/index.html": INDEX_HTML });

    expect(main([], root)).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_ZIP_LAYOUT");
    expect(failure).toContain("game/index.html");
    expect(existsSync(path.join(root, ZIP_NAME))).toBe(false);
  });

  it("fails ERR_ZIP_LAYOUT when there is no index.html at all", () => {
    const root = makeRoot({ "assets/game.js": "export {};\n" });

    expect(main([], root)).toBe(1);
    expect(printed(stderr)).toContain("ERR_ZIP_LAYOUT");
  });

  it("fails ERR_ZIP_SOURCEMAP naming a .map entry", () => {
    const root = makeRoot({
      "index.html": INDEX_HTML,
      "assets/index.js.map": '{"version":3}',
    });

    expect(main([], root)).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_ZIP_SOURCEMAP");
    expect(failure).toContain("assets/index.js.map");
    expect(existsSync(path.join(root, ZIP_NAME))).toBe(false);
  });

  it("fails ERR_ZIP_ABSOLUTE_PATH naming an index.html with a root-absolute src", () => {
    const root = makeRoot({
      "index.html": '<!doctype html>\n<script src="/assets/x.js"></script>\n',
    });

    expect(main([], root)).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_ZIP_ABSOLUTE_PATH");
    expect(failure).toContain("index.html");
    expect(failure).toContain('src="/assets/x.js"');
    expect(existsSync(path.join(root, ZIP_NAME))).toBe(false);
  });

  it.each([
    ["a stylesheet link in HTML", "about.htm", '<link href="/style.css" />'],
    ["markup built in a script", "assets/game.js", "a.innerHTML = '<a href=\"/\">';"],
    ["markup built in a module", "assets/chunk.mjs", 'b = `<img src="/logo.png">`;'],
    ["a stylesheet", "assets/style.css", '/* <use href="/sprite.svg#a"> */'],
  ])("fails ERR_ZIP_ABSOLUTE_PATH for %s", (_label, name, content) => {
    const root = makeRoot({ "index.html": INDEX_HTML, [name]: content });

    expect(main([], root)).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_ZIP_ABSOLUTE_PATH");
    expect(failure).toContain(name);
  });

  it("passes relative ./ URLs", () => {
    const root = makeRoot({
      "index.html":
        '<link rel="stylesheet" href="./assets/style.css" />\n' +
        '<script type="module" src="./assets/x.js"></script>\n',
      "assets/x.js": "export {};\n",
      "assets/style.css": "body { margin: 0; }\n",
    });

    expect(main([], root)).toBe(0);
    expect(existsSync(path.join(root, ZIP_NAME))).toBe(true);
  });

  it("does not read a root-absolute URL into a file that is not HTML, JS or CSS", () => {
    const root = makeRoot({
      "index.html": INDEX_HTML,
      "assets/dialogue.json": '{"line":"<a href=\\"/\\">","other":"src=\\"/x\\""}',
      "assets/notes.txt": 'src="/assets/x.js"',
    });

    expect(main([], root)).toBe(0);
  });
});

describe("a stage that fails before the zip is written", () => {
  it("stops at the budget when the portal build is over it", () => {
    const tree: Tree = { "index.html": INDEX_HTML };
    for (let index = 0; index < 300; index += 1) {
      tree[`assets/tile-${String(index)}.txt`] = "t";
    }
    const root = makeRoot(tree);

    expect(main([], root)).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_BUDGET_EXCEEDED");
    expect(failure).toContain(".package/crazygames");
    expect(failure).toContain("Actual: 301 files");
    expect(existsSync(path.join(root, ZIP_NAME))).toBe(false);
  });

  it("reports a failed build and leaves no zip from an earlier run behind", () => {
    const root = makeRoot({ "index.html": INDEX_HTML });
    expect(main([], root)).toBe(0);
    expect(existsSync(path.join(root, ZIP_NAME))).toBe(true);

    writeFileSync(
      path.join(root, "apps/web/build-error.txt"),
      "fixture: cannot resolve ./missing.ts\n",
    );
    expect(main([], root)).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_PACKAGE_BUILD");
    expect(failure).toContain("Actual: exit 3");
    expect(failure).toContain("fixture: cannot resolve ./missing.ts");
    expect(existsSync(path.join(root, ZIP_NAME))).toBe(false);
  });

  it("reports ERR_DEPENDENCY_MISSING when Vite is not installed in apps/web", () => {
    const root = makeRoot({ "index.html": INDEX_HTML });
    rmSync(path.join(root, "apps/web/node_modules"), { recursive: true });

    expect(main([], root)).toBe(1);
    expect(printed(stderr)).toContain("ERR_DEPENDENCY_MISSING");
    expect(existsSync(path.join(root, ".package"))).toBe(false);
  });

  it.each([
    ["the root manifest has no name", "package.json", "{}"],
    ["the root name is scoped", "package.json", '{"name":"@fixture/game"}'],
    ["the root manifest is not JSON", "package.json", "{"],
    ["the web manifest has no version", "apps/web/package.json", '{"name":"web"}'],
    ["the web version is not a string", "apps/web/package.json", '{"version":1}'],
  ])("reports ERR_PACKAGE_MANIFEST when %s", (_label, manifest, content) => {
    const root = makeRoot({ "index.html": INDEX_HTML }, { [manifest]: content });

    expect(main([], root)).toBe(1);
    const failure = printed(stderr);
    expect(failure).toContain("ERR_PACKAGE_MANIFEST");
    expect(failure).toContain(manifest);
    expect(existsSync(path.join(root, "apps/web/vite-call.json"))).toBe(false);
  });

  it("reports ERR_PACKAGE_MANIFEST when the web manifest is missing", () => {
    const root = makeRoot({ "index.html": INDEX_HTML });
    rmSync(path.join(root, "apps/web/package.json"));

    expect(main([], root)).toBe(1);
    expect(printed(stderr)).toContain("ERR_PACKAGE_MANIFEST");
  });

  it("rejects any argument as bad usage, under the default root", () => {
    expect(main(["--portal"])).toBe(2);
    expect(printed(stderr)).toContain("ERR_PACKAGE_USAGE");
  });
});

describe("checkZip", () => {
  const index = { name: "index.html", data: Buffer.from(INDEX_HTML) };

  it("finds nothing wrong with a root index.html and relative URLs", () => {
    expect(checkZip([index])).toEqual([]);
  });

  it("reports every problem in one pass", () => {
    const problems = checkZip([
      { name: "game/index.html", data: Buffer.from('<img src="/a.png">') },
      { name: "game/index.js.map", data: Buffer.from("{}") },
    ]);

    expect(problems.map((problem) => problem.code)).toEqual([
      "ERR_ZIP_LAYOUT",
      "ERR_ZIP_ABSOLUTE_PATH",
      "ERR_ZIP_SOURCEMAP",
    ]);
  });

  it("accepts a nested index.html beside the root one", () => {
    expect(
      checkZip([index, { name: "help/index.html", data: Buffer.from("<p>help</p>") }]),
    ).toEqual([]);
  });
});

describe("createZip and readZip", () => {
  it("round-trips names and bytes in the order given", () => {
    const entries = [
      { name: "z-last-by-name-first-in-archive.txt", data: Buffer.from("z") },
      { name: "empty", data: Buffer.alloc(0) },
      { name: "niño/señal/🎲.bin", data: Buffer.from([0, 255, 0, 255, 80, 75, 5, 6]) },
      { name: "repetitive.txt", data: Buffer.alloc(100_000, "ab") },
    ];

    const archive = createZip(entries);
    const read = readZip(archive);
    expect(read.map((entry) => entry.name)).toEqual(entries.map((entry) => entry.name));
    for (const [position, entry] of read.entries()) {
      expect(entry.data.equals(entries[position]?.data ?? Buffer.from("missing"))).toBe(
        true,
      );
    }
    // Deflate is doing real work: 100,000 repetitive bytes fit in far less.
    expect(archive.length).toBeLessThan(2_000);
  });

  it("writes an empty archive as a bare end record", () => {
    const archive = createZip([]);

    expect(archive).toHaveLength(22);
    expect(readZip(archive)).toEqual([]);
  });

  it.each([
    ["shorter than an end record", () => Buffer.alloc(5)],
    [
      "truncated by one byte",
      () => createZip([{ name: "a.txt", data: Buffer.from("a") }]).subarray(0, -1),
    ],
    [
      "missing a central-directory signature",
      () => {
        const archive = createZip([{ name: "a.txt", data: Buffer.from("a") }]);
        archive.writeUInt32LE(0, centralDirectoryOffset(archive));
        return archive;
      },
    ],
    [
      "carrying a CRC-32 its content does not match",
      () => {
        const archive = createZip([{ name: "a.txt", data: Buffer.from("a") }]);
        const crcField = centralDirectoryOffset(archive) + 16;
        archive.writeUInt32LE((archive.readUInt32LE(crcField) ^ 1) >>> 0, crcField);
        return archive;
      },
    ],
  ])("rejects an archive %s", (_label, makeArchive) => {
    const error = caught(() => readZip(makeArchive()));

    expect(error).toBeInstanceOf(ZipError);
    expect((error as ZipError).code).toBe("ERR_ZIP_CORRUPT");
  });
});
