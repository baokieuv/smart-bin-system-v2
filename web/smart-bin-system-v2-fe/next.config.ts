import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  allowedDevOrigins: ['kvbhust.id.vn', 'localhost:3000'],
};

export default nextConfig;
