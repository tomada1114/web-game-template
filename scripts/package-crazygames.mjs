#!/usr/bin/env node
// Build the CrazyGames upload: a portal build of apps/web, held to the bundle
// budget, zipped with index.html at the archive root, then read back and
// checked for the mistakes that break a game once the portal serves it.
//
// The portal build goes to its own directory under .package/, never to
// apps/web/dist, so the local build a preview serves is left as it was.
import { Buffer } from "node:buffer";
import console from "node:console";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

import { checkBudget, listFiles } from "./lib/budget.mjs";
import { isMain } from "./lib/is-main.mjs";
import { parseJson, readString } from "./lib/json.mjs";
import { repoRoot, resolveDependencyBin, runNode } from "./lib/node-tools.mjs";

const WEB_DIRECTORY = "apps/web";
const WEB_MANIFEST = `${WEB_DIRECTORY}/package.json`;
const PACKAGE_DIRECTORY = ".package";
const PORTAL = "crazygames";
const BUILD_DIRECTORY = `${PACKAGE_DIRECTORY}/${PORTAL}`;

// Both values become part of a file name, so neither may carry a path
// separator: a scoped package name would otherwise write outside .package/.
const FILE_NAME_PART = /^[\w.+-]+$/;

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;
const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const END_RECORD_BYTES = 22;
// The version of the ZIP format that introduced deflate.
const ZIP_VERSION = 20;
// General-purpose bit 11: entry names are UTF-8.
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;
// 1980-01-01 00:00, the earliest date the format can express. A fixed stamp
// keeps the archive byte-identical for an identical build.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const SCANNED_ENTRY = /\.(?:html?|m?js|css)$/;
// A same-origin absolute URL: one "/" not followed by another, since a
// protocol-relative "//host/..." URL is allowed. Each pattern takes the value
// whole, in double, single or no quotes.
const ROOT_ABSOLUTE_URLS = [
  /\b(?:src|href)\s*=\s*(?:"\/(?!\/)[^"]*"|'\/(?!\/)[^']*'|\/(?!\/)[^\s"'`>]*)/i,
  /\burl\(\s*(?:"\/(?!\/)[^"]*"|'\/(?!\/)[^']*'|\/(?!\/)[^\s"')]*)\s*\)/i,
];
// Longest URL quoted in a report, so a minified line cannot flood it.
const REPORTED_URL_CHARACTERS = 80;
const ZIP_SUFFIX = `-${PORTAL}.zip`;

/**
 * One file inside an archive.
 *
 * @typedef {object} ZipEntry
 * @property {string} name - Path inside the archive, with `/` separators.
 * @property {Buffer} data - Uncompressed content.
 */

/**
 * One reason an archive cannot be uploaded.
 *
 * @typedef {object} ZipProblem
 * @property {"ERR_ZIP_LAYOUT" | "ERR_ZIP_SOURCEMAP" | "ERR_ZIP_ABSOLUTE_PATH" | "ERR_ZIP_CORRUPT"} code
 * @property {string} message - The stderr block for this problem, code included.
 */

/** An archive {@link readZip} cannot read back. */
export class ZipError extends Error {
  /**
   * @param {string} detail - What is wrong with the archive.
   */
  constructor(detail) {
    super(`ERR_ZIP_CORRUPT: ${detail}`);
    this.name = "ZipError";
    this.code = "ERR_ZIP_CORRUPT";
  }
}

/**
 * Write a ZIP archive holding every entry, deflated.
 *
 * @remarks
 * A minimal writer: no directory entries, no ZIP64, no data descriptors. The
 * bundle budget keeps a build far inside the format's 16-bit entry count and
 * 32-bit sizes.
 *
 * @param {readonly ZipEntry[]} entries - Files to store, in archive order.
 * @returns {Buffer} The archive.
 */
export function createZip(entries) {
  /** @type {Buffer[]} */
  const records = [];
  /** @type {Buffer[]} */
  const directory = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data, { level: 9 });

    // The fields a local header and its central-directory twin share, in the
    // order both lay them out.
    const shared = Buffer.alloc(26);
    shared.writeUInt16LE(ZIP_VERSION, 0);
    shared.writeUInt16LE(UTF8_NAMES, 2);
    shared.writeUInt16LE(DEFLATE, 4);
    shared.writeUInt16LE(DOS_TIME, 6);
    shared.writeUInt16LE(DOS_DATE, 8);
    shared.writeUInt32LE(crc32(entry.data), 10);
    shared.writeUInt32LE(compressed.length, 14);
    shared.writeUInt32LE(entry.data.length, 18);
    shared.writeUInt16LE(name.length, 22);

    const local = Buffer.alloc(LOCAL_HEADER_BYTES);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    shared.copy(local, 4);

    const central = Buffer.alloc(CENTRAL_HEADER_BYTES);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(ZIP_VERSION, 4);
    shared.copy(central, 6);
    central.writeUInt32LE(offset, 42);

    records.push(local, name, compressed);
    directory.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const directoryBytes = directory.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(END_RECORD_BYTES);
  end.writeUInt32LE(END_RECORD, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...records, ...directory, end]);
}

/**
 * Read back an archive {@link createZip} wrote.
 *
 * @param {Buffer} archive - The archive's bytes.
 * @returns {ZipEntry[]} Every entry, in central-directory order.
 * @throws ZipError when the archive has no readable central directory, or an
 * entry's content does not match its recorded CRC-32.
 */
export function readZip(archive) {
  // The writer adds no archive comment, so the record is the last 22 bytes.
  const end = archive.length - END_RECORD_BYTES;
  if (end < 0 || archive.readUInt32LE(end) !== END_RECORD) {
    throw new ZipError("the archive does not end in a central-directory record.");
  }

  /** @type {ZipEntry[]} */
  const entries = [];
  const count = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== CENTRAL_HEADER) {
      throw new ZipError(
        `central-directory entry ${String(index)} has no header signature.`,
      );
    }
    const nameStart = cursor + CENTRAL_HEADER_BYTES;
    const nameEnd = nameStart + archive.readUInt16LE(cursor + 28);
    const name = archive.toString("utf8", nameStart, nameEnd);

    const local = archive.readUInt32LE(cursor + 42);
    const dataStart =
      local +
      LOCAL_HEADER_BYTES +
      archive.readUInt16LE(local + 26) +
      archive.readUInt16LE(local + 28);
    const data = inflateRawSync(
      archive.subarray(dataStart, dataStart + archive.readUInt32LE(cursor + 20)),
    );
    if (crc32(data) !== archive.readUInt32LE(cursor + 16)) {
      throw new ZipError(`${name} does not match its recorded CRC-32.`);
    }

    entries.push({ name, data });
    cursor =
      nameEnd + archive.readUInt16LE(cursor + 30) + archive.readUInt16LE(cursor + 32);
  }
  return entries;
}

/**
 * Find what would break the game once the portal serves this archive.
 *
 * @param {readonly ZipEntry[]} entries - The archive's entries.
 * @returns {ZipProblem[]} Every problem found; empty when the archive is fit
 * to upload.
 */
export function checkZip(entries) {
  /** @type {ZipProblem[]} */
  const problems = [];

  if (!entries.some((entry) => entry.name === "index.html")) {
    const nested = entries
      .map((entry) => entry.name)
      .filter((name) => name.endsWith("/index.html"));
    problems.push({
      code: "ERR_ZIP_LAYOUT",
      message:
        "ERR_ZIP_LAYOUT: the zip has no index.html at its root.\n" +
        "Expected: index.html\n" +
        `Actual: ${nested.length > 0 ? nested.join(", ") : "no index.html in the zip"}\n` +
        `Next: make the build write index.html directly into ${BUILD_DIRECTORY}, ` +
        "then rerun `pnpm package:crazygames`.",
    });
  }

  for (const entry of entries) {
    if (entry.name.endsWith(".map")) {
      problems.push({
        code: "ERR_ZIP_SOURCEMAP",
        message:
          `ERR_ZIP_SOURCEMAP: ${entry.name} is a source map.\n` +
          "Expected: no .map entry in the zip.\n" +
          "Next: stop the build emitting that file, then rerun `pnpm package:crazygames`.",
      });
      continue;
    }
    if (!SCANNED_ENTRY.test(entry.name)) {
      continue;
    }
    const content = entry.data.toString("utf8");
    const url = ROOT_ABSOLUTE_URLS.map((pattern) => pattern.exec(content)?.[0]).find(
      (match) => match !== undefined,
    );
    if (url !== undefined) {
      const shown =
        url.length > REPORTED_URL_CHARACTERS
          ? `${url.slice(0, REPORTED_URL_CHARACTERS)}…`
          : url;
      problems.push({
        code: "ERR_ZIP_ABSOLUTE_PATH",
        message:
          `ERR_ZIP_ABSOLUTE_PATH: ${entry.name} references a root-absolute URL.\n` +
          'Expected: a relative URL, such as src="./assets/x.js".\n' +
          `Actual: ${shown}\n` +
          'Next: keep Vite\'s `base: "./"` and make that URL relative, ' +
          "then rerun `pnpm package:crazygames`.",
      });
    }
  }
  return problems;
}

/**
 * Read one string field of a manifest that is safe to use in a file name.
 *
 * @param {string} root - Repository root.
 * @param {string} manifest - Manifest path relative to `root`.
 * @param {string} key - Field to read.
 * @returns {string | undefined} The value, or undefined after reporting why
 * it cannot be used.
 */
function fileNamePart(root, manifest, key) {
  /** @type {string | undefined} */
  let value;
  try {
    value = readString(parseJson(readFileSync(path.join(root, manifest), "utf8")), key);
  } catch {
    // A missing or malformed manifest is reported below, like a missing field.
  }
  if (value !== undefined && FILE_NAME_PART.test(value)) {
    return value;
  }
  console.error(
    `ERR_PACKAGE_MANIFEST: ${manifest} has no usable "${key}".\n` +
      "Expected: a string of letters, digits, and the characters . _ + - only.\n" +
      `Actual: ${value === undefined ? "absent or unreadable" : JSON.stringify(value)}\n` +
      `Next: set "${key}" in ${manifest}, then rerun \`pnpm package:crazygames\`.`,
  );
  return undefined;
}

/**
 * Remove every portal zip directly inside the package directory.
 *
 * @param {string} root - Repository root.
 */
function removePortalZips(root) {
  const directory = path.join(root, PACKAGE_DIRECTORY);
  /** @type {import("node:fs").Dirent[]} */
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    // No package directory yet: nothing to remove.
    return;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(ZIP_SUFFIX)) {
      rmSync(path.join(directory, entry.name), { force: true });
    }
  }
}

/**
 * Build apps/web for the portal into the package directory.
 *
 * @param {string} root - Repository root.
 * @returns {boolean} False after reporting why the build did not finish.
 */
function buildPortal(root) {
  const webDirectory = path.join(root, WEB_DIRECTORY);
  /** @type {string} */
  let vite;
  try {
    vite = resolveDependencyBin("vite", undefined, webDirectory);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return false;
  }
  const build = runNode(
    vite,
    [
      "build",
      "--outDir",
      path.join(root, BUILD_DIRECTORY),
      // Vite refuses to clear an output directory outside its root unless
      // told to, and a file left by an earlier build would be zipped.
      "--emptyOutDir",
      "--sourcemap",
      "false",
    ],
    { cwd: webDirectory, env: { ...process.env, VITE_PLATFORM: PORTAL } },
  );
  if (build.status !== 0) {
    console.error(
      `ERR_PACKAGE_BUILD: the portal build of ${WEB_DIRECTORY} failed.\n` +
        `Actual: exit ${String(build.status)}\n` +
        `${build.stderr.trim()}\n` +
        "Next: fix the build error above, then rerun `pnpm package:crazygames`.",
    );
    return false;
  }
  return true;
}

/**
 * Build, budget, zip and check the CrazyGames upload.
 *
 * @param {readonly string[]} [argv] - Command-line arguments; none are accepted.
 * @param {string} [root] - Repository root; defaults to this repository's.
 * @returns {number} Process exit code: 0 when a checked zip was written, 1
 * when a stage failed, 2 for bad usage.
 */
export function main(argv = [], root = repoRoot) {
  if (argv.length > 0) {
    console.error(
      "ERR_PACKAGE_USAGE: package:crazygames takes no arguments.\n" +
        "Next: run `pnpm package:crazygames`.",
    );
    return 2;
  }
  const name = fileNamePart(root, "package.json", "name");
  if (name === undefined) {
    return 1;
  }
  const version = fileNamePart(root, WEB_MANIFEST, "version");
  if (version === undefined) {
    return 1;
  }
  const zipName = `${PACKAGE_DIRECTORY}/${name}-${version}${ZIP_SUFFIX}`;
  const zipPath = path.join(root, zipName);
  // Until this run's own zip has passed its checks, no portal zip may sit
  // where an upload is taken from, including one an older name or version
  // left behind.
  removePortalZips(root);

  if (!buildPortal(root)) {
    return 1;
  }
  const budget = checkBudget(BUILD_DIRECTORY, root, "pnpm package:crazygames");
  if (budget !== 0) {
    return budget;
  }

  const buildDirectory = path.join(root, BUILD_DIRECTORY);
  writeFileSync(
    zipPath,
    createZip(
      listFiles(buildDirectory).map((file) => ({
        name: file.path,
        data: readFileSync(path.join(buildDirectory, file.path)),
      })),
    ),
  );

  const written = readFileSync(zipPath);
  /** @type {ZipEntry[]} */
  let entries = [];
  /** @type {ZipProblem[] | undefined} */
  let problems;
  try {
    entries = readZip(written);
  } catch (error) {
    // A ZipError, or the RangeError or zlib error a damaged offset or
    // deflate stream raises first.
    problems = [
      {
        code: "ERR_ZIP_CORRUPT",
        message:
          `ERR_ZIP_CORRUPT: ${zipName} cannot be read back.\n` +
          "Expected: an archive whose every entry inflates to its recorded CRC-32.\n" +
          `Actual: ${error instanceof Error ? error.message : String(error)}\n` +
          "Next: rerun `pnpm package:crazygames`.",
      },
    ];
  }
  problems ??= checkZip(entries);
  if (problems.length > 0) {
    rmSync(zipPath, { force: true });
    console.error(
      `${problems.map((problem) => problem.message).join("\n\n")}\n\n` +
        `${zipName} was removed: it is not fit to upload.`,
    );
    return 1;
  }
  console.log(
    `package: wrote ${zipName} ` +
      `(${String(entries.length)} files, ${String(written.length)} bytes).`,
  );
  return 0;
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
