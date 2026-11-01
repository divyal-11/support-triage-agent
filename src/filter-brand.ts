import path from "path";
import { RawTweetRow, ConversationPair } from "./types";
import { createCsvStream, saveJsonFile } from "./utils/data-loader";

const BRAND = "SpotifyCares";
const CSV_PATH = path.join(__dirname, "../data/twcs.csv");
const OUTPUT_PATH = path.join(__dirname, "../data/spotifycares-pairs.json");

async function filterBrandPairs() {
  console.log(`=== Phase 1: Brand Filtering for @${BRAND} ===\n`);

  // Map to store: customer_tweet_id -> { reply details }
  const pendingPairs = new Map<
    string,
    { brand_reply_id: string; brand_reply_text: string; created_at: string }
  >();

  // -------------------------------------------------------------
  // PASS 1: Collect all replies sent by SpotifyCares
  // -------------------------------------------------------------
  console.log(`[Pass 1/2] Streaming CSV to find all ${BRAND} replies...`);
  let totalBrandReplies = 0;

  for await (const row of createCsvStream<RawTweetRow>(CSV_PATH)) {
    const isBrand = row.author_id?.toLowerCase() === BRAND.toLowerCase();
    const isOutbound = row.inbound?.toUpperCase() === "FALSE";
    const parentId = row.in_response_to_tweet_id?.trim();

    if (isBrand && isOutbound && parentId) {
      totalBrandReplies++;
      pendingPairs.set(parentId, {
        brand_reply_id: row.tweet_id.trim(),
        brand_reply_text: row.text.trim(),
        created_at: row.created_at,
      });
    }
  }

  console.log(
    `[Pass 1/2] Done! Found ${totalBrandReplies} brand replies (${pendingPairs.size} unique customer tweets to match).\n`
  );

  // -------------------------------------------------------------
  // PASS 2: Match customer inbound tweets against the Map
  // -------------------------------------------------------------
  console.log(`[Pass 2/2] Streaming CSV again to match customer tweet text...`);
  const pairs: ConversationPair[] = [];

  for await (const row of createCsvStream<RawTweetRow>(CSV_PATH)) {
    const tweetId = row.tweet_id?.trim();
    const parentMatch = pendingPairs.get(tweetId);
    const isInbound = row.inbound?.toUpperCase() === "TRUE";

    if (parentMatch && isInbound) {
      pairs.push({
        customer_tweet_id: tweetId,
        customer_text: row.text.trim(),
        brand_reply_id: parentMatch.brand_reply_id,
        brand_reply_text: parentMatch.brand_reply_text,
        created_at: parentMatch.created_at,
      });

      // Remove from map to avoid duplicate matches
      pendingPairs.delete(tweetId);
    }
  }

  console.log(`[Pass 2/2] Done! Successfully paired ${pairs.length} conversations.\n`);

  // -------------------------------------------------------------
  // Save Output
  // -------------------------------------------------------------
  saveJsonFile(OUTPUT_PATH, pairs);
  console.log(`✅ Saved ${pairs.length} conversation pairs to:`);
  console.log(`   ${OUTPUT_PATH}`);
}

filterBrandPairs().catch((err) => {
  console.error("Error during brand filtering:", err);
  process.exit(1);
});
