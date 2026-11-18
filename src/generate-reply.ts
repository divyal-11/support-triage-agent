import fs from "fs";
import path from "path";
import { IntentLabel } from "./types";
import { RetrievedCase } from "./retrieval";
import { callLlmWithCache } from "./utils/llm-client";

const PROMPT_TEMPLATE_PATH = path.join(__dirname, "../prompts/reply-draft.txt");

/**
 * Clean up raw historical tweets for the prompt:
 * Removes numeric user IDs (@115887), dead t.co links, and agent initials.
 */
function sanitizeHistoricalReply(text: string): string {
  return text
    .replace(/@\d+/g, "") // remove numeric handles
    .replace(/https?:\/\/t\.co\/\S+/g, "") // remove dead twitter links
    .replace(/\/[A-Z]{2}$/g, "") // remove agent initials like /CB, /NY
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Creates a smart grounded fallback reply if no API key is set.
 */
function createGroundedFallback(intent: IntentLabel, topCase?: RetrievedCase): string {
  // Sensitive cases require DM
  if (
    intent === "billing_payment_dispute" ||
    intent === "account_access_security" ||
    intent === "subscription_plan_family"
  ) {
    return "Hey there! For your security, could you send us a DM with your account's email address? We'll take a look backstage /Spotify";
  }

  // Technical issues: synthesize from top historical resolution
  if (topCase) {
    const cleanPast = sanitizeHistoricalReply(topCase.brand_reply_text);
    if (cleanPast.length > 20 && cleanPast.length < 240) {
      const body = cleanPast.replace(/^(hi|hey|hello)[^.!?]*[.!?]\s*/i, "");
      return `Hey there! ${body} Let us know if that helps /Spotify`;
    }
  }

  return "Hi! Try restarting your device and ensuring your Spotify app is updated to the latest version. Keep us posted /Spotify";
}

/**
 * Drafts a reply grounded in historical brand resolutions.
 */
export async function draftGroundedReply(
  customerText: string,
  intent: IntentLabel,
  retrievedCases: RetrievedCase[],
  cacheKey?: string
): Promise<{ reply: string; source: "cache" | "gemini" | "groq" | "fallback" }> {
  // 1. Read prompt template
  const template = fs.readFileSync(PROMPT_TEMPLATE_PATH, "utf-8");

  // 2. Format historical examples
  const formattedExamples = retrievedCases
    .slice(0, 3)
    .map((c, i) => {
      const cleanCustomer = c.customer_text.replace(/@\w+/g, "").trim();
      const cleanReply = sanitizeHistoricalReply(c.brand_reply_text);
      return `[Case #${i + 1}]\nCustomer: "${cleanCustomer}"\nSpotify Resolved: "${cleanReply}"`;
    })
    .join("\n\n");

  // 3. Fill prompt placeholders
  const prompt = template
    .replace("{CUSTOMER_TWEET}", customerText)
    .replace("{PREDICTED_INTENT}", intent)
    .replace(
      "{HISTORICAL_EXAMPLES}",
      formattedExamples || "No previous exact cases found. Use standard Spotify support guidance."
    );

  // 4. Generate fallback for offline resilience
  const fallback = createGroundedFallback(intent, retrievedCases[0]);

  // 5. Invoke LLM with local caching
  const result = await callLlmWithCache(prompt, cacheKey, fallback);

  // 6. Post-process response (enforce 280-char limit & clean quotes)
  let cleanReply = result.text.replace(/^["']|["']$/g, "").trim();

  // Ensure /Spotify sign-off exists
  if (!cleanReply.includes("/Spotify")) {
    cleanReply = `${cleanReply} /Spotify`;
  }

  // Enforce 280 character limit
  if (cleanReply.length > 280) {
    cleanReply = cleanReply.slice(0, 270).trim() + "... /Spotify";
  }

  return {
    reply: cleanReply,
    source: result.source,
  };
}

/**
 * Standalone tester for reply drafting.
 */
async function testReplyGeneration() {
  console.log("=== Testing Grounded Reply Generation ===\n");

  const sampleCases = [
    {
      query: "Why does my music stop playing whenever my screen goes black?",
      intent: "playback_audio_issue" as IntentLabel,
      retrieved: [
        {
          customer_tweet_id: "1",
          customer_text: "Music stops when screen locks on iOS",
          brand_reply_text: "Hi! Check your iOS Settings > Battery > Low Power Mode and reinstall the app /CB",
          similarity_score: 0.45,
        },
      ],
    },
    {
      query: "I have been charged twice for Spotify Premium this month. Fix this now!",
      intent: "billing_payment_dispute" as IntentLabel,
      retrieved: [
        {
          customer_tweet_id: "2",
          customer_text: "Charged twice for subscription",
          brand_reply_text: "Can you DM us your account's email address? We'll take a look under the hood /XF",
          similarity_score: 0.52,
        },
      ],
    },
  ];

  for (const s of sampleCases) {
    console.log(`QUERY:  "${s.query}"`);
    console.log(`INTENT: ${s.intent}`);
    const draft = await draftGroundedReply(s.query, s.intent, s.retrieved, `test-${s.intent}`);
    console.log(`SOURCE: [${draft.source}]`);
    console.log(`DRAFT:  "${draft.reply}"`);
    console.log(`LENGTH: ${draft.reply.length} chars (within 280 X limit)`);
    console.log("--------------------------------------------------------------------\n");
  }
}

if (require.main === module) {
  testReplyGeneration().catch(console.error);
}
