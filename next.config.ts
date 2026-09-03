import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import packageJson from "./package.json" with { type: "json" };

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // nginx forwards the request URI unchanged (including the /workflow
  // prefix) - see nginx/workflow-builder.location.conf. Must stay in sync.
  basePath: "/workflow",
  // Baked in at build time (not per-request) - read by BuildInfo.tsx to show
  // a version/commit/build-time footer. NEXT_PUBLIC_-style values declared
  // here are inlined into the client bundle the same way env vars with that
  // prefix are.
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_GIT_COMMIT: gitCommit(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
