import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — Phase 1 foundations.
 *
 * Scope is end-to-end smoke and link integrity. Real flows (checkout,
 * Vipps, fulfilment) get added phase-by-phase as the underlying code
 * lands.
 *
 * Modes:
 *   PLAYWRIGHT_BASE_URL  — when set, tests run against that URL instead of
 *                          spinning up a local server.
 *   default             — boots `npm run dev` on localhost:3000.
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

const useExternalServer = !!process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useExternalServer
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
