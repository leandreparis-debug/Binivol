import type { NextConfig } from "next";

/**
 * Content Security Policy (step 15, docs/audit-securite.md). Everything from
 * the application's own origin; no third-party script, style, font or frame.
 * Scripts keep 'unsafe-inline' (Next.js inline bootstrap) until a per-request
 * nonce is introduced; 'unsafe-eval' only in development (React refresh).
 * The Google sign-in is a form POST followed by redirects: `form-action`
 * allows its origin.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
].join("; ");

/** Hardening headers applied to every route. */
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
  },
];

/**
 * The candidate's dossier (and its on-site mode): never cached, never
 * indexed, never sent as a referrer (the opening URL holds the token).
 */
const dossierHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // The official PDF templates and the Unicode font are read from disk at run
  // time (src/server/pdf/templates.ts): they ship with the server functions.
  outputFileTracingIncludes: {
    "/**": ["./assets/modeles/**", "./assets/fonts/**", "./docs/guides/*.md"],
  },
  // Metadata (the page <title>) is rendered in <head> before the content for every
  // client, not streamed after it: screen readers and axe always find the title.
  htmlLimitedBots: /.*/,
  // Enables `forbidden()` and `forbidden.tsx`: refused pages answer with a real 403.
  experimental: {
    authInterrupts: true,
    // Server Actions receive the legacy workbook (5 MB max) and documents (10 MB max).
    // 12 MB lets an 11 MB file reach the server, which refuses it with a clear message.
    serverActions: { bodySizeLimit: "12mb" },
  },
  headers() {
    // Later entries override earlier ones for the same key.
    return Promise.resolve([
      { source: "/(.*)", headers: securityHeaders },
      { source: "/dossier", headers: dossierHeaders },
      { source: "/dossier/:path*", headers: dossierHeaders },
      { source: "/benevoles/:ref/dossier/:path*", headers: dossierHeaders },
    ]);
  },
};

export default nextConfig;
