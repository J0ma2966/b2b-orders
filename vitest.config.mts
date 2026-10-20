import { defineConfig } from "vitest/config";
import path from "node:path";

const testDb = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    env: testDb ? { DATABASE_URL: testDb } : {},
    fileParallelism: false,
  },
});
