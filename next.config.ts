import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
  // Points to our getRequestConfig — default path, but explicit is safer.
  "./src/i18n/request.ts"
);

const nextConfig: NextConfig = {
  // Strict mode enabled for catching React issues early
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
