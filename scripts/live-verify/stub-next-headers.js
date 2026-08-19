// Stub for "next/headers" — only resolvable inside Next's own request-scoped
// runtime, not a plain Node script. Live-verify scripts never call anything
// that actually reads request headers (e.g. qr.ts's getStudentPortalUrl is
// never invoked, only its header-free sibling generateQrCodeSvg is) — this
// stub exists purely so the MODULE-LEVEL `import { headers } from
// "next/headers"` in files like qr.ts resolves at all. Aliased in over the
// real package by build.mjs for live-verify scripts only.
export function headers() {
  throw new Error("stub-next-headers: headers() was actually called — this live-verify script should not exercise that code path.");
}
