import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest 4 runs on Vite 8, which transforms TS/JSX with Oxc (the `esbuild`
// option is deprecated and ignored for JSX). Pin the automatic React runtime
// explicitly so tests don't depend on tsconfig's `jsx` value, which Next.js
// owns. The `@/` alias mirrors tsconfig `paths`.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.dirname(fileURLToPath(import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["__tests__/setup.ts"],
    restoreMocks: true,
  },
});
