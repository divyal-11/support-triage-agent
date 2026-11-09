export interface RawTweetRow {
  tweet_id: string;
  author_id: string;
  inbound: string;
  created_at: string;
  text: string;
  response_tweet_id?: string;
  in_response_to_tweet_id?: string;
}

export interface ConversationPair {
  customer_tweet_id: string;
  customer_text: string;
  brand_reply_id: string;
  brand_reply_text: string;
  created_at: string;
}

export type IntentLabel =
  | "playback_audio_issue"
  | "offline_downloads_issue"
  | "app_crash_performance"
  | "content_catalog_request"
  | "billing_payment_dispute"
  | "account_access_security"
  | "subscription_plan_family"
  | "feedback_or_complaint";

export const VALID_INTENTS: readonly IntentLabel[] = [
  "playback_audio_issue",
  "offline_downloads_issue",
  "app_crash_performance",
  "content_catalog_request",
  "billing_payment_dispute",
  "account_access_security",
  "subscription_plan_family",
  "feedback_or_complaint",
] as const;

export interface GoldenExample {
  customer_tweet_id: string;
  customer_text: string;
  brand_reply_text: string;
  intent: IntentLabel;
  should_escalate: boolean;
  escalate_reason: string;
  ideal_reply_notes?: string;
}

export interface AgentResult {
  customer_tweet_id: string;
  customer_text: string;
  predicted_intent: IntentLabel;
  confidence: number;
  retrieved_examples: { customer_text: string; brand_reply_text: string }[];
  drafted_reply: string;
  should_escalate: boolean;
  escalate_reason: string;
}

export interface EvaluationSummary {
  model_name: string;
  total_evaluated: number;
  intent_accuracy: number; // 0.0 - 1.0
  intent_correct: number;
  escalation_precision: number;
  escalation_recall: number;
  escalation_f1: number;
  escalation_true_positives: number;
  escalation_false_positives: number;
  escalation_false_negatives: number;
  escalation_true_negatives: number;
}
