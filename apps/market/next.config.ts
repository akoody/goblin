import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/market',
  output: 'standalone',
  async redirects() {return [{source:'/orders',destination:'/purchases',permanent:false},{source:'/sell',destination:'/',permanent:false}];},
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
};

export default nextConfig;
