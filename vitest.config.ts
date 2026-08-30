import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the "@/*" -> "src/*" path alias from tsconfig.json so unit
      // tests can import modules the same way the app does.
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Only pure logic is unit-tested here; modules that touch the DB are not
    // imported, so no DB connection is needed.
  },
});
