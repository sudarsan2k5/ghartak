import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@ghartak/contracts"],
  agentRules: false,
};

export default nextConfig;
