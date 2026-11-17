import path from "path";
import { ConversationPair, IntentLabel, VALID_INTENTS } from "./types";
import { loadSpotifyPairs, loadGoldenSet, saveJsonFile } from "./utils/data-loader";

const OUTPUT_PATH = path.join(__dirname, "../data/silver-set.json");
const MAX_SAMPLES_PER_INTENT = 250; // Balanced sampling per intent bucket

export interface SilverExample {
  customer_tweet_id: string;
  customer_text: string;
  brand_reply_text: string;
  weak_intent: IntentLabel;
}

/**
 * Weak supervision rule-based labeling function.
 * Maps raw customer tweets + Spotify reply signals into one of the 8 intent classes.
 */
function assignWeakIntent(customerText: string, replyText: string): IntentLabel {
  const text = customerText.toLowerCase();
  const reply = replyText.toLowerCase();

  // 1. Account Access & Security
  if (
    /password|reset|login|log in|logged out|cant sign in|can't sign in|unable to sign in|csrf|hacked|compromised|account details|email address/i.test(
      text
    ) ||
    (text.includes("account") && (text.includes("access") || text.includes("details") || text.includes("locked")))
  ) {
    return "account_access_security";
  }

  // 2. Billing & Payment Disputes
  if (
    /charged|charge|charging|payment|paid|refund|bill|billing|invoice|paypal|card|receipt|deducted|unauthorized|subscript|student discount|unidays/i.test(
      text
    ) &&
    !text.includes("family")
  ) {
    return "billing_payment_dispute";
  }

  // 3. Family / Duo Plan Linkage
  if (/family|family plan|duo|invite|sub-account|member.*free|head of household/i.test(text)) {
    return "subscription_plan_family";
  }

  // 4. Offline Downloads
  if (/download|downloaded|downloads|offline|greyed|grayed out|airplane/i.test(text)) {
    return "offline_downloads_issue";
  }

  // 5. App Crash & Performance
  if (/crash|crashing|crashes|freeze|freezing|force close|shut down|wont open|won't open|black screen|overheat/i.test(text)) {
    return "app_crash_performance";
  }

  // 6. Content Catalog Request
  if (
    /album|song|artist|music|track|ost|soundtrack|clean version|explicit|release|when is.*available|not available|missing song|mixtape/i.test(
      text
    ) &&
    !/play|pause|stop|skip|volume|sound/i.test(text)
  ) {
    return "content_catalog_request";
  }

  // 7. Playback & Audio Control
  if (
    /play|playing|pause|pauses|pausing|skip|skipping|shuffle|repeat|volume|sound|stutter|bluetooth|scrobble|audio|carplay|chromecast/i.test(
      text
    )
  ) {
    return "playback_audio_issue";
  }

  // 8. General Feedback, Complaint, or Venting
  return "feedback_or_complaint";
}

/**
 * Clean text to filter out very short, uninformative tweets
 */
function isValidTrainingTweet(text: string): boolean {
  const clean = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .trim();
  const words = clean.split(/\s+/).filter((w) => w.length > 1);
  return words.length >= 3;
}

export function buildSilverSet(): SilverExample[] {
  console.log("=== Building Weakly Supervised Silver Training Set ===");

  // 1. Load full pairs and golden set
  const allPairs = loadSpotifyPairs();
  const goldenSet = loadGoldenSet();

  // 2. Build set of Golden Set Tweet IDs for STRICT EXCLUSION (No data leakage!)
  const goldenIds = new Set<string>(goldenSet.map((g) => g.customer_tweet_id));
  console.log(`Loaded ${allPairs.length} total pairs.`);
  console.log(`Strictly excluding ${goldenIds.size} Golden Set IDs to prevent data leakage.`);

  // 3. Filter candidate pool
  const candidatePool = allPairs.filter(
    (p) => !goldenIds.has(p.customer_tweet_id) && isValidTrainingTweet(p.customer_text)
  );
  console.log(`Available training pool after exclusion: ${candidatePool.length} pairs.`);

  // 4. Distribute candidates into intent buckets with a balance cap
  const bucketMap: Record<IntentLabel, SilverExample[]> = {
    playback_audio_issue: [],
    offline_downloads_issue: [],
    app_crash_performance: [],
    content_catalog_request: [],
    billing_payment_dispute: [],
    account_access_security: [],
    subscription_plan_family: [],
    feedback_or_complaint: [],
  };

  for (const pair of candidatePool) {
    const intent = assignWeakIntent(pair.customer_text, pair.brand_reply_text);
    if (bucketMap[intent].length < MAX_SAMPLES_PER_INTENT) {
      bucketMap[intent].push({
        customer_tweet_id: pair.customer_tweet_id,
        customer_text: pair.customer_text,
        brand_reply_text: pair.brand_reply_text,
        weak_intent: intent,
      });
    }
  }

  // 5. Aggregate balanced silver set
  const silverSet: SilverExample[] = [];
  console.log("\n--- Silver Training Set Distribution ---");
  for (const intent of VALID_INTENTS) {
    const count = bucketMap[intent].length;
    console.log(`- ${intent}: ${count} examples`);
    silverSet.push(...bucketMap[intent]);
  }

  console.log(`\nTotal Silver Training Examples: ${silverSet.length}`);

  // 6. Save to data/silver-set.json
  saveJsonFile(OUTPUT_PATH, silverSet);
  console.log(`✅ Saved silver set to: ${OUTPUT_PATH}\n`);

  return silverSet;
}

if (require.main === module) {
  buildSilverSet();
}
