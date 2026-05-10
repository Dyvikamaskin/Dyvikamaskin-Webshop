import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
  // Points to our getRequestConfig — default path, but explicit is safer.
  "./src/i18n/request.ts"
);

// ─── Security headers (Phase 6 hardening) ─────────────────────────────────────
//
// CSP ships in Report-Only mode first so we can verify the allow-list
// covers every legitimate origin before flipping to enforce. Violations
// land in the browser console + on `report-to`/`report-uri` if we wire
// one. After ~24h of clean reports in production, flip the header name
// from "Content-Security-Policy-Report-Only" to "Content-Security-Policy"
// in a follow-up commit.
//
// `unsafe-inline` and `unsafe-eval` are required for Next.js 16's
// Turbopack runtime + inline style attributes used throughout the
// storefront. Tightening these requires moving to nonce-based CSP, which
// is a larger refactor — deferred.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.vipps.no https://*.brightcdn.no",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.vipps.no https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://api.bring.com https://driven-gull-108963.upstash.io",
  "frame-src https://*.vipps.no",
  "frame-ancestors 'none'",
  "form-action 'self' https://*.vipps.no",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // Reject framing entirely; CSP frame-ancestors above is the modern
  // equivalent but X-Frame-Options is still required by older clients.
  { key: "X-Frame-Options", value: "DENY" },
  // MIME-sniffing is a downgrade vector for content-type confusion.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs to cross-origin destinations.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Permission policy: camera is needed for the barcode scanner; everything
  // else is denied. Lock down geolocation/microphone/payment in case any
  // dependency tries to request them silently.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  // HSTS: long max-age, includeSubDomains, preload-ready. Railway terminates
  // TLS so the production response is HTTPS already.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // CSP in Report-Only — flip header name once verified clean.
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  // Strict mode enabled for catching React issues early
  reactStrictMode: true,

  async headers() {
    return [
      {
        // Apply to every route, including API. The `headers()` function
        // wraps the response; it doesn't interfere with routing.
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
