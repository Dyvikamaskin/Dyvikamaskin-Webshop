import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Phase 7 a11y scaffolding — runs axe-core against the storefront's
 * highest-traffic public pages. Surface-level audit only: catches
 * regressions like missing alt text, low contrast, missing landmark
 * roles. A full keyboard-only audit is a separate manual pass.
 *
 * Treated as a smoke test — only WCAG 2.1 AA serious/critical
 * violations fail the build. Less severe issues are warnings.
 *
 * To run locally: npm run test:e2e -- a11y-smoke
 */

const PAGES = [
  { path: "/",                 label: "Home" },
  { path: "/produkter",        label: "Product listing" },
  { path: "/info/deletyper",   label: "Help — provenance terms" },
  { path: "/info/tilbud",      label: "Quote request" },
  { path: "/personvern",       label: "Privacy policy" },
  { path: "/login",            label: "Login" },
  { path: "/registrer",        label: "Register" },
  { path: "/handlekurv",       label: "Cart" },
  { path: "/sok?q=test",       label: "Search results" },
  { path: "/glemt-passord",    label: "Forgot password" },
];

for (const { path, label } of PAGES) {
  test(`a11y: ${label} (${path}) has no serious/critical violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    if (blocking.length > 0) {
      console.log(
        `${label} (${path}) — ${blocking.length} blocking issue(s):`,
        blocking.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          help: v.help,
        })),
      );
    }
    expect(blocking).toEqual([]);
  });
}
