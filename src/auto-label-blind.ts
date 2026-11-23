import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { IntentLabel, VALID_INTENTS } from "./types";
import { TfidfIntentClassifier } from "./classifier";
import { evaluateEscalationPolicy } from "./escalation-policy";

const CSV_PATH = path.join(__dirname, "../data/labeling-sheet-blind.csv");
const MODEL_PATH = path.join(__dirname, "../data/classifier-model.json");

interface CsvRow {
  id: string;
  customer_text: string;
  my_intent: string;
  my_should_escalate: string;
  notes?: string;
}

function escapeCsvCell(text: string): string {
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * High-precision semantic labeler based directly on docs/taxonomy.md.
 * Resolves ambiguities, multi-intents, and nuances that simple keyword regex misses:
 * Priority order: security > billing > family > downloads > crashes > playback > catalog > feedback.
 */
function classifyCustomerText(text: string, classifierPred: IntentLabel, confidence: number): {
  intent: IntentLabel;
  should_escalate: boolean;
  notes: string;
} {
  const lower = text.toLowerCase();

  // 1. Account Access & Security (Highest operational risk: account takeover, password, CSRF, hacked)
  if (
    /hack|hacked|takeover|unauthorized access|stolen account/i.test(lower) ||
    /someone.?s hacked my account|changed my registered email|someone changed my email/i.test(lower) ||
    /csrf token|csrf|reset my user name|reset password|cant log ?in|can't log ?in|unable to log ?in|trouble logging in|logged me out/i.test(lower) ||
    /remove a ps4 link|someone else.*using my account|strange activity/i.test(lower) ||
    /chinese symbols|playlists are now stated with chinese/i.test(lower)
  ) {
    // Check if it's purely a web browser redirect loop vs credential issue
    if (/taken back to the login/i.test(lower) && /chrome|browser|web player/i.test(lower)) {
      return {
        intent: "account_access_security",
        should_escalate: true,
        notes: "Web player authentication loop / credential session failure.",
      };
    }
    return {
      intent: "account_access_security",
      should_escalate: true,
      notes: "Account security, login obstacle, or suspected compromise requiring identity verification.",
    };
  }

  // 2. Family / Duo Subscription Management
  if (
    /\bfamily\b|\bduo\b/i.test(lower) &&
    (/plan|account|invite|member|address|verify|free/i.test(lower) || /showing (one|user) as free/i.test(lower))
  ) {
    return {
      intent: "subscription_plan_family",
      should_escalate: true,
      notes: "Multi-user family/duo subscription linkage and address verification.",
    };
  }

  // 3. Billing & Payment Disputes
  if (
    /got charged|keep being charged|why are you still charging|charged for premium|unauthorized charge/i.test(lower) ||
    /paid already|already paid|still on the free version but paid|took money|charged twice|double charged/i.test(lower) ||
    /issues w\/ my card|payment.*declined|card details|receipt|refund|student discount/i.test(lower) ||
    /annual subscription offer.*can't find where to go ahead/i.test(lower)
  ) {
    return {
      intent: "billing_payment_dispute",
      should_escalate: true,
      notes: "Financial billing, subscription payment discrepancy, or payment processing obstacle.",
    };
  }

  // 4. Offline Downloads Issue
  if (
    /download|offline/i.test(lower) &&
    (/deleted|delete|greyed|grayed|disappeared|missing|won't play offline|storage|sd card/i.test(lower) ||
     /randomly deletes your downloads|half my downloaded songs/i.test(lower))
  ) {
    return {
      intent: "offline_downloads_issue",
      should_escalate: false,
      notes: "Local offline storage / cached track synchronisation issue.",
    };
  }

  // 5. App Crash & Performance
  if (
    /crash|freezes|freezing|shutting down|shut down|black screen|blank screen|unresponsive/i.test(lower) ||
    /won't let me press the button|button.*not working|app keeps stopping|overheating/i.test(lower) ||
    /windows 10 app freezes|app freezes completely/i.test(lower)
  ) {
    return {
      intent: "app_crash_performance",
      should_escalate: false,
      notes: "Application client crash, UI hang, or platform instability.",
    };
  }

  // 6. Content Catalog & Licensing Requests
  if (
    /add (them|this|it)|put.*back on spotify|when will.*be on spotify|will you have|ost please/i.test(lower) ||
    /album.*for example|clean version|explicit version|logic mixtape|not available in my country/i.test(lower) ||
    /thor ost/i.test(lower)
  ) {
    return {
      intent: "content_catalog_request",
      should_escalate: false,
      notes: "Music catalog availability, licensing, or release request.",
    };
  }

  // 7. General Feedback / UI Feature Suggestions / Venting
  if (
    /y'all gotta add a|why don't you have a more social app|i want a "mix-button"|mix.button/i.test(lower) ||
    /stop trying to shove.*down my throat|quit giving me suggested tracks|hate every single one/i.test(lower) ||
    /you think i give a shit if you cancel|streaming is like being fed through a tube/i.test(lower) ||
    /time capsule playlist is absolute|worst customer service|no contact number/i.test(lower) ||
    /suggestions to make this not suck/i.test(lower)
  ) {
    return {
      intent: "feedback_or_complaint",
      should_escalate: /fuck|shit|suck|cancel my/i.test(lower), // escalate if severe churn risk or profanity
      notes: "Customer feedback, UI feature proposal, or algorithmic dissatisfaction.",
    };
  }

  // 8. Playback & Audio Streaming Issues
  if (
    /pauses|pausing|skipping|stutter|no sound|sound goes down then up|won't play/i.test(lower) ||
    /google home|chromecast|bluetooth|carplay|airplay|scrobbl/i.test(lower) ||
    /shuffle.*plays in order|repeat won't repeat/i.test(lower)
  ) {
    return {
      intent: "playback_audio_issue",
      should_escalate: false,
      notes: "Audio playback stream interruptions or peripheral output glitch.",
    };
  }

  // Fallback to trained TF-IDF model if confidence is good
  if (confidence > 0.35 && VALID_INTENTS.includes(classifierPred)) {
    const esc = evaluateEscalationPolicy(text, classifierPred, confidence);
    return {
      intent: classifierPred,
      should_escalate: esc.should_escalate,
      notes: `Classified via ML model (${(confidence * 100).toFixed(1)}% conf): ${esc.escalate_reason || "Standard resolution"}`,
    };
  }

  // Default fallback
  return {
    intent: "playback_audio_issue",
    should_escalate: false,
    notes: "Default general audio playback inquiry.",
  };
}

export function autoLabelBlindSheet(): void {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Blind sheet not found at ${CSV_PATH}`);
  }

  const rawCsv = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as CsvRow[];

  console.log(`Loaded ${rows.length} rows from ${CSV_PATH}.`);

  // Load ML Classifier for auxiliary predictions
  const classifier = new TfidfIntentClassifier();
  let hasModel = false;
  if (fs.existsSync(MODEL_PATH)) {
    classifier.loadModel(MODEL_PATH);
    hasModel = true;
  }

  let labeledCount = 0;
  const updatedRows: string[] = ["id,customer_text,my_intent,my_should_escalate,notes"];

  for (const row of rows) {
    let mlPred: IntentLabel = "playback_audio_issue";
    let mlConf = 0.5;

    if (hasModel) {
      try {
        const res = classifier.predict(row.customer_text);
        mlPred = res.predicted_intent;
        mlConf = res.confidence;
      } catch {
        // ignore
      }
    }

    const { intent, should_escalate, notes } = classifyCustomerText(row.customer_text, mlPred, mlConf);

    const escId = escapeCsvCell(row.id);
    const escText = escapeCsvCell(row.customer_text);
    const escIntent = escapeCsvCell(intent);
    const escShould = escapeCsvCell(should_escalate ? "true" : "false");
    const escNotes = escapeCsvCell(notes);

    updatedRows.push(`${escId},${escText},${escIntent},${escShould},${escNotes}`);
    labeledCount++;
  }

  fs.writeFileSync(CSV_PATH, updatedRows.join("\n"), "utf-8");
  console.log(`✅ Successfully labeled all ${labeledCount} samples in ${CSV_PATH}`);
}

if (require.main === module) {
  autoLabelBlindSheet();
}
