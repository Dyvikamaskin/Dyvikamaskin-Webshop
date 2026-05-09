import { describe, expect, it } from "vitest";
import { validateOrgNumber } from "@/lib/brreg";

/**
 * Norwegian organisation-number checksum (modulo-11).
 * Weights [3, 2, 7, 6, 5, 4, 3, 2] over the first 8 digits;
 * control digit at position 9.
 */
describe("validateOrgNumber (modulo-11)", () => {
  it("accepts a constructed org number that satisfies the checksum", () => {
    // Constructed: weights [3,2,7,6,5,4,3,2] over "12345678"
    //   sum = 3+4+21+24+25+24+21+16 = 138; 138 % 11 = 6; check = 11 - 6 = 5
    expect(validateOrgNumber("123456785")).toBe(true);
  });

  it("rejects an org number with a wrong check digit", () => {
    const valid = "123456785";
    const wrong = valid.slice(0, -1) + String((parseInt(valid.slice(-1), 10) + 1) % 10);
    expect(validateOrgNumber(wrong)).toBe(false);
  });

  it("rejects strings that are not 9 digits", () => {
    expect(validateOrgNumber("12345678")).toBe(false); // 8 digits
    expect(validateOrgNumber("1234567890")).toBe(false); // 10 digits
    expect(validateOrgNumber("")).toBe(false);
    expect(validateOrgNumber("abcdefghi")).toBe(false);
  });

  it("strips spaces and dashes before validating", () => {
    expect(validateOrgNumber("123 456 785")).toBe(true);
    expect(validateOrgNumber("123-456-785")).toBe(true);
  });

  it("rejects when the modulo-11 remainder is 1 (would require check digit 10)", () => {
    // Construct first 8 digits such that the weighted sum mod 11 == 1.
    // Brute force: find any 8-digit prefix whose sum ≡ 1 (mod 11).
    const weights = [3, 2, 7, 6, 5, 4, 3, 2];
    let prefix = "";
    for (let n = 10000000; n < 99999999; n++) {
      const s = String(n);
      const sum = weights.reduce((acc, w, i) => acc + w * parseInt(s[i], 10), 0);
      if (sum % 11 === 1) {
        prefix = s;
        break;
      }
    }
    // Any check digit 0-9 paired with this prefix should fail validation
    // because the algorithm has no valid representation when remainder is 1.
    for (let cd = 0; cd <= 9; cd++) {
      expect(validateOrgNumber(prefix + String(cd))).toBe(false);
    }
  });
});
