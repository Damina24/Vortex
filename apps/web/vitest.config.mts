import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Unit-test config for the Next.js app. Only pure-logic modules are tested
 * here (billing packages, credit ledger), so a plain Node environment is
 * sufficient — no jsdom / React DOM needed.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
