import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_NEXORA_MODE:
      process.env.NEXORA_MODE === "demo"
        ? "demo"
        : process.env.NEXORA_MODE === "local"
          ? "local"
          : process.env.VERCEL
            ? "demo"
            : "local",
  },
};

export default nextConfig;
