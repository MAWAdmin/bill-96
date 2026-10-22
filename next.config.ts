import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the e2e test server build into its own folder alongside `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the project root. Otherwise a stray package-lock.json in a parent
  // folder (e.g. the home folder) makes Next.js treat that folder as the root.
  outputFileTracingRoot: path.join(__dirname),
  // These packages ship native binaries / WASM and spawn processes; they must
  // be loaded by Node at runtime rather than bundled by webpack.
  serverExternalPackages: ["playwright", "playwright-core", "@electric-sql/pglite", "pg"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
