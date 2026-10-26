// ESLint flat config — replaces `next lint`, which Next.js 16 removed.
// Run with `npm run lint` (= `eslint .`).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-plugin-react-hooks v7 (via eslint-config-next 16) ships React
    // Compiler readiness rules. The compiler is not enabled here and the
    // existing fetch-in-effect code predates these rules — keep them visible
    // as warnings until that code is refactored.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // graphify output (generated, see CLAUDE.md "Graphify regen")
    "public/codegraph/**",
  ]),
]);
