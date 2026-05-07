import { defineRouting } from "next-intl/routing";

/**
 * Single-locale (nb) routing config.
 * localePrefix: "never" means /nb/ never appears in URLs.
 * Add more locales here if English support is needed later.
 */
export const routing = defineRouting({
  locales: ["nb"],
  defaultLocale: "nb",
  localePrefix: "never",
});
