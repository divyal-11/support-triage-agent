import path from "path";
import { AgentResult, GoldenExample } from "./types";
import { runAgent, initializeAgent } from "./agent";
import { loadGoldenSet, saveJsonFile } from "./utils/data-loader";
import { evaluatePredictions, printEvaluationSummary } from "./utils/metrics";

const PREDICTIONS_PATH = path.join(__dirname, "../data/predictions-agent.json");

export async function runEvaluationOnGoldenSet() {
  console.log("=== Running Core AI Agent on Held-Out Golden Set (200 Samples) ===\n");

  const goldenSet: GoldenExample[] = loadGoldenSet();
  initializeAgent();

  const startTime = Date.now();
  const predictions: AgentResult[] = [];

  console.log(`Processing ${goldenSet.length} benchmark samples...`);

  for (let i = 0; i < goldenSet.length; i++) {
    const item = goldenSet[i]!;
    // excludeTweetId prevents self-retrieval during benchmarking
    const result = await runAgent(item.customer_text, item.customer_tweet_id, item.customer_tweet_id);
    predictions.push(result);

    if ((i + 1) % 50 === 0 || i + 1 === goldenSet.length) {
      console.log(`Progress: ${i + 1}/${goldenSet.length} samples processed...`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nCompleted 200 samples in ${durationSec}s (${(goldenSet.length / Number(durationSec)).toFixed(1)} samples/sec)!\n`);

  // 1. Save predictions
  saveJsonFile(PREDICTIONS_PATH, predictions);
  console.log(`✅ Saved agent predictions to: ${PREDICTIONS_PATH}`);

  // 2. Evaluate performance against ground truth
  const summary = evaluatePredictions("Support Triage Agent (Core System)", predictions, goldenSet);
  printEvaluationSummary(summary);

  // 3. Print 3-Way Comparative Benchmark Table
  console.log("=========================================================================================");
  console.log("HEADLINE BENCHMARK COMPARISON TABLE");
  console.log("=========================================================================================");
  console.log("Metric                          | Trivial Baseline | Simple Baseline | Real AI Agent (Ours)");
  console.log("--------------------------------|------------------|-----------------|---------------------");
  console.log(`Intent Accuracy                 | 39.00%           | 91.00%          | ${(summary.intent_accuracy * 100).toFixed(2)}%`);
  console.log(`Escalation Recall (Safety)      | 0.00%            | 65.45%          | ${(summary.escalation_recall * 100).toFixed(2)}%`);
  console.log(`Escalation Precision            | 0.00%            | 100.00%         | ${(summary.escalation_precision * 100).toFixed(2)}%`);
  console.log(`Escalation F1-Score             | 0.00%            | 79.12%          | ${(summary.escalation_f1 * 100).toFixed(2)}%`);
  console.log(`Missed Escalations (False Neg)  | 55 🚨             | 19 ⚠️           | ${summary.escalation_false_negatives} ${summary.escalation_false_negatives === 0 ? "🛡️ (PERFECT)" : "🛡️"}`);
  console.log("Reply Grounding Mechanism       | Static 1-liner   | Static Canned   | Dynamic RAG (25.5k tokens)");
  console.log("=========================================================================================\n");

  return summary;
}

if (require.main === module) {
  runEvaluationOnGoldenSet().catch(console.error);
}
