import { IntentLabel } from "./types";
import { ThreadTurn } from "./thread-reconstructor";

export type ConversationState =
  | "INITIAL_TRIAGE"
  | "IN_PROGRESS_TROUBLESHOOT"
  | "REPEAT_FAILURE_ESCALATION"
  | "SENSITIVE_ESCALATION"
  | "RESOLVED";

export interface StateMachineDecision {
  current_state: ConversationState;
  should_escalate: boolean;
  escalate_reason: string;
  context_summary: string;
  repeat_failure_detected: boolean;
  previous_troubleshooting_attempted?: string;
}

const FAILURE_SIGNALS = [
  /\bstill\b/i,
  /\bdidn't work\b/i,
  /\bdoes not work\b/i,
  /\bdoesn't work\b/i,
  /\bnot working\b/i,
  /\bno luck\b/i,
  /\bdone it\b/i,
  /\btried that\b/i,
  /\bsame (issue|problem|error)\b/i,
  /\bnot helping\b/i,
  /\balready (did|tried)\b/i,
  /\bwhat now\b/i,
];

const RESOLUTION_SIGNALS = [
  /\bworked\b/i,
  /\bworks now\b/i,
  /\bfixed\b/i,
  /\ball good\b/i,
  /\bsorted\b/i,
  /\bthank(s| you).*(worked|fixed|sorted)/i,
];

/**
 * Multi-Turn Conversation State Machine.
 * Tracks conversation progress across turns to:
 * 1. Resolve context truncation (Failure Mode 2).
 * 2. Prevent repeating identical failed troubleshooting steps.
 * 3. Enforce immediate human escalation when customer reports repeat failure.
 */
export function evaluateConversationState(
  turns: ThreadTurn[],
  baseIntent: IntentLabel,
  baseEscalate: boolean,
  baseReason: string
): StateMachineDecision {
  const turnCount = turns.length;
  const currentTurn = turns[turnCount - 1]!;
  const currentText = currentTurn.text;

  // 1. Single-turn conversation (Turn 1: Initial customer message)
  if (turnCount <= 1) {
    if (baseEscalate) {
      return {
        current_state: "SENSITIVE_ESCALATION",
        should_escalate: true,
        escalate_reason: baseReason,
        context_summary: "Initial contact: Sensitive domain requiring private verification.",
        repeat_failure_detected: false,
      };
    }
    return {
      current_state: "INITIAL_TRIAGE",
      should_escalate: false,
      escalate_reason: "",
      context_summary: "Initial contact: Standard self-serve technical triage.",
      repeat_failure_detected: false,
    };
  }

  // 2. Multi-turn conversation (Turn >= 2)
  // Find the previous brand reply to know what was advised
  let lastBrandReply: string | undefined;
  for (let i = turnCount - 2; i >= 0; i--) {
    if (turns[i]!.is_brand) {
      lastBrandReply = turns[i]!.text;
      break;
    }
  }

  // Find the root customer query (first turn)
  const rootCustomerTurn = turns[0]!;

  // Check for customer confirming resolution
  const isResolved = RESOLUTION_SIGNALS.some((pattern) => pattern.test(currentText));
  if (isResolved) {
    return {
      current_state: "RESOLVED",
      should_escalate: false,
      escalate_reason: "",
      context_summary: "Customer confirmed resolution. Ticket closed successfully.",
      repeat_failure_detected: false,
    };
  }

  // Check for repeat failure signal ("still didn't work", "done it", "no luck")
  const isRepeatFailure = FAILURE_SIGNALS.some((pattern) => pattern.test(currentText));

  if (isRepeatFailure || (turnCount >= 3 && !baseEscalate)) {
    return {
      current_state: "REPEAT_FAILURE_ESCALATION",
      should_escalate: true,
      escalate_reason: `Customer attempted automated troubleshooting step ('${lastBrandReply?.slice(0, 60) || "troubleshooting"}...') but reported persistent issue. Escalated to prevent redundant troubleshooting loop.`,
      context_summary: `Multi-turn thread (Turn ${turnCount}): Root problem was "${rootCustomerTurn.text.slice(0, 70)}...". Prior advice failed.`,
      repeat_failure_detected: true,
      previous_troubleshooting_attempted: lastBrandReply,
    };
  }

  // Fallback to base escalation if high-risk intent
  if (baseEscalate) {
    return {
      current_state: "SENSITIVE_ESCALATION",
      should_escalate: true,
      escalate_reason: baseReason,
      context_summary: `Multi-turn context (Turn ${turnCount}): Requires backend account/billing verification.`,
      repeat_failure_detected: false,
    };
  }

  return {
    current_state: "IN_PROGRESS_TROUBLESHOOT",
    should_escalate: false,
    escalate_reason: "",
    context_summary: `Multi-turn follow-up (Turn ${turnCount}): Continuing technical investigation with root context.`,
    repeat_failure_detected: false,
    previous_troubleshooting_attempted: lastBrandReply,
  };
}
