import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { ConversationPair, GoldenExample } from "../types";

const PAIRS_PATH = path.join(__dirname, "../../data/spotifycares-pairs.json");
const GOLDEN_SET_PATH = path.join(__dirname, "../../data/golden-set.json");

/**
 * Creates a memory-efficient stream parser for CSV files.
 */
export function createCsvStream<T>(filePath: string): AsyncIterable<T> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found at ${filePath}`);
  }

  return fs.createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    })
  ) as AsyncIterable<T>;
}

/**
 * Loads the filtered Spotify conversation pairs from data/
 */
export function loadSpotifyPairs(): ConversationPair[] {
  if (!fs.existsSync(PAIRS_PATH)) {
    throw new Error(`Data file not found at ${PAIRS_PATH}. Run Phase 1 first.`);
  }
  const raw = fs.readFileSync(PAIRS_PATH, "utf-8");
  return JSON.parse(raw) as ConversationPair[];
}

/**
 * Loads the official Golden Evaluation Set (200 ground truth samples).
 */
export function loadGoldenSet(): GoldenExample[] {
  if (!fs.existsSync(GOLDEN_SET_PATH)) {
    throw new Error(`Golden set file not found at ${GOLDEN_SET_PATH}. Run Phase 3 first.`);
  }
  const raw = fs.readFileSync(GOLDEN_SET_PATH, "utf-8");
  return JSON.parse(raw) as GoldenExample[];
}

/**
 * Saves any data as formatted JSON.
 */
export function saveJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
