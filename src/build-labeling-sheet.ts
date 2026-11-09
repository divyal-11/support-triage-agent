import fs from "fs";
import path from "path";
import { loadSpotifyPairs } from "./utils/data-loader";
import { ConversationPair } from "./types";

const OUTPUT_PATH = path.join(__dirname, "../data/golden-set-unlabeled.json");
const TARGET_SAMPLE_SIZE = 200;
const RANDOM_SEED = 42; // Fixed seed for reproducible pseudo-random sampling

/**
 * Simple pseudo-random number generator (Mulberry32) using a fixed seed.
 * Guarantees that sampling produces the exact same dataset across machines.
 */
function seededRandom(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Filter out low-signal noise (e.g. empty, single emoji, or only URLs).
 */
function isHighSignalTweet(text: string): boolean {
  // Strip URLs and twitter handles
  const stripped = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .trim();

  // Keep tweets that have at least 3 meaningful words
  const words = stripped.split(/\s+/).filter((w) => w.length > 1);
  return words.length >= 3;
}

export function buildLabelingSheet(): ConversationPair[] {
  console.log("Loading Spotify conversation pairs...");
  const pairs = loadSpotifyPairs();
  console.log(`Loaded ${pairs.length} total conversation pairs.`);

  // Filter for clean, high-signal tweets
  const filtered = pairs.filter((p) => isHighSignalTweet(p.customer_text));
  console.log(`Retained ${filtered.length} high-signal pairs after quality filtering.`);

  // Deterministically shuffle with fixed seed
  const rng = seededRandom(RANDOM_SEED);
  const shuffled = [...filtered];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }

  const selected = shuffled.slice(0, TARGET_SAMPLE_SIZE);

  // Write out unlabeled dataset
  const outputData = selected.map((pair, idx) => ({
    sample_index: idx + 1,
    customer_tweet_id: pair.customer_tweet_id,
    customer_text: pair.customer_text,
    brand_reply_text: pair.brand_reply_text,
    intent: "",
    should_escalate: null,
    escalate_reason: "",
    ideal_reply_notes: "",
  }));

  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputData, null, 2), "utf-8");
  console.log(`✅ Successfully generated ${selected.length} unlabeled samples in:`);
  console.log(`   ${OUTPUT_PATH}`);

  return selected;
}

if (require.main === module) {
  buildLabelingSheet();
}

