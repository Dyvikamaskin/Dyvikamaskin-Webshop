import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config — Phase 1 foundations.
 *
 * Scope is unit + integration only. End-to-end browser flows live in
 * Playwright (see playwright.config.ts).
 *
 * Co-located tests pattern: a file at `src/lib/foo.ts` has tests at
 * `src/lib/__tests__/foo.test.ts`. Tests are excluded from the
 * production build automatically because the test runner reads them
 * directly.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules", ".next", "src/app/generated/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/**/*.test.ts",
        "src/lib/**/__tests__/**",
        "src/app/generated/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
