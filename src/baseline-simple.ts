import path from "path";
import { AgentResult, GoldenExample, IntentLabel } from "./types";
import { loadGoldenSet, saveJsonFile } from "./utils/data-loader";
import { evaluatePredictions, printEvaluationSummary } from "./utils/metrics";

const PREDICTIONS_PATH = path.join(__dirname, "../data/predictions-simple.json");

/**
 * Canned replies per intent category (no dynamic LLM or retrieval).
 */
const CANNED_REPLIES: Record<IntentLabel, string> = {
  billing_payment_dispute:
    "Hi! For any payment or billing questions, please send us a DM with your account email address so we can look backstage /Spotify",
  account_access_security:
    "Hey! For your security, please shoot us a DM with your account username or email and we'll help you regain access /Spotify",
  subscription_plan_family:
    "Hi there! To sort out your Family plan members, please send us a DM with the email addresses on the plan /Spotify",
  offline_downloads_issue:
    "Hi! Check out our support guide on downloads unexpectedly removed at https://support.spotify.com. Let us know if that helps /Spotify",
  app_crash_performance:
    "Hey! Could you try performing a clean reinstall of the app? Also make sure your device OS is up to date /Spotify",
  content_catalog_request:
    "Hello! Music availability depends on artist licensing agreements. We hope to add it soon! /Spotify",
  playback_audio_issue:
    "Hi! Does restarting your device and checking your audio output settings resolve the issue? /Spotify",
  feedback_or_complaint:
    "Hi there! Thanks for reaching out and sharing your thoughts. We've passed this along to our product team /Spotify",
};

/**
 * Simple Baseline:
 * - Keyword matching heuristic.
 * - Deterministic canned replies (no LLM, no dynamic retrieval).
 * - Fixed escalation rules based on high-risk keywords.
 */
export function runSimpleBaseline(example: GoldenExample): AgentResult {
  const text = example.customer_text.toLowerCase();

  let predictedIntent: IntentLabel = "feedback_or_complaint";
  let shouldEscalate = false;
  let escalateReason = "";
  let confidence = 0.5;

  // 1. Account Access & Security
  if (/password|reset|login|log in|cant sign in|can't sign in|hacked|csrf|compromised|locked out/i.test(text)) {
    predictedIntent = "account_access_security";
    shouldEscalate = true;
    escalateReason = "Keyword match: Account security keywords detected.";
    confidence = 0.8;
  }
  // 2. Billing & Payment Disputes
  else if (/charged|charge|refund|bill|billing|paypal|receipt|deducted|payment|paid/i.test(text)) {
    predictedIntent = "billing_payment_dispute";
    shouldEscalate = true;
    escalateReason = "Keyword match: Billing or financial charge keywords detected.";
    confidence = 0.8;
  }
  // 3. Family Plan Linkage
  else if (/family|family plan|duo|invite/i.test(text)) {
    predictedIntent = "subscription_plan_family";
    shouldEscalate = true;
    escalateReason = "Keyword match: Family plan invitation or member keywords detected.";
    confidence = 0.75;
  }
  // 4. Offline Downloads
  else if (/download|downloaded|downloads|offline|greyed|grayed/i.test(text)) {
    predictedIntent = "offline_downloads_issue";
    shouldEscalate = false;
    confidence = 0.75;
  }
  // 5. App Crash & Performance
  else if (/crash|crashing|freeze|freezing|force close|shut down/i.test(text)) {
    predictedIntent = "app_crash_performance";
    shouldEscalate = false;
    confidence = 0.75;
  }
  // 6. Content Catalog Request
  else if (/album|song|artist|track|music|ost|clean version|explicit/i.test(text) && !/play|pause|skip/i.test(text)) {
    predictedIntent = "content_catalog_request";
    shouldEscalate = false;
    confidence = 0.7;
  }
  // 7. Playback & Audio
  else if (/play|playing|pause|shuffle|repeat|skip|volume|sound|stutter|bluetooth/i.test(text)) {
    predictedIntent = "playback_audio_issue";
    shouldEscalate = false;
    confidence = 0.7;
  }
  // 8. Fallback: General feedback / complaint
  else {
    predictedIntent = "feedback_or_complaint";
    shouldEscalate = false;
    confidence = 0.4;
  }

  return {
    customer_tweet_id: example.customer_tweet_id,
    customer_text: example.customer_text,
    predicted_intent: predictedIntent,
    confidence,
    retrieved_examples: [],
    drafted_reply: CANNED_REPLIES[predictedIntent],
    should_escalate: shouldEscalate,
    escalate_reason: escalateReason,
  };
}

export function evaluateSimpleBaseline() {
  console.log("Loading Golden Set for Simple Baseline evaluation...");
  const goldenSet = loadGoldenSet();

  console.log(`Running Simple Baseline across ${goldenSet.length} samples...`);
  const predictions: AgentResult[] = goldenSet.map(runSimpleBaseline);

  // Save predictions
  saveJsonFile(PREDICTIONS_PATH, predictions);
  console.log(`Saved simple baseline predictions to: ${PREDICTIONS_PATH}`);

  // Evaluate against ground truth
  const summary = evaluatePredictions("Simple Baseline (Keyword Matcher + Canned Replies)", predictions, goldenSet);
  printEvaluationSummary(summary);

  return summary;
}

if (require.main === module) {
  evaluateSimpleBaseline();
}

