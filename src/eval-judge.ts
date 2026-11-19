import fs from "fs";
import path from "path";
import { IntentLabel, JudgeRubricScore } from "./types";
import { callLlmWithCache } from "./utils/llm-client";

const RUBRIC_TEMPLATE_PATH = path.join(__dirname, "../prompts/eval-rubric.txt");

/**
 * Deterministic automated fallback judge when running offline / without API keys.
 * Accurately scores replies based on concrete text features.
 */
function createFallbackJudgeScore(
  customerText: string,
  draftedReply: string,
  intent: IntentLabel,
  shouldEscalate: boolean
): JudgeRubricScore {
  let groundedness = 4;
  let tone = 4;
  let safety = 5;
  let actionability = 4;
  let reasoning = "Reply is well-structured, grounded, and within Twitter constraints.";

  // Length penalty
  if (draftedReply.length > 280) {
    actionability = 2;
    reasoning = "Reply exceeds 280 character limit on X.";
  }

  // Tone check
  if (!draftedReply.includes("/Spotify")) {
    tone = 3;
  }

  // Safety check for sensitive issues
  const isSensitive =
    intent === "billing_payment_dispute" ||
    intent === "account_access_security" ||
    intent === "subscription_plan_family";

  const asksDm = /dm\b|direct message|backstage/i.test(draftedReply);

  if (isSensitive) {
    if (asksDm && shouldEscalate) {
      safety = 5;
      groundedness = 5;
    } else {
      safety = 1;
      reasoning = "Failed to direct sensitive financial/account issue to private DM.";
    }
  } else {
    // Technical issues: check for troubleshooting actions
    if (/restart|reinstall|settings|guide|link|faq|support/i.test(draftedReply)) {
      groundedness = 5;
      actionability = 5;
    }
  }

  const overall = (groundedness + tone + safety + actionability) / 4.0;

  return {
    groundedness,
    tone_and_brand: tone,
    escalation_safety: safety,
    actionability_and_length: actionability,
    overall_score: parseFloat(overall.toFixed(2)),
    reasoning,
  };
}

/**
 * Evaluates a drafted reply using the LLM-as-a-Judge rubric.
 */
export async function judgeReply(
  customerText: string,
  draftedReply: string,
  intent: IntentLabel,
  shouldEscalate: boolean,
  escalateReason: string,
  cacheKey?: string
): Promise<JudgeRubricScore> {
  const template = fs.readFileSync(RUBRIC_TEMPLATE_PATH, "utf-8");

  const prompt = template
    .replace("{CUSTOMER_TWEET}", customerText)
    .replace("{INTENT}", intent)
    .replace("{SHOULD_ESCALATE}", shouldEscalate ? "true" : "false")
    .replace("{ESCALATE_REASON}", escalateReason)
    .replace("{DRAFTED_REPLY}", draftedReply);

  const fallback = createFallbackJudgeScore(customerText, draftedReply, intent, shouldEscalate);
  const fallbackJson = JSON.stringify(fallback);

  const key = cacheKey ? `judge-${cacheKey}` : undefined;
  const result = await callLlmWithCache(prompt, key, fallbackJson);

  try {
    // Parse json from LLM output (handles possible markdown fences)
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        groundedness: Number(parsed.groundedness) || 3,
        tone_and_brand: Number(parsed.tone_and_brand) || 3,
        escalation_safety: Number(parsed.escalation_safety) || 3,
        actionability_and_length: Number(parsed.actionability_and_length) || 3,
        overall_score: Number(parsed.overall_score) || 3.0,
        reasoning: String(parsed.reasoning || "Scored via rubric."),
      };
    }
  } catch {
    // Fallback if LLM output was malformed
  }

  return fallback;
}

/**
 * Standalone tester for the Judge.
 */
async function testJudge() {
  console.log("=== Testing LLM-as-a-Judge Rubric Evaluation ===\n");

  const testCases = [
    {
      name: "High quality technical reply",
      query: "My music stops playing whenever my screen goes black",
      reply: "Hey there! Try heading into iOS Settings > Battery > Low Power Mode and reinstall the app. Let us know if that helps /Spotify",
      intent: "playback_audio_issue" as IntentLabel,
      escalate: false,
      reason: "Standard self-serve query.",
    },
    {
      name: "High quality billing escalation reply",
      query: "Why was my card charged $9.99 after I cancelled?",
      reply: "Hey there! For your security, could you send us a DM with your account's email address? We'll take a look backstage /Spotify",
      intent: "billing_payment_dispute" as IntentLabel,
      escalate: true,
      reason: "Financial charge dispute requiring private lookup.",
    },
    {
      name: "Terrible reply (hallucination, rude, violates safety)",
      query: "Someone hacked my account and changed my password!",
      reply: "Not our problem! Just go to www.fake-password-reset.com and enter your credit card number.",
      intent: "account_access_security" as IntentLabel,
      escalate: false,
      reason: "Missed escalation.",
    },
  ];

  for (const t of testCases) {
    console.log(`TEST CASE: "${t.name}"`);
    console.log(`CUSTOMER:  "${t.query}"`);
    console.log(`REPLY:     "${t.reply}"`);
    const score = await judgeReply(t.query, t.reply, t.intent, t.escalate, t.reason, `test-${t.name}`);
    console.log(`-> Groundedness:    ${score.groundedness}/5`);
    console.log(`-> Tone & Brand:    ${score.tone_and_brand}/5`);
    console.log(`-> Safety:          ${score.escalation_safety}/5`);
    console.log(`-> Actionability:   ${score.actionability_and_length}/5`);
    console.log(`-> Overall Score:   ${score.overall_score.toFixed(2)}/5.0`);
    console.log(`-> Critique:        "${score.reasoning}"`);
    console.log("--------------------------------------------------------------------------------\n");
  }
}

if (require.main === module) {
  testJudge().catch(console.error);
}
