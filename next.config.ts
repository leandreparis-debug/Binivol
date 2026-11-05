import type { NextConfig } from "next";

/**
 * Basic hardening headers applied to every route. CSP will be added once the
 * authentication flow (step 3) settles which origins are needed.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
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
