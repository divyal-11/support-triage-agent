import path from "path";
import { AgentResult, IntentLabel } from "./types";
import { intentClassifier } from "./classifier";
import { retrievalEngine } from "./retrieval";
import { draftGroundedReply } from "./generate-reply";
import { evaluateEscalationPolicy } from "./escalation-policy";
import { loadSpotifyPairs } from "./utils/data-loader";

const MODEL_PATH = path.join(__dirname, "../data/classifier-model.json");

let isInitialized = false;

/**
 * Preloads classifier weights and in-memory retrieval index.
 * Ensures subsequent inference runs in sub-10 milliseconds.
 */
export function initializeAgent(): void {
  if (isInitialized) return;

  console.log("Initializing AI Support Triage Agent...");

  // 1. Load trained classifier model
  if (!intentClassifier.isLoaded()) {
    intentClassifier.loadModel(MODEL_PATH);
  }

  // 2. Build in-memory retrieval index
  const pairs = loadSpotifyPairs();
  retrievalEngine.indexCorpus(pairs);

  isInitialized = true;
  console.log("Agent initialized and ready for inference.\n");
}

/**
 * End-to-end agent execution pipeline.
 * Takes a customer tweet and returns a complete, grounded, safe AgentResult.
 */
export async function runAgent(
  customerText: string,
  tweetId: string = "runtime-query",
  excludeTweetId?: string
): Promise<AgentResult> {
  if (!isInitialized) {
    initializeAgent();
  }

  // 1. Step 5a: Predict Intent & Confidence
  const classification = intentClassifier.predict(customerText);
  const predictedIntent = classification.predicted_intent;
  const confidence = classification.confidence;

  // 2. Step 5b: Retrieve Top-3 Historical Resolved Cases (RAG)
  // excludeTweetId prevents self-retrieval during benchmarking
  const retrievedCases = retrievalEngine.search(customerText, 3, excludeTweetId);

  // 3. Step 5d: Evaluate Deterministic Escalation Policy
  const escalation = evaluateEscalationPolicy(customerText, predictedIntent, confidence);

  // 4. Step 5c: Draft Grounded Reply
  const cacheKey = `agent-${tweetId}`;
  const draft = await draftGroundedReply(customerText, predictedIntent, retrievedCases, cacheKey);

  return {
    customer_tweet_id: tweetId,
    customer_text: customerText,
    predicted_intent: predictedIntent,
    confidence,
    retrieved_examples: retrievedCases.map((r) => ({
      customer_text: r.customer_text,
      brand_reply_text: r.brand_reply_text,
    })),
    drafted_reply: draft.reply,
    should_escalate: escalation.should_escalate,
    escalate_reason: escalation.escalate_reason,
  };
}

/**
 * Interactive CLI runner to test individual live queries.
 */
async function testAgentLive() {
  initializeAgent();

  const sampleTweets = [
    "My music pauses automatically whenever I lock my phone screen, please help!",
    "Why was my card charged $9.99 after I already cancelled my subscription?",
    "Hey @SpotifyCares when is the new Taylor Swift album coming out?",
    "I can't log in and the password reset says CSRF invalid token",
  ];

  console.log("=== Testing End-to-End AI Support Triage Agent ===\n");

  for (const tweet of sampleTweets) {
    console.log(`CUSTOMER TWEET: "${tweet}"`);
    const result = await runAgent(tweet);
    console.log(`-> INTENT:      ${result.predicted_intent} (Confidence: ${(result.confidence * 100).toFixed(1)}%)`);
    console.log(`-> ESCALATE:    ${result.should_escalate ? "🚨 YES" : "✅ NO"}`);
    console.log(`-> REASON:      ${result.escalate_reason}`);
    console.log(`-> DRAFT REPLY: "${result.drafted_reply}"`);
    console.log(`-> RETRIEVED:   ${result.retrieved_examples.length} past cases used for grounding`);
    console.log("--------------------------------------------------------------------------------\n");
  }
}

if (require.main === module) {
  testAgentLive().catch(console.error);
}
