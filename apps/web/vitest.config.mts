import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

/**
 * Unit-test config for the Next.js app. Only pure-logic modules are tested
 * here (billing packages, credit ledger, generation pipeline), so a plain
 * Node environment is sufficient — no jsdom / React DOM needed.
 */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
    },
  },
});
