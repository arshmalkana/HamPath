import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

const config: NextConfig = {
  transpilePackages: ["@hampath/ham-sim"],
  // The browser talks to /api/v1 on the same origin so the session cookie is first-party.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default config;
