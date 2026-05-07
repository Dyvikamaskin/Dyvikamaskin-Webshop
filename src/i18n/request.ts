import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // Resolve the requested locale; fall back to the default if unrecognised.
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as "nb")) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
