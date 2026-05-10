import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slugify";

describe("slugify", () => {
  it("lowercases plain input", () => {
    expect(slugify("Hydraulikk")).toBe("hydraulikk");
  });

  it("replaces spaces with single dashes", () => {
    expect(slugify("Olje og kjemikalier")).toBe("olje-og-kjemikalier");
  });

  it("collapses multiple non-alphanumerics to a single dash", () => {
    expect(slugify("Olje  &  kjemikalier")).toBe("olje-kjemikalier");
    expect(slugify("Skruer / Bolter")).toBe("skruer-bolter");
    expect(slugify("a___b---c")).toBe("a-b-c");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("  Lagre & ledd  ")).toBe("lagre-ledd");
    expect(slugify("--foo--")).toBe("foo");
  });

  it("transliterates Norwegian letters", () => {
    expect(slugify("Verktøy og maskiner")).toBe("verktoy-og-maskiner");
    expect(slugify("ÆØÅ")).toBe("aeoa");
    expect(slugify("Søvn & ørken")).toBe("sovn-orken");
  });

  it("transliterates Swedish and German diacritics", () => {
    expect(slugify("Müller & Söhne")).toBe("muller-sohne");
    expect(slugify("Straße")).toBe("strasse");
  });

  it("strips remaining combining diacritics", () => {
    expect(slugify("Léon")).toBe("leon");
    expect(slugify("naïve")).toBe("naive");
  });

  it("returns empty string for empty / whitespace-only input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("---")).toBe("");
  });

  it("preserves digits", () => {
    expect(slugify("Verktøy 2025")).toBe("verktoy-2025");
    expect(slugify("3M klister")).toBe("3m-klister");
  });

  it("is idempotent — slugify(slugify(x)) === slugify(x)", () => {
    const samples = [
      "Verktøy og maskiner",
      "  Lagre  &  ledd  ",
      "Müller / Söhne",
      "ÆØÅ",
    ];
    for (const s of samples) {
      const once = slugify(s);
      expect(slugify(once)).toBe(once);
    }
  });
});
