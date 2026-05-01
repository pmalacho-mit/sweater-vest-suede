import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
  },
  plugins: [svelte()],
  optimizeDeps: {
    // Vite's dep scanner can't resolve bare package imports that appear inside
    // Svelte virtual modules (e.g. Runner.svelte?id=0) because virtual modules
    // have no filesystem path, so esbuild can't walk up to find node_modules.
    // Listing them here bypasses the scanner and pre-bundles them directly,
    // eliminating the ~14s first-request crawl delay.
    include: ["dockview-core", "dockview", "@storybook/test", "html-to-image"],
  },
});
