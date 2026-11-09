import { AgentResult, GoldenExample, EvaluationSummary } from "../types";

/**
 * Computes standard classification and escalation metrics
 * comparing model predictions against the Golden Evaluation Set.
 */
export function evaluatePredictions(
  modelName: string,
  predictions: AgentResult[],
  groundTruth: GoldenExample[]
): EvaluationSummary {
  if (predictions.length !== groundTruth.length) {
    throw new Error(
      `Mismatch: ${predictions.length} predictions vs ${groundTruth.length} ground truth examples`
    );
  }

  const truthMap = new Map<string, GoldenExample>();
  for (const item of groundTruth) {
    truthMap.set(item.customer_tweet_id, item);
  }

  let intentCorrect = 0;
  let tp = 0; // True Positive: both predicted escalate: true
  let fp = 0; // False Positive: predicted escalate: true, but gold was false
  let fn = 0; // False Negative: predicted escalate: false, but gold was true (Dangerous!)
  let tn = 0; // True Negative: both predicted escalate: false

  for (const pred of predictions) {
    const truth = truthMap.get(pred.customer_tweet_id);
    if (!truth) {
      throw new Error(`Ground truth missing for tweet ID ${pred.customer_tweet_id}`);
    }

    // 1. Intent Accuracy
    if (pred.predicted_intent === truth.intent) {
      intentCorrect++;
    }

    // 2. Escalation Metrics
    if (pred.should_escalate && truth.should_escalate) {
      tp++;
    } else if (pred.should_escalate && !truth.should_escalate) {
      fp++;
    } else if (!pred.should_escalate && truth.should_escalate) {
      fn++;
    } else {
      tn++;
    }
  }

  const total = predictions.length;
  const intentAccuracy = intentCorrect / total;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    model_name: modelName,
    total_evaluated: total,
    intent_accuracy: intentAccuracy,
    intent_correct: intentCorrect,
    escalation_precision: precision,
    escalation_recall: recall,
    escalation_f1: f1,
    escalation_true_positives: tp,
    escalation_false_positives: fp,
    escalation_false_negatives: fn,
    escalation_true_negatives: tn,
  };
}

/**
 * Prints a clean Markdown-compatible performance table.
 */
export function printEvaluationSummary(summary: EvaluationSummary): void {
  console.log(`\n======================================================`);
  console.log(`EVALUATION REPORT: ${summary.model_name}`);
  console.log(`======================================================`);
  console.log(`Total Samples:       ${summary.total_evaluated}`);
  console.log(
    `Intent Accuracy:     ${(summary.intent_accuracy * 100).toFixed(2)}% (${summary.intent_correct}/${summary.total_evaluated})`
  );
  console.log(`------------------------------------------------------`);
  console.log(`ESCALATION METRICS:`);
  console.log(`- Precision:         ${(summary.escalation_precision * 100).toFixed(2)}% (when it escalates, is it right?)`);
  console.log(`- Recall:            ${(summary.escalation_recall * 100).toFixed(2)}% (of all true escalations, how many caught?)`);
  console.log(`- F1-Score:          ${(summary.escalation_f1 * 100).toFixed(2)}%`);
  console.log(`------------------------------------------------------`);
  console.log(`CONFUSION MATRIX:`);
  console.log(`- True Positives:    ${summary.escalation_true_positives} (Safely escalated)`);
  console.log(`- False Positives:   ${summary.escalation_false_positives} (Unneeded human handoff)`);
  console.log(`- False Negatives:   ${summary.escalation_false_negatives} ⚠️ (CRITICAL: Missed escalation!)`);
  console.log(`- True Negatives:    ${summary.escalation_true_negatives} (Safely auto-handled)`);
  console.log(`======================================================\n`);
}

