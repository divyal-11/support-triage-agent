import path from "path";
import { AgentResult, GoldenExample } from "./types";
import { loadGoldenSet, saveJsonFile } from "./utils/data-loader";
import { evaluatePredictions, printEvaluationSummary } from "./utils/metrics";

const PREDICTIONS_PATH = path.join(__dirname, "../data/predictions-trivial.json");

/**
 * Trivial Baseline:
 * - Always predicts the majority class (`feedback_or_complaint`).
 * - Always predicts `should_escalate: false` (blind auto-handle).
 * - Zero retrieval, static generic canned response.
 */
export function runTrivialBaseline(example: GoldenExample): AgentResult {
  return {
    customer_tweet_id: example.customer_tweet_id,
    customer_text: example.customer_text,
    predicted_intent: "feedback_or_complaint",
    confidence: 1.0,
    retrieved_examples: [],
    drafted_reply:
      "Hi there! Thanks for reaching out. We appreciate your feedback and have noted it down /Spotify",
    should_escalate: false,
    escalate_reason: "Trivial baseline policy: always auto-handle without human escalation.",
  };
}

export function evaluateTrivialBaseline() {
  console.log("Loading Golden Set for Trivial Baseline evaluation...");
  const goldenSet = loadGoldenSet();

  console.log(`Running Trivial Baseline across ${goldenSet.length} samples...`);
  const predictions: AgentResult[] = goldenSet.map(runTrivialBaseline);

  // Save predictions
  saveJsonFile(PREDICTIONS_PATH, predictions);
  console.log(`Saved trivial baseline predictions to: ${PREDICTIONS_PATH}`);

  // Evaluate against ground truth
  const summary = evaluatePredictions("Trivial Baseline (Majority Class)", predictions, goldenSet);
  printEvaluationSummary(summary);

  return summary;
}

if (require.main === module) {
  evaluateTrivialBaseline();
}

