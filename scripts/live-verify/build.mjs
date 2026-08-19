import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const entry = process.argv[2] ?? "phase10-perf-benchmark.mjs";

await build({
  entryPoints: [path.join(__dirname, entry)],
  outfile: path.join(__dirname, entry.replace(/\.mjs$/, ".bundle.mjs")),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  absWorkingDir: projectRoot,
  tsconfig: path.join(projectRoot, "tsconfig.json"),
  alias: {
    "server-only": path.join(__dirname, "stub-server-only.js"),
    "next/headers": path.join(__dirname, "stub-next-headers.js"),
  },
  packages: "external",
  logLevel: "info",
});
