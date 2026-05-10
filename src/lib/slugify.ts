/**
 * Norwegian-friendly slugifier — Phase 0.6.
 *
 * Rules:
 *   1. Lowercase.
 *   2. Replace Norwegian letters with ASCII transliterations:
 *        æ → ae, ø → o, å → a, ä → a, ö → o, ü → u, é/è/ê/ë → e, etc.
 *   3. Replace any other non-alphanumeric run with a single dash.
 *   4. Trim leading and trailing dashes.
 *
 * Stability: deterministic. Same input always produces the same slug,
 * which lets `findOrCreateCategoryByPath` be safely idempotent.
 *
 * Examples:
 *   "Hydraulikk"              → "hydraulikk"
 *   "Verktøy og maskiner"     → "verktoy-og-maskiner"
 *   "Olje & kjemikalier"      → "olje-kjemikalier"
 *   "Skruer/Bolter"           → "skruer-bolter"
 *   "  Lagre &  ledd  "       → "lagre-ledd"
 *   "ÆØÅ"                     → "aeoa"
 *   "Léon Müller"             → "leon-muller"
 */

const TRANSLIT: Record<string, string> = {
  // Norwegian / Danish
  "æ": "ae",
  "ø": "o",
  "å": "a",
  // Swedish
  "ä": "a",
  "ö": "o",
  // German / extended Latin
  "ü": "u",
  "ß": "ss",
  // Common diacritics
  "á": "a", "à": "a", "â": "a", "ã": "a",
  "é": "e", "è": "e", "ê": "e", "ë": "e",
  "í": "i", "ì": "i", "î": "i", "ï": "i",
  "ó": "o", "ò": "o", "ô": "o", "õ": "o",
  "ú": "u", "ù": "u", "û": "u",
  "ñ": "n",
  "ç": "c",
  "ý": "y", "ÿ": "y",
};

export function slugify(input: string): string {
  if (!input) return "";

  // Lowercase first so the transliteration map only needs lowercase keys.
  let s = input.toLowerCase();

  // Apply transliterations character-by-character.
  let out = "";
  for (const ch of s) {
    out += TRANSLIT[ch] ?? ch;
  }
  s = out;

  // Strip combining diacritics (NFD then drop ̀-ͯ) for any
  // Latin-with-accent characters not in the explicit map.
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Replace any run of non-alphanumeric characters with a single dash.
  s = s.replace(/[^a-z0-9]+/g, "-");

  // Trim leading and trailing dashes.
  s = s.replace(/^-+|-+$/g, "");

  return s;
}
