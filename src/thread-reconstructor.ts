import fs from "fs";
import path from "path";
import { RawTweetRow } from "./types";
import { createCsvStream, saveJsonFile } from "./utils/data-loader";

const CSV_PATH = path.join(__dirname, "../data/twcs.csv");
const OUTPUT_THREADS_PATH = path.join(__dirname, "../data/spotifycares-threads.json");
const BRAND = "SpotifyCares";

export interface ThreadTurn {
  tweet_id: string;
  author_id: string;
  is_brand: boolean;
  text: string;
  created_at: string;
}

export interface ConversationThread {
  thread_id: string;
  turn_count: number;
  root_customer_tweet_id: string;
  turns: ThreadTurn[];
}

interface StoredTweet {
  tweet_id: string;
  author_id: string;
  text: string;
  created_at: string;
  in_response_to_tweet_id?: string;
  inbound: boolean;
}

/**
 * Streams twcs.csv and reconstructs full multi-turn conversation threads for @SpotifyCares.
 */
export async function reconstructThreads(): Promise<ConversationThread[]> {
  console.log(`=== Reconstructing Multi-Turn Conversation DAGs for @${BRAND} ===\n`);

  // 1. Pass 1: Collect all brand replies and tweets that mention/involve SpotifyCares
  console.log("[Pass 1/2] Indexing all Spotify-related tweet nodes...");
  const tweetMap = new Map<string, StoredTweet>();
  const parentReferences = new Set<string>();

  for await (const row of createCsvStream<RawTweetRow>(CSV_PATH)) {
    const isBrand = row.author_id?.toLowerCase() === BRAND.toLowerCase();
    const mentionsBrand = row.text?.toLowerCase().includes("@spotifycares") || row.text?.toLowerCase().includes("@spotify");
    const parentId = row.in_response_to_tweet_id?.trim();

    if (isBrand || mentionsBrand) {
      const tweetId = row.tweet_id.trim();
      tweetMap.set(tweetId, {
        tweet_id: tweetId,
        author_id: row.author_id,
        text: row.text.trim(),
        created_at: row.created_at,
        in_response_to_tweet_id: parentId || undefined,
        inbound: row.inbound?.toUpperCase() === "TRUE",
      });

      if (parentId) {
        parentReferences.add(parentId);
      }
    }
  }

  console.log(`Indexed ${tweetMap.size} direct Spotify tweets. Missing parents to fetch: ${parentReferences.size}...`);

  // 2. Pass 2: Fill in any ancestor root tweets that didn't explicitly mention the brand name
  console.log("[Pass 2/2] Resolving missing parent tweets from CSV...");
  for await (const row of createCsvStream<RawTweetRow>(CSV_PATH)) {
    const tweetId = row.tweet_id.trim();
    if (parentReferences.has(tweetId) && !tweetMap.has(tweetId)) {
      tweetMap.set(tweetId, {
        tweet_id: tweetId,
        author_id: row.author_id,
        text: row.text.trim(),
        created_at: row.created_at,
        in_response_to_tweet_id: row.in_response_to_tweet_id?.trim() || undefined,
        inbound: row.inbound?.toUpperCase() === "TRUE",
      });
    }
  }

  console.log(`Total nodes in conversation graph: ${tweetMap.size}`);

  // 3. Trace threads from leaf nodes back to root nodes
  console.log("Tracing conversation chains...");
  const threads: ConversationThread[] = [];
  const processedLeaves = new Set<string>();

  // A leaf is a tweet that is NOT in any other tweet's in_response_to_tweet_id
  const nonLeafIds = new Set<string>();
  for (const tweet of tweetMap.values()) {
    if (tweet.in_response_to_tweet_id) {
      nonLeafIds.add(tweet.in_response_to_tweet_id);
    }
  }

  for (const [tweetId, tweet] of tweetMap.entries()) {
    if (!nonLeafIds.has(tweetId) && !processedLeaves.has(tweetId)) {
      // Trace backwards to root
      const chain: StoredTweet[] = [];
      let current: StoredTweet | undefined = tweet;
      const visited = new Set<string>();

      while (current && !visited.has(current.tweet_id)) {
        visited.add(current.tweet_id);
        chain.unshift(current); // prepend so chronological order (root first)
        if (current.in_response_to_tweet_id) {
          current = tweetMap.get(current.in_response_to_tweet_id);
        } else {
          current = undefined;
        }
      }

      // Filter for multi-turn threads (>= 3 turns) involving Spotify
      const hasBrand = chain.some((t) => t.author_id.toLowerCase() === BRAND.toLowerCase());
      if (chain.length >= 3 && hasBrand) {
        threads.push({
          thread_id: `thread-${chain[0]!.tweet_id}`,
          turn_count: chain.length,
          root_customer_tweet_id: chain[0]!.tweet_id,
          turns: chain.map((t) => ({
            tweet_id: t.tweet_id,
            author_id: t.author_id,
            is_brand: t.author_id.toLowerCase() === BRAND.toLowerCase(),
            text: t.text,
            created_at: t.created_at,
          })),
        });
        processedLeaves.add(tweetId);
      }
    }
  }

  // Sort by turn count descending
  threads.sort((a, b) => b.turn_count - a.turn_count);

  console.log(`\nReconstructed ${threads.length} multi-turn threads (length >= 3).`);
  console.log(`Longest thread: ${threads[0]?.turn_count || 0} turns.`);

  // Save to file
  saveJsonFile(OUTPUT_THREADS_PATH, threads);
  console.log(`Saved threads to ${OUTPUT_THREADS_PATH}`);

  return threads;
}

if (require.main === module) {
  reconstructThreads().catch(console.error);
}
