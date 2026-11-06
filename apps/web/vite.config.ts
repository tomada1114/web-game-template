import { defineConfig } from "vite";

export default defineConfig({
  // Portals serve the build from an arbitrary subdirectory and load it by
  // relative path only, so no asset URL may be rooted at "/".
  base: "./",
});
