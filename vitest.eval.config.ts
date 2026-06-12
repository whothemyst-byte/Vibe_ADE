import { defineConfig } from "vitest/config";

// Live model evals (cost free-tier quota; need GROQ_API_KEY). Run: npm run vibe:eval
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/vibe/eval.live.test.ts"],
    testTimeout: 30000,
  },
});
