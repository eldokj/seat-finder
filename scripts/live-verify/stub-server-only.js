// Stub for the "server-only" marker package — its real implementation
// throws unconditionally outside Next's webpack "react-server" condition,
// which would break this plain-Node script even though we ARE running
// legitimately server-side logic. Aliased in over the real package by
// build.mjs for this script only.
export {};
