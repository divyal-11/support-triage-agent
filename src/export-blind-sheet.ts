import fs from "fs";
import path from "path";
import { GoldenExample } from "./types";

const SOURCE_PATH = path.join(__dirname, "../data/golden-set.json");
const BACKUP_PATH = path.join(__dirname, "../data/golden-set.original-labels.json");
const OUTPUT_CSV_PATH = path.join(__dirname, "../data/labeling-sheet-blind.csv");

const RANDOM_SEED = 7;

/**
 * Deterministic pseudo-random number generator (Mulberry32) using seed = 7.
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
 * Escapes a string to conform with standard RFC 4180 CSV specifications.
 */
function escapeCsvCell(text: string): string {
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function exportBlindSheet(): void {
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Source golden set file not found at ${SOURCE_PATH}`);
  }

  // 1. Backup original golden set if backup does not already exist
  if (!fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(SOURCE_PATH, BACKUP_PATH);
  }

  // 2. Read golden set
  const rawData = fs.readFileSync(SOURCE_PATH, "utf-8");
  const items: GoldenExample[] = JSON.parse(rawData);

  // 3. Extract only blind fields (id and customer_text) - strictly NO labels or derived fields
  const blindRows = items.map((item) => ({
    id: item.customer_tweet_id,
    customer_text: item.customer_text,
  }));

  // 4. Deterministic shuffle using seed = 7
  const rng = seededRandom(RANDOM_SEED);
  for (let i = blindRows.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = blindRows[i]!;
    blindRows[i] = blindRows[j]!;
    blindRows[j] = temp;
  }

  // 5. Build CSV
  const csvLines: string[] = ["id,customer_text,my_intent,my_should_escalate,notes"];

  for (const row of blindRows) {
    const escapedId = escapeCsvCell(row.id);
    const escapedText = escapeCsvCell(row.customer_text);
    csvLines.push(`${escapedId},${escapedText},,,`);
  }

  fs.writeFileSync(OUTPUT_CSV_PATH, csvLines.join("\n"), "utf-8");

  // Print ONLY the row count. Absolutely no labels printed.
  console.log(`Exported ${blindRows.length} rows to blind labeling sheet.`);
}

if (require.main === module) {
  exportBlindSheet();
}
