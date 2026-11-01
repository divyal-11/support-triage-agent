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

export interface IntentDefinition {
  label: string;
  description: string;
  examples: string[];
}
