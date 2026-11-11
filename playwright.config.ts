import { defineConfig, devices } from "@playwright/test";

// A distinct E2E_PORT lets parallel worktrees each run the smoke test; with
// strictPort a taken port fails the run instead of serving somewhere else.
const port = Number(process.env["E2E_PORT"] ?? 4173);
const baseURL = `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: true,
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `vite` is apps/web's devDependency, not the root's, and a path keeps the
    // command valid after the bootstrap renames the package.
    command: `pnpm run build && pnpm -C apps/web exec vite preview --host 127.0.0.1 --port ${String(port)} --strictPort`,
    url: baseURL,
    // Always the local build: VITE_PLATFORM=crazygames would inject the SDK.
    env: { VITE_PLATFORM: "local" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
