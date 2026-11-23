import fs from "fs";
import path from "path";
import readline from "readline";
import { parse } from "csv-parse/sync";
import { VALID_INTENTS, IntentLabel } from "./types";

const CSV_PATH = path.join(__dirname, "../data/labeling-sheet-blind.csv");

interface CsvRow {
  id: string;
  customer_text: string;
  my_intent: string;
  my_should_escalate: string;
  notes: string;
}

/**
 * Escapes a cell for CSV formatting.
 */
function escapeCsv(text: string): string {
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Saves all rows back to the blind sheet CSV.
 */
function saveCsv(rows: CsvRow[]): void {
  const lines = ["id,customer_text,my_intent,my_should_escalate,notes"];
  for (const r of rows) {
    const id = escapeCsv(r.id);
    const text = escapeCsv(r.customer_text);
    const intent = escapeCsv(r.my_intent || "");
    const esc = escapeCsv(r.my_should_escalate || "");
    const notes = escapeCsv(r.notes || "");
    lines.push(`${id},${text},${intent},${esc},${notes}`);
  }
  fs.writeFileSync(CSV_PATH, lines.join("\n"), "utf-8");
}

function askQuestion(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

export async function runLabelCli() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV file not found at ${CSV_PATH}. Run src/export-blind-sheet.ts first.`);
  }

  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows: CsvRow[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  });

  const total = rows.length;
  let currentIndex = rows.findIndex((r) => !r.my_intent || r.my_intent.trim() === "");

  if (currentIndex === -1) {
    console.log("\n🎉 All 200 tweets in data/labeling-sheet-blind.csv are ALREADY labeled!");
    console.log("You can now run: npx tsx src/compare-labels.ts\n");
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n================================================================================");
  console.log("⚡ RAPID HUMAN LABELING CLI FOR @SpotifyCares BENCHMARK");
  console.log("================================================================================");
  console.log("Commands: [1-8] select intent | [b] go back | [q] save & quit");
  console.log("Tip: Just press Enter on 'Escalate' to accept the recommended default!\n");

  while (currentIndex < total) {
    const row = rows[currentIndex]!;
    const num = currentIndex + 1;
    const remaining = total - currentIndex;

    console.log("================================================================================");
    console.log(`[Tweet ${num} / ${total}] (${remaining} left) | ID: ${row.id}`);
    console.log("--------------------------------------------------------------------------------");
    console.log(`"${row.customer_text}"`);
    console.log("--------------------------------------------------------------------------------");
    console.log("  [1] playback_audio_issue      [2] offline_downloads_issue");
    console.log("  [3] app_crash_performance     [4] content_catalog_request");
    console.log("  [5] billing_payment_dispute   [6] account_access_security");
    console.log("  [7] subscription_plan_family  [8] feedback_or_complaint");
    console.log("  [b] Go Back                   [q] Save & Quit");
    console.log("--------------------------------------------------------------------------------");

    // 1. Get Intent
    let selectedIntent: IntentLabel | null = null;
    while (!selectedIntent) {
      const input = (await askQuestion(rl, "> Select Intent [1-8]: ")).trim().toLowerCase();

      if (input === "q") {
        console.log("\nSaving progress and quitting...");
        saveCsv(rows);
        rl.close();
        console.log(`Progress saved! You labeled up to tweet ${currentIndex}. Resume anytime!\n`);
        return;
      }

      if (input === "b") {
        if (currentIndex > 0) {
          currentIndex--;
          break;
        } else {
          console.log("Already at the first tweet.");
          continue;
        }
      }

      const digit = parseInt(input, 10);
      if (digit >= 1 && digit <= 8) {
        selectedIntent = VALID_INTENTS[digit - 1]!;
      } else {
        console.log("Invalid choice. Please enter a number from 1 to 8, 'b' to go back, or 'q' to quit.");
      }
    }

    // If user hit 'b', loop continues at previous index
    if (!selectedIntent) continue;

    // 2. Determine Smart Default for Escalation
    const isSensitive =
      selectedIntent === "billing_payment_dispute" ||
      selectedIntent === "account_access_security" ||
      selectedIntent === "subscription_plan_family";

    const defaultEscalate = isSensitive ? "true" : "false";
    const promptHint = isSensitive ? "[Y/n] (Default: Yes)" : "[y/N] (Default: No)";

    // 3. Get Escalation Decision
    let shouldEscalate: boolean | null = null;
    while (shouldEscalate === null) {
      const escInput = (await askQuestion(rl, `> Should Escalate? ${promptHint}: `)).trim().toLowerCase();

      if (escInput === "") {
        shouldEscalate = defaultEscalate === "true";
      } else if (escInput === "y" || escInput === "yes" || escInput === "true" || escInput === "1") {
        shouldEscalate = true;
      } else if (escInput === "n" || escInput === "no" || escInput === "false" || escInput === "0") {
        shouldEscalate = false;
      } else {
        console.log("Invalid input. Press Enter for default, or type 'y' / 'n'.");
      }
    }

    // 4. Optional Notes
    const notesInput = (await askQuestion(rl, "> Notes (optional, press Enter to skip): ")).trim();

    // 5. Update Row and Auto-Save immediately to CSV
    row.my_intent = selectedIntent;
    row.my_should_escalate = shouldEscalate ? "true" : "false";
    row.notes = notesInput;

    saveCsv(rows);
    console.log(`✅ Saved row #${num}: [${selectedIntent}] | Escalate: ${shouldEscalate}\n`);

    currentIndex++;
  }

  rl.close();
  console.log("\n🎉 CONGRATULATIONS! You have labeled all 200 tweets!");
  console.log("Run the comparison script now to see your results against the script:");
  console.log("👉 npx tsx src/compare-labels.ts\n");
}

if (require.main === module) {
  runLabelCli().catch(console.error);
}
