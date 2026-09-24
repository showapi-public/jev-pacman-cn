import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server binds to `localhost`, and the Hermes preview pane (and any
  // other local tool) may open the page over a different local host. Next 16
  // blocks cross-origin dev resources by default, and a blocked /_next/hmr
  // request stops the client from booting — the page renders but never hydrates,
  // so nothing responds to clicks. Allow the local origins explicitly.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.10.113"],

  // 部署形态：`next build` 额外产出 .next/standalone —— 一个自包含的最小运行时
  // （server.js + 只含实际用到的依赖的 node_modules），上传到服务器后直接
  // `node server.js`，服务器上不需要 npm install。
  // deploy/deploy.sh 依赖这个产物；本地开发（next dev）不受影响。
  output: "standalone",
};

export default nextConfig;
