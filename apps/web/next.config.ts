import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Force Turbopack to treat this app directory as the workspace root
    // so it uses the local package-lock and dependencies (e.g. @tanstack/react-table).
    root: path.join(__dirname),
  },
  async redirects() {
    return [
      {
        source: '/settings',
        destination: '/customizations',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
