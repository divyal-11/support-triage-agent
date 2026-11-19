import { IntentLabel } from "./types";

export type EscalationTrigger =
  | "HIGH_RISK_INTENT"
  | "CRITICAL_KEYWORDS"
  | "LOW_CONFIDENCE"
  | "EXPLICIT_HUMAN_REQUEST"
  | "NONE";

export interface EscalationDecision {
  should_escalate: boolean;
  escalate_reason: string;
  trigger_layer: EscalationTrigger;
}

const CONFIDENCE_THRESHOLD = 0.40;

/**
 * Deterministic Safety Escalation Policy (4-Layer Guardrail).
 * Enforces company security and financial compliance rules before any auto-reply.
 */
export function evaluateEscalationPolicy(
  customerText: string,
  predictedIntent: IntentLabel,
  confidence: number
): EscalationDecision {
  const text = customerText.toLowerCase();

  // ------------------------------------------------------------------
  // LAYER 1: Explicit Human / Legal Escalation Request
  // ------------------------------------------------------------------
  if (
    /\b(human|real person|speak to an agent|talk to someone|representative|call me|phone number|lawyer|attorney|sue|legal|police)\b/i.test(
      text
    )
  ) {
    return {
      should_escalate: true,
      escalate_reason: "Customer explicitly requested human intervention, phone support, or referenced legal/dispute escalation.",
      trigger_layer: "EXPLICIT_HUMAN_REQUEST",
    };
  }

  // ------------------------------------------------------------------
  // LAYER 2: High-Risk Business Intents (Financial & Security)
  // ------------------------------------------------------------------
  if (
    predictedIntent === "billing_payment_dispute" ||
    predictedIntent === "account_access_security" ||
    predictedIntent === "subscription_plan_family"
  ) {
    const intentReasonMap: Record<string, string> = {
      billing_payment_dispute: "Financial transaction dispute requiring private account lookup and payment reconciliation.",
      account_access_security: "Account security, login credentials, or potential compromise requiring private identity verification.",
      subscription_plan_family: "Multi-user subscription linkage and physical address verification requires backend administrative lookup.",
    };

    return {
      should_escalate: true,
      escalate_reason: intentReasonMap[predictedIntent] || "High-risk category requires human handling.",
      trigger_layer: "HIGH_RISK_INTENT",
    };
  }

  // ------------------------------------------------------------------
  // LAYER 3: Critical Financial & Credential Keywords Guardrail
  // (Catches edge cases where classifier predicted technical or feedback)
  // ------------------------------------------------------------------
  if (
    /\b(charged|charging|charge|refund|refunds|paypal|receipt|invoice|unauthorized|card|deducted|double charge|subscript|password|reset|login|csrf|hacked|stolen|bank)\b/i.test(
      text
    )
  ) {
    return {
      should_escalate: true,
      escalate_reason: "Sensitive payment, banking, or credential keywords detected in query.",
      trigger_layer: "CRITICAL_KEYWORDS",
    };
  }

  // ------------------------------------------------------------------
  // LAYER 4: Classifier Uncertainty (Confidence Floor)
  // ------------------------------------------------------------------
  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      should_escalate: true,
      escalate_reason: `AI classification confidence (${(confidence * 100).toFixed(1)}%) is below safety threshold (${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%).`,
      trigger_layer: "LOW_CONFIDENCE",
    };
  }

  // ------------------------------------------------------------------
  // DEFAULT: Safe for Automated Handling
  // ------------------------------------------------------------------
  return {
    should_escalate: false,
    escalate_reason: "Standard self-serve query safely eligible for automated guidance.",
    trigger_layer: "NONE",
  };
}

/**
 * Standalone test suite for verifying the 4-layer escalation policy.
 */
function testEscalationPolicy() {
  console.log("=== Testing Deterministic Escalation Policy (4 Layers) ===\n");

  const testCases = [
    {
      name: "Standard technical bug (High confidence)",
      text: "My music stops playing every 10 seconds whenever I lock my screen on iOS",
      intent: "playback_audio_issue" as IntentLabel,
      confidence: 0.92,
    },
    {
      name: "High-risk intent (Billing dispute)",
      text: "I cancelled my subscription last month why was I billed today?",
      intent: "billing_payment_dispute" as IntentLabel,
      confidence: 0.88,
    },
    {
      name: "Safety keyword trap (Misclassified as feedback, but mentions charge)",
      text: "Your service is completely terrible and you charged my card without permission!",
      intent: "feedback_or_complaint" as IntentLabel,
      confidence: 0.75,
    },
    {
      name: "Low confidence uncertainty",
      text: "Hmm something weird happened with the interface yesterday",
      intent: "app_crash_performance" as IntentLabel,
      confidence: 0.28,
    },
    {
      name: "Explicit human escalation request",
      text: "Stop giving me robotic advice, I want to talk to a real person right now",
      intent: "feedback_or_complaint" as IntentLabel,
      confidence: 0.85,
    },
  ];

  for (const c of testCases) {
    const res = evaluateEscalationPolicy(c.text, c.intent, c.confidence);
    console.log(`CASE:        ${c.name}`);
    console.log(`QUERY:       "${c.text}"`);
    console.log(`ESCALATE:    ${res.should_escalate ? "🚨 YES (ESCALATE)" : "✅ NO (AUTO-HANDLE)"}`);
    console.log(`TRIGGER:     [${res.trigger_layer}]`);
    console.log(`REASON:      ${res.escalate_reason}`);
    console.log("--------------------------------------------------------------------------------\n");
  }
}

if (require.main === module) {
  testEscalationPolicy();
}
