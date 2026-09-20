import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server binds to `localhost`, and the Hermes preview pane (and any
  // other local tool) may open the page over a different local host. Next 16
  // blocks cross-origin dev resources by default, and a blocked /_next/hmr
  // request stops the client from booting — the page renders but never hydrates,
  // so nothing responds to clicks. Allow the local origins explicitly.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.10.113"],
};

export default nextConfig;
