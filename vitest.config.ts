import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // .env.local carries TYPESAFE_API_KEY for the live smoke test; without it that
  // test skips and everything else still runs.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      testTimeout: 30_000,
      env: {
        TYPESAFE_API_KEY: env.TYPESAFE_API_KEY ?? "",
        TYPESAFE_DEFAULT_MODEL: env.TYPESAFE_DEFAULT_MODEL ?? "",
        JEV_TIMEOUT_MS: env.JEV_TIMEOUT_MS ?? "",
        JEV_MOCK: env.JEV_MOCK ?? "",
      },
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL(".", import.meta.url)),
      },
    },
  };
});
