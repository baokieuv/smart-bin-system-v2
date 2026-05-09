import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s3.kvbhust.id.vn",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
