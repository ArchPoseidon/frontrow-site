import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimised images (concert backdrops, artist photos) are reused for a month instead of re-fetched.
  images: { minimumCacheTTL: 60 * 60 * 24 * 30 },
  async headers() {
    return [{ source: "/concert/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }] }];
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
