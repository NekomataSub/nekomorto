import path from "node:path";
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import { classifyManualChunk } from "./src/lib/build-chunking";

export default defineConfig({
  integrations: [react()],
  prefetch: {
    defaultStrategy: "hover",
    prefetchAll: false,
  },
  output: "server",
  adapter: node({
    mode: "middleware",
  }),
  srcDir: "./src-astro",
  publicDir: "./public",
  outDir: "./dist-astro",
  vite: {
    resolve: {
      alias: {
        "@": path.resolve("./src"),
      },
    },
    build: {
      // Keep Astro's client build aligned with the main Vite build so large,
      // intentionally isolated editor bundles don't trigger generic warnings.
      chunkSizeWarningLimit: 1250,
      rolldownOptions: {
        output: {
          manualChunks: classifyManualChunk,
        },
      },
    },
  },
});
