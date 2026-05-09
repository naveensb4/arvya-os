import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/**/__tests__/**/*.test.ts",
      "apps/web/**/__tests__/**/*.test.ts",
      "apps/web/**/__tests__/**/*.e2e.ts",
    ],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "apps/web") + "/",
      "@arvya/core": path.resolve(__dirname, "packages/core/src"),
      "@arvya/agents/tools/retrieve-brain-context": path.resolve(__dirname, "packages/agents/src/tools/retrieve-brain-context.ts"),
      "@arvya/agents/tools/linkedin-enrich": path.resolve(__dirname, "packages/agents/src/tools/linkedin-enrich.ts"),
      "@arvya/agents/tools/tone-analyze": path.resolve(__dirname, "packages/agents/src/tools/tone-analyze.ts"),
      "@arvya/agents/meeting-prep-agent": path.resolve(__dirname, "packages/agents/src/meeting-prep-agent.ts"),
      "@arvya/agents": path.resolve(__dirname, "packages/agents/src"),
      "@arvya/prompts/meeting-prep": path.resolve(__dirname, "packages/prompts/src/meeting-prep.ts"),
      "@arvya/prompts": path.resolve(__dirname, "packages/prompts/src"),
    },
  },
});
