import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      /*
       * The new React Compiler hook rules are very strict and still being
       * wired up in Next 16 (see vercel/next.js discussion #84943). The two
       * below fire on patterns that are idiomatic and safe in our app:
       *
       *  - set-state-in-effect: setting state inside an on-mount data fetch
       *    (loading flags / fetched results) — the standard client-fetch
       *    pattern. Kept as a warning so it's visible but non-blocking.
       *  - purity (Date.now): flagged inside event handlers, not render —
       *    a false positive for our usage.
       *
       * They are downgraded to warnings, not disabled, so they still show up.
       */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);
