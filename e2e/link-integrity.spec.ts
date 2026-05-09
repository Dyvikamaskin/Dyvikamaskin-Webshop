import { test, expect } from "@playwright/test";

/**
 * Phase 0 D0.4 — link integrity smoke test.
 *
 * Visits a known set of public + auth + admin entry points as an
 * unauthenticated guest and asserts each one returns a non-error
 * response. Links discovered while crawling are also asserted to
 * resolve.
 *
 * Authentication is not exercised here — admin-only routes assert that
 * the proxy redirects them to /login (not 4xx/5xx). A separate signed-in
 * smoke test follows in a later phase.
 */

const PUBLIC_PAGES = [
  "/",
  "/produkter",
  "/handlekurv",
  "/vilkar",
  "/kategori/hydraulikk",
  "/login",
  "/registrer",
  "/glemt-passord",
];

// These are protected — visiting them as a guest should redirect (proxy.ts),
// landing on /login. Either way the final response must not be an error.
const PROTECTED_ROUTES = ["/admin", "/konto"];

test.describe("link integrity (guest)", () => {
  for (const path of PUBLIC_PAGES) {
    test(`public page ${path} loads without error`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response, `no response for ${path}`).not.toBeNull();
      expect(response!.status(), `bad status for ${path}`).toBeLessThan(400);
    });
  }

  for (const path of PROTECTED_ROUTES) {
    test(`protected route ${path} redirects to /login`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response, `no response for ${path}`).not.toBeNull();
      expect(response!.status(), `bad status for ${path}`).toBeLessThan(400);
      // After the proxy redirect, the URL should contain /login
      await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
    });
  }

  test("home page nav links all resolve", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page.locator("a[href^='/']").evaluateAll((els) =>
      Array.from(new Set(
        els
          .map((el) => (el as HTMLAnchorElement).getAttribute("href"))
          .filter((h): h is string => !!h && !h.startsWith("//"))
      ))
    );

    expect(hrefs.length, "home page should expose internal links").toBeGreaterThan(0);

    for (const href of hrefs) {
      // The proxy may redirect; we accept any non-error final status.
      const res = await request.get(href, { maxRedirects: 5 });
      expect(res.status(), `${href} returned ${res.status()}`).toBeLessThan(400);
    }
  });
});
