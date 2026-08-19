import "server-only";

import { headers } from "next/headers";
import QRCode from "qrcode";

/**
 * Phase 9 — the QR Poster / Notice-Board static QR. Always points at the
 * student portal home page (never a personalized/per-student link — see
 * the approved design). Built from the current request's own Host header
 * rather than a hardcoded env var: this project has never been deployed
 * yet (no production URL exists to configure), so deriving it per-request
 * means the QR is always correct for wherever the app is actually running
 * — localhost during development, the real domain once deployed — with
 * zero configuration required either way.
 */
export async function getStudentPortalUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const forwardedProto = headerList.get("x-forwarded-proto");
  const protocol = forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}/`;
}

/** Renders the QR as an inline SVG string — embeds directly in a page
 * (print-friendly, no extra network request, no client JS needed). */
export async function generateQrCodeSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, width: 320, color: { dark: "#0f172a", light: "#ffffff" } });
}
