import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./scripts/test-env.ts";

// On Windows a lower-case drive letter ("c:\...") makes Vitest load two copies of itself
// ("Vitest failed to find the current suite"); `pnpm test` launches through scripts/vitest.mjs.
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());

export default defineConfig({
  root,
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}", "apps/api/src/**/*.test.ts", "apps/web/src/**/*.test.ts"],
    globalSetup: ["./scripts/test-global-setup.ts"],
    // DB-backed suites share one test database, so files run one at a time.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      MAIL_TRANSPORT: "memory",
      ADMIN_TOKEN: "test-admin-token-123",
      RATE_LIMITS: "off",
      APP_ORIGIN: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
  },
});
