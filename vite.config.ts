import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: `${rootDirectory}app.html`,
        offscreen: `${rootDirectory}offscreen.html`,
        "service-worker": `${rootDirectory}src/background/service-worker.ts`,
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    environment: "jsdom",
    restoreMocks: true,
  },
});
