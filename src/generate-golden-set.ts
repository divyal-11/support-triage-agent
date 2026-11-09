import fs from "fs";
import path from "path";
import { GoldenExample, IntentLabel, VALID_INTENTS } from "./types";

const INPUT_PATH = path.join(__dirname, "../data/golden-set-unlabeled.json");
const OUTPUT_PATH = path.join(__dirname, "../data/golden-set.json");

interface UnlabeledItem {
  sample_index: number;
  customer_tweet_id: string;
  customer_text: string;
  brand_reply_text: string;
}

/**
 * Classify a customer tweet based on domain heuristics grounded in the Spotify dataset.
 * Priority rule: Security/Account > Billing > Family Plan > Downloads > Crash > Playback > Catalog > Feedback.
 */
function assignGoldLabel(customerText: string, replyText: string): {
  intent: IntentLabel;
  should_escalate: boolean;
  escalate_reason: string;
  ideal_reply_notes: string;
} {
  const text = customerText.toLowerCase();
  const reply = replyText.toLowerCase();

  // 1. Account Access / Security
  if (
    /password|reset|login|log in|logged out|cant sign in|can't sign in|unable to sign in|csrf|hacked|chinese symbol|compromised|account details|email address/i.test(
      text
    ) ||
    (text.includes("account") && (text.includes("access") || text.includes("details") || text.includes("locked")))
  ) {
    return {
      intent: "account_access_security",
      should_escalate: true,
      escalate_reason: "Account security, login failure, or potential compromise requiring private verification.",
      ideal_reply_notes: "Request private DM with account email/username; do not troubleshoot security publicly.",
    };
  }

  // 2. Billing & Payment Dispute
  if (
    /charged|charge|charging|payment|paid|refund|bill|billing|invoice|paypal|card|receipt|deducted|unauthorized|subscript|student discount|unidays/i.test(
      text
    ) &&
    !text.includes("family")
  ) {
    return {
      intent: "billing_payment_dispute",
      should_escalate: true,
      escalate_reason: "Financial transaction dispute requiring account lookup and billing reconciliation.",
      ideal_reply_notes: "Acknowledge billing concern with empathy, route to private DM for payment lookup.",
    };
  }

  // 3. Subscription Plan (Family / Duo)
  if (/family|family plan|duo|invite|sub-account|member.*free|head of household/i.test(text)) {
    return {
      intent: "subscription_plan_family",
      should_escalate: true,
      escalate_reason: "Multi-user subscription linkage and physical address verification requires backend lookup.",
      ideal_reply_notes: "Direct user to DM to verify address matching and family plan owner details.",
    };
  }

  // 4. Offline Downloads Issue
  if (/download|downloaded|downloads|offline|greyed|grayed out|airplane/i.test(text)) {
    return {
      intent: "offline_downloads_issue",
      should_escalate: false,
      escalate_reason: "",
      ideal_reply_notes: "Provide troubleshooting steps for storage/SD card and link to downloads FAQ guide.",
    };
  }

  // 5. App Crash & Performance
  if (/crash|crashing|crashes|freeze|freezing|force close|shut down|wont open|won't open|black screen|overheat/i.test(text)) {
    return {
      intent: "app_crash_performance",
      should_escalate: false,
      escalate_reason: "",
      ideal_reply_notes: "Ask for device model, OS version, and exact Spotify build; suggest clean reinstall.",
    };
  }

  // 6. Content Catalog Request
  if (
    /album|song|artist|music|track|ost|soundtrack|clean version|explicit|release|when is.*available|not available|missing song|mixtape/i.test(
      text
    ) &&
    !/play|pause|stop|skip|volume|sound/i.test(text)
  ) {
    return {
      intent: "content_catalog_request",
      should_escalate: false,
      escalate_reason: "",
      ideal_reply_notes: "Explain music licensing/rights restrictions and provide music request link.",
    };
  }

  // 7. Playback & Audio Issues
  if (
    /play|playing|pause|pauses|pausing|skip|skipping|shuffle|repeat|volume|sound|stutter|bluetooth|scrobble|audio|carplay|chromecast/i.test(
      text
    )
  ) {
    return {
      intent: "playback_audio_issue",
      should_escalate: false,
      escalate_reason: "",
      ideal_reply_notes: "Suggest restarting device, checking audio output/Bluetooth settings, and reinstalling.",
    };
  }

  // 8. General Feedback, Venting, or Support Complaints
  return {
    intent: "feedback_or_complaint",
    should_escalate: reply.includes("dm us") || reply.includes("reply to your dm"),
    escalate_reason: reply.includes("dm")
      ? "User expresses severe dissatisfaction requiring customer care specialist intervention."
      : "",
    ideal_reply_notes: "Acknowledge user feedback with empathy, explain current product roadmap or channel options.",
  };
}

export function generateGoldenSet() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Unlabeled data file not found at ${INPUT_PATH}`);
  }

  const raw = fs.readFileSync(INPUT_PATH, "utf-8");
  const items: UnlabeledItem[] = JSON.parse(raw);

  console.log(`Processing ${items.length} samples into Golden Evaluation Set...`);

  const goldenSet: GoldenExample[] = items.map((item) => {
    const labelData = assignGoldLabel(item.customer_text, item.brand_reply_text);
    return {
      customer_tweet_id: item.customer_tweet_id,
      customer_text: item.customer_text,
      brand_reply_text: item.brand_reply_text,
      intent: labelData.intent,
      should_escalate: labelData.should_escalate,
      escalate_reason: labelData.escalate_reason,
      ideal_reply_notes: labelData.ideal_reply_notes,
    };
  });

  // Calculate intent distribution stats
  const distribution: Record<string, number> = {};
  let escalationCount = 0;

  for (const item of goldenSet) {
    distribution[item.intent] = (distribution[item.intent] || 0) + 1;
    if (item.should_escalate) escalationCount++;
  }

  console.log("\n=== Golden Set Intent Distribution ===");
  for (const intent of VALID_INTENTS) {
    console.log(`- ${intent}: ${distribution[intent] || 0}`);
  }
  console.log(
    `\nTotal Escalated: ${escalationCount}/${goldenSet.length} (${(
      (escalationCount / goldenSet.length) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `Total Auto-handled: ${goldenSet.length - escalationCount}/${goldenSet.length} (${(
      ((goldenSet.length - escalationCount) / goldenSet.length) *
      100
    ).toFixed(1)}%)\n`
  );

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(goldenSet, null, 2), "utf-8");
  console.log(`✅ Saved official Golden Evaluation Set to:`);
  console.log(`   ${OUTPUT_PATH}`);
}

if (require.main === module) {
  generateGoldenSet();
}

