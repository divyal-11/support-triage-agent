import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { GoldenExample, IntentLabel, VALID_INTENTS } from "./types";

const CSV_PATH = path.join(__dirname, "../data/labeling-sheet-blind.csv");
const ORIGINAL_PATH = path.join(__dirname, "../data/golden-set.original-labels.json");
const V2_OUTPUT_PATH = path.join(__dirname, "../data/golden-set.v2.json");

interface UserCsvRow {
  id: string;
  customer_text: string;
  my_intent: string;
  my_should_escalate: string;
  notes?: string;
}

interface DisagreementItem {
  id: string;
  text: string;
  mine_intent: string;
  original_intent: string;
  mine_escalate: boolean;
  original_escalate: boolean;
}

/**
 * Validates and converts user escalation input to strict boolean.
 */
function parseUserEscalation(val: string, rowNum: number, id: string): boolean {
  const clean = val.trim().toLowerCase();
  if (clean === "true" || clean === "1" || clean === "yes" || clean === "y" || clean === "escalate") {
    return true;
  }
  if (clean === "false" || clean === "0" || clean === "no" || clean === "n" || clean === "auto" || clean === "auto-handle") {
    return false;
  }
  throw new Error(
    `[Validation Error] Row #${rowNum} (Tweet ID: ${id}) has invalid 'my_should_escalate': "${val}". Must be 'true' or 'false'.`
  );
}

/**
 * Calculates Generalized Multi-Class Cohen's Kappa.
 */
function calculateMulticlassKappa(labelsA: string[], labelsB: string[], categories: readonly string[]): number {
  if (labelsA.length !== labelsB.length || labelsA.length === 0) return 0;
  const N = labelsA.length;

  const categoryIndex = new Map<string, number>();
  categories.forEach((cat, idx) => categoryIndex.set(cat, idx));

  const K = categories.length;
  const matrix: number[][] = Array.from({ length: K }, () => Array(K).fill(0));

  for (let i = 0; i < N; i++) {
    const idxA = categoryIndex.get(labelsA[i]!);
    const idxB = categoryIndex.get(labelsB[i]!);
    if (idxA !== undefined && idxB !== undefined) {
      matrix[idxA]![idxB]!++;
    }
  }

  // Observed agreement Po: sum of diagonal elements / N
  let observedMatches = 0;
  for (let i = 0; i < K; i++) {
    observedMatches += matrix[i]![i]!;
  }
  const Po = observedMatches / N;

  // Expected agreement Pe: sum of (row_sum * col_sum) / (N * N)
  let expectedSum = 0;
  for (let i = 0; i < K; i++) {
    let rowSum = 0;
    let colSum = 0;
    for (let j = 0; j < K; j++) {
      rowSum += matrix[i]![j]!;
      colSum += matrix[j]![i]!;
    }
    expectedSum += (rowSum * colSum) / (N * N);
  }
  const Pe = expectedSum;

  if (Pe === 1) return 1.0;
  return (Po - Pe) / (1 - Pe);
}

export function compareLabels(): void {
  // 1. Check required input files exist
  if (!fs.existsSync(ORIGINAL_PATH)) {
    throw new Error(`Backup file missing at ${ORIGINAL_PATH}. Run src/export-blind-sheet.ts first.`);
  }
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Labeling CSV missing at ${CSV_PATH}. Export and label it first.`);
  }

  // 2. Load original labels
  const originalRaw = fs.readFileSync(ORIGINAL_PATH, "utf-8");
  const originalList: GoldenExample[] = JSON.parse(originalRaw);
  const originalMap = new Map<string, GoldenExample>();
  for (const item of originalList) {
    originalMap.set(item.customer_tweet_id.trim(), item);
  }

  // 3. Load user CSV
  const csvRaw = fs.readFileSync(CSV_PATH, "utf-8");
  const userRows: UserCsvRow[] = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (userRows.length === 0) {
    throw new Error(`The labeling CSV at ${CSV_PATH} is empty.`);
  }

  console.log(`=== Validating ${userRows.length} user labeled rows ===\n`);

  // 4. Validate all entries
  const validIntentsSet = new Set<string>(VALID_INTENTS);
  const userValidated: {
    id: string;
    text: string;
    my_intent: IntentLabel;
    my_should_escalate: boolean;
    notes: string;
    original: GoldenExample;
  }[] = [];

  for (let i = 0; i < userRows.length; i++) {
    const row = userRows[i]!;
    const rowNum = i + 2; // header is row 1
    const id = row.id?.trim();

    if (!id) {
      throw new Error(`[Validation Error] Row #${rowNum} has an empty 'id'.`);
    }

    const original = originalMap.get(id);
    if (!original) {
      throw new Error(`[Validation Error] Row #${rowNum} ID '${id}' was not found in original dataset.`);
    }

    const intentRaw = row.my_intent?.trim();
    if (!intentRaw) {
      throw new Error(
        `[Validation Error] Row #${rowNum} (Tweet ID: ${id}) has an EMPTY 'my_intent'. All 200 rows must be labeled before running comparison.`
      );
    }

    if (!validIntentsSet.has(intentRaw)) {
      throw new Error(
        `[Validation Error] Row #${rowNum} (Tweet ID: ${id}) has INVALID 'my_intent': "${intentRaw}".\nAllowed intents: ${VALID_INTENTS.join(
          ", "
        )}`
      );
    }

    const escalateRaw = row.my_should_escalate?.trim();
    if (!escalateRaw) {
      throw new Error(
        `[Validation Error] Row #${rowNum} (Tweet ID: ${id}) has an EMPTY 'my_should_escalate'. Must be 'true' or 'false'.`
      );
    }

    const shouldEscalate = parseUserEscalation(escalateRaw, rowNum, id);

    userValidated.push({
      id,
      text: row.customer_text?.trim() || original.customer_text,
      my_intent: intentRaw as IntentLabel,
      my_should_escalate: shouldEscalate,
      notes: row.notes?.trim() || "",
      original,
    });
  }

  // 5. Compute Agreement & Metrics
  const total = userValidated.length;
  let intentMatchCount = 0;
  let escalateMatchCount = 0;
  const disagreements: DisagreementItem[] = [];

  const myIntentsList: string[] = [];
  const originalIntentsList: string[] = [];
  const myEscalateList: string[] = [];
  const originalEscalateList: string[] = [];

  // Confusion matrix: [Mine][Original]
  const intentIndices = new Map<string, number>();
  VALID_INTENTS.forEach((intent, idx) => intentIndices.set(intent, idx));
  const confusionMatrix: number[][] = Array.from({ length: VALID_INTENTS.length }, () =>
    Array(VALID_INTENTS.length).fill(0)
  );

  for (const item of userValidated) {
    const orig = item.original;

    myIntentsList.push(item.my_intent);
    originalIntentsList.push(orig.intent);
    myEscalateList.push(String(item.my_should_escalate));
    originalEscalateList.push(String(orig.should_escalate));

    const iRow = intentIndices.get(item.my_intent)!;
    const iCol = intentIndices.get(orig.intent)!;
    confusionMatrix[iRow]![iCol]!++;

    const isIntentMatch = item.my_intent === orig.intent;
    const isEscalateMatch = item.my_should_escalate === orig.should_escalate;

    if (isIntentMatch) intentMatchCount++;
    if (isEscalateMatch) escalateMatchCount++;

    if (!isIntentMatch || !isEscalateMatch) {
      disagreements.push({
        id: item.id,
        text: item.text,
        mine_intent: item.my_intent,
        original_intent: orig.intent,
        mine_escalate: item.my_should_escalate,
        original_escalate: orig.should_escalate,
      });
    }
  }

  const intentAgreementPct = (intentMatchCount / total) * 100;
  const escalateAgreementPct = (escalateMatchCount / total) * 100;
  const intentKappa = calculateMulticlassKappa(myIntentsList, originalIntentsList, VALID_INTENTS);
  const escalateKappa = calculateMulticlassKappa(myEscalateList, originalEscalateList, ["true", "false"]);

  // 6. Print Report
  console.log("================================================================================");
  console.log("INTER-RATER AGREEMENT REPORT: YOUR HAND LABELS vs. ORIGINAL SCRIPT LABELS");
  console.log("================================================================================");
  console.log(`Total Samples Evaluated:         ${total}`);
  console.log(`Intent Agreement:                ${intentAgreementPct.toFixed(2)}% (${intentMatchCount}/${total})`);
  console.log(`Intent Cohen's Kappa:            ${intentKappa.toFixed(3)}`);
  console.log(`Escalation Agreement:            ${escalateAgreementPct.toFixed(2)}% (${escalateMatchCount}/${total})`);
  console.log(`Escalation Cohen's Kappa:        ${escalateKappa.toFixed(3)}`);
  console.log(`Total Disagreements:             ${disagreements.length}/${total}`);
  console.log("================================================================================\n");

  // 7. Print Confusion Matrix (Mine vs Original)
  console.log("CONFUSION MATRIX (Rows: Mine, Columns: Original)");
  console.log("--------------------------------------------------------------------------------");
  const shortNames = VALID_INTENTS.map((v) => v.slice(0, 7));
  console.log(`Mine \\ Orig     | ` + shortNames.map((s) => s.padEnd(7)).join(" | "));
  console.log("--------------------------------------------------------------------------------");
  for (let r = 0; r < VALID_INTENTS.length; r++) {
    const rowName = shortNames[r]!.padEnd(15);
    const cells = confusionMatrix[r]!.map((count) => String(count).padStart(7)).join(" | ");
    console.log(`${rowName} | ${cells}`);
  }
  console.log("--------------------------------------------------------------------------------\n");

  // 8. Print Disagreements
  if (disagreements.length > 0) {
    console.log(`=== Disagreements List (${disagreements.length} items) ===\n`);
    disagreements.forEach((d, idx) => {
      console.log(`[#${idx + 1}] Tweet ID: ${d.id}`);
      console.log(`    Text:      "${d.text}"`);
      console.log(`    Mine:      intent="${d.mine_intent}", escalate=${d.mine_escalate}`);
      console.log(`    Original:  intent="${d.original_intent}", escalate=${d.original_escalate}`);
      console.log("");
    });
  }

  // 9. Write user's labels to data/golden-set.v2.json (same schema as golden-set.json)
  const goldenV2: GoldenExample[] = userValidated.map((item) => ({
    customer_tweet_id: item.id,
    customer_text: item.text,
    brand_reply_text: item.original.brand_reply_text,
    intent: item.my_intent,
    should_escalate: item.my_should_escalate,
    escalate_reason: item.notes || (item.my_should_escalate ? "Escalated by human reviewer." : ""),
    ideal_reply_notes: item.original.ideal_reply_notes,
  }));

  fs.writeFileSync(V2_OUTPUT_PATH, JSON.stringify(goldenV2, null, 2), "utf-8");
  console.log(`✅ Saved your verified labels to: ${V2_OUTPUT_PATH}`);
  console.log(`(Original ${ORIGINAL_PATH} and golden-set.json were preserved untouched).\n`);
}

if (require.main === module) {
  compareLabels();
}
