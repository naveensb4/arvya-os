import { config } from "dotenv";
import { formatEvalSummary, runClosedLoopEvals } from "@arvya/agents/evals/runner";
import { getAiClient, resetAiClientForTests } from "../lib/ai";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

async function main() {
  resetAiClientForTests();
  const ai = getAiClient();
  if (ai.available) {
    console.log(
      `Running closed-loop evals against AI provider: ${ai.preferredProvider}`,
    );
  } else {
    console.log(
      "Running closed-loop evals against deterministic fallback (no AI key configured).",
    );
  }

  const summary = await runClosedLoopEvals({ ai: ai.available ? ai : undefined });
  console.log(formatEvalSummary(summary));

  const failed = summary.fixtures.filter((fixture) => fixture.error);
  console.log(`AGENT_EVALS_SCORE=${summary.aggregateScore.toFixed(3)}`);
  if (failed.length > 0) {
    console.error(`${failed.length} fixture(s) errored — see details above.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
