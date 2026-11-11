import { defineConfig, devices } from "@playwright/test";

// A distinct E2E_PORT lets parallel worktrees each run the smoke test; with
// strictPort a taken port fails the run instead of serving somewhere else.
const port = parsePort(process.env["E2E_PORT"]);

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 4173;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > 65_535) {
    throw new Error(`E2E_PORT must be an integer from 1 to 65535; got "${raw}".`);
  }
  return value;
}
const baseURL = `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: true,
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `vite` is apps/web's devDependency, not the root's, and a path keeps the
    // command valid after the bootstrap renames the package.
    command: `pnpm run build && pnpm -C apps/web exec vite preview --host 127.0.0.1 --port ${String(port)} --strictPort`,
    url: baseURL,
    // Always the local build: VITE_PLATFORM=crazygames would inject the SDK.
    env: { VITE_PLATFORM: "local" },
    reuseExistingServer: false,
    // Covers a cold `pnpm run build` plus the preview server's start, not the start alone.
    timeout: 180_000,
  },
});
