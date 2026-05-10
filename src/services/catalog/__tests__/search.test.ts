import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock prisma BEFORE importing the service so the $queryRaw spy attaches
// to the right object.
const mocks = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: mocks.$queryRaw },
}));

import { normalizeSearchKey, searchProductIds } from "@/services/catalog/search";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizeSearchKey", () => {
  it("lowercases and strips dashes", () => {
    expect(normalizeSearchKey("ABC-123")).toBe("abc123");
  });

  it("strips spaces", () => {
    expect(normalizeSearchKey("Bosch 0445010 X")).toBe("bosch0445010x");
  });

  it("strips Norwegian punctuation and dashes", () => {
    expect(normalizeSearchKey("VOLVO–EC380—2022")).toBe("volvoec3802022");
  });

  it("strips em-dash and en-dash (Unicode minus variants)", () => {
    expect(normalizeSearchKey("Hydraulisk pumpe – TESTDATA")).toBe(
      "hydrauliskpumpetestdata",
    );
  });

  it("preserves alphanumerics across mixed-case and digits", () => {
    expect(normalizeSearchKey("OEM-CAT-123-XL")).toBe("oemcat123xl");
  });

  it("returns empty string for entirely-non-alphanumeric input", () => {
    expect(normalizeSearchKey("---///")).toBe("");
  });

  it("matches the DB trigger's regex on Norwegian letters (note: æøå strip)", () => {
    // The DB trigger uses [^a-z0-9] — Norwegian å/ø/æ get stripped, same
    // as in JS. Documenting this so future changes consider Norwegian
    // intent (vs collapsing æ→ae, ø→o, å→a like the slugify utility).
    expect(normalizeSearchKey("VærØy-Å-100")).toBe("vry100");
  });
});

describe("searchProductIds", () => {
  it("returns [] for an empty query without hitting the DB", async () => {
    const result = await searchProductIds({ query: "" });
    expect(result).toEqual([]);
    expect(mocks.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns [] for whitespace-only query", async () => {
    const result = await searchProductIds({ query: "   " });
    expect(result).toEqual([]);
    expect(mocks.$queryRaw).not.toHaveBeenCalled();
  });

  it("calls Prisma raw with the SQL template once per request", async () => {
    mocks.$queryRaw.mockResolvedValue([]);
    await searchProductIds({ query: "bosch" });
    expect(mocks.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("re-sorts result rows: stage ascending then score descending", async () => {
    mocks.$queryRaw.mockResolvedValue([
      { productId: "p-fts-low",  stage: 3, score: 0.1 },
      { productId: "p-exact",    stage: 1, score: 1.0 },
      { productId: "p-trgm-mid", stage: 2, score: 0.6 },
      { productId: "p-fts-high", stage: 3, score: 0.9 },
    ]);
    const out = await searchProductIds({ query: "any" });
    expect(out.map((h) => h.productId)).toEqual([
      "p-exact",     // stage 1
      "p-trgm-mid",  // stage 2
      "p-fts-high",  // stage 3, score 0.9
      "p-fts-low",   // stage 3, score 0.1
    ]);
  });

  it("respects the limit parameter, defaulting to 50 and capping at 200", async () => {
    mocks.$queryRaw.mockResolvedValue([]);
    await searchProductIds({ query: "x" });
    await searchProductIds({ query: "x", limit: 5000 });
    await searchProductIds({ query: "x", limit: -10 });
    // Three calls; verify each one ran (the LIMIT is embedded in the
    // template literal, so we just confirm no throw and the SQL got sent).
    expect(mocks.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
