import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen in FloorDrop is per-user and live, so we opt out of Cache Components
  // and render dynamically. See DECISIONS.md.
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "web-push"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }] },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
