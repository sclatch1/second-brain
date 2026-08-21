import { runAgent } from "./services/agentService.js";

async function main() {
  const question = process.argv[2];
  if (!question) {
    console.error('Usage: tsx src/test-agent.ts "your question"');
    process.exit(1);
  }

  const result = await runAgent(question);
  console.log("\n--- Tool calls used ---");
  console.log(result.toolCallsUsed);
  console.log("\n--- Final answer ---");
  console.log(result.answer);
}

main().catch(console.error);