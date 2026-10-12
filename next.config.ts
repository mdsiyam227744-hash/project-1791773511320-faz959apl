import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All imagery is local (inline SVG / generated assets). No remote image hosts are configured,
  // so external images are intentionally not allowed.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
