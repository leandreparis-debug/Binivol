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
    return Promise.resolve([{ source: "/(.*)", headers: securityHeaders }]);
  },
};

export default nextConfig;
