import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Actions default to a 1 MB request body limit, independent of
  // (and lower than) this app's own upload validation, which has always
  // intended to allow files up to 5 MB (see MAX_FILE_SIZE_BYTES in
  // src/lib/excel/parse.ts) — without this, any upload over 1 MB fails at
  // the framework level before that validation code ever runs, regardless
  // of file content. Raised to match the app's own documented limit.
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  // Phase 10 — safe baseline security headers only. Deliberately NOT
  // adding a Content-Security-Policy here: CSP is high-value but also the
  // header most likely to silently break something (inline styles/scripts,
  // third-party embeds) without careful per-directive tuning — that's a
  // separate, deliberate piece of work, not bundled into this pass.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Never allow this app to be framed — the admin portal and the
          // student portal both have no legitimate reason to be embedded.
          { key: "X-Frame-Options", value: "DENY" },
          // Stop browsers from MIME-sniffing responses into an
          // unintended content type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak the full referring URL (which could contain a
          // register number in a query string, admin route paths, etc.)
          // to third-party destinations.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
