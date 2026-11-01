import fs from "fs";
import path from "path";
import { loadSpotifyPairs } from "./utils/data-loader";

const OUTPUT_PATH = path.join(__dirname, "../docs/sample-tweets.txt");
const SAMPLE_SIZE = 50;

function sampleTweets() {
  const pairs = loadSpotifyPairs();
  console.log(`Loaded ${pairs.length} conversation pairs.`);

  // Shuffle array using Fisher-Yates algorithm
  const shuffled = [...pairs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const sample = shuffled.slice(0, SAMPLE_SIZE);

  // Format into a clean, easy-to-read text file
  const lines: string[] = [
    `=== SPOTIFY CUSTOMER SUPPORT: RANDOM SAMPLE OF ${SAMPLE_SIZE} TWEETS ===\n`,
    `Use this file to identify recurring problem types and define the intent taxonomy in docs/taxonomy.md.\n`,
    "--------------------------------------------------------------------------------",
  ];

  sample.forEach((pair, index) => {
    lines.push(
      `[#${index + 1}] ID: ${pair.customer_tweet_id}`,
      `CUSTOMER: ${pair.customer_text}`,
      `REPLY:    ${pair.brand_reply_text}`,
      "--------------------------------------------------------------------------------"
    );
  });

  fs.writeFileSync(OUTPUT_PATH, lines.join("\n"), "utf-8");
  console.log(`✅ Wrote ${SAMPLE_SIZE} sampled tweets to: ${OUTPUT_PATH}`);
}

sampleTweets();