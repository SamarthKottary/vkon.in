import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone traces exactly the node_modules the server needs into
   * `.next/standalone`, so the runtime image ships ~150 MB instead of the whole
   * dependency tree. Required by the Dockerfile.
   */
  output: "standalone",

  images: {
    // Admin uploads are served same-origin from /media, so no remote patterns
    // are needed. Add one here only if you ever reference an external image host.
    formats: ["image/avif", "image/webp"],
  },

  // `pg` is a native-ish Node driver; keep it out of the bundler so it is
  // required at runtime on the server instead of being traced and inlined.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
