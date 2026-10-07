import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingIncludes: {
    "/api/projects/[id]/export": ["./node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"],
  },
};

export default nextConfig;
