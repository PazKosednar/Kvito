import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

const fileEnv = loadDotenv({ quiet: true }).parsed ?? {};
const testDbUrl = process.env["DATABASE_URL_TEST"] ?? fileEnv["DATABASE_URL_TEST"];

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    // DB tests share one database; run files sequentially.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      // Unit tests never touch the DB; integration tests are skipped when DATABASE_URL_TEST is missing.
      DATABASE_URL: testDbUrl ?? "postgresql://unused@localhost:5432/unused",
      ...(testDbUrl ? { DATABASE_URL_TEST: testDbUrl } : {}),
      JWT_ACCESS_SECRET: "test-access-secret-that-is-at-least-32-chars",
      CLIENT_ORIGIN: "http://localhost:5180",
    },
  },
});
