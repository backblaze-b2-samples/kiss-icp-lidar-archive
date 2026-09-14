import type { NextConfig } from "next";

// Allow `next/image` to optimize remote previews coming from Backblaze B2.
// Presigned download URLs use the bucket-specific S3 hostname pattern:
//   <bucket>.s3.<region>.backblazeb2.com    (path-style and virtual-host)
//   s3.<region>.backblazeb2.com             (path-style)
// One wildcard covers every region + bucket, so this config drops in
// without per-deployment tweaks.
const nextConfig: NextConfig = {
  transpilePackages: ["@kiss-icp-lidar-archive/shared"],
  // Dev-only: the Playwright harness (see playwright.config.ts) drives the app
  // at 127.0.0.1 while `next dev` defaults to trusting only `localhost`, so
  // every JS chunk request was blocked as cross-origin and the app never
  // hydrated when driven via 127.0.0.1.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.backblazeb2.com",
      },
    ],
  },
};

export default nextConfig;
