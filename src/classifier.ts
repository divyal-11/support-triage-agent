import fs from "fs";
import path from "path";
import { IntentLabel, VALID_INTENTS, GoldenExample } from "./types";
import { loadGoldenSet, saveJsonFile } from "./utils/data-loader";

const SILVER_SET_PATH = path.join(__dirname, "../data/silver-set.json");
const MODEL_PATH = path.join(__dirname, "../data/classifier-model.json");

export interface ClassificationResult {
  predicted_intent: IntentLabel;
  confidence: number;
  probabilities: Record<IntentLabel, number>;
}

export interface SerializedClassifierModel {
  vocabulary: Record<string, number>; // token -> vocab index
  idf: number[]; // vocab index -> idf weight
  classPriors: Record<IntentLabel, number>; // log prior probabilities
  featureLogProb: Record<IntentLabel, number[]>; // class -> log P(w|c) array
  totalDocs: number;
}

/**
 * Text normalizer and N-gram tokenizer.
 * Extracts both unigrams and bigrams to capture compound phrases like "cant login" or "family plan".
 */
export function tokenize(text: string): string[] {
  const clean = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ") // remove URLs
    .replace(/@\w+/g, " ") // remove @mentions
    .replace(/[^a-z0-9\s]/g, " ") // keep only alphanumeric
    .replace(/\s+/g, " ")
    .trim();

  const words = clean.split(" ").filter((w) => w.length > 1);
  const tokens: string[] = [...words];

  // Generate bigrams
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]}_${words[i + 1]}`);
  }

  return tokens;
}

export class TfidfIntentClassifier {
  private model: SerializedClassifierModel | null = null;

  /**
   * Train the TF-IDF Multinomial model on a training set.
   */
  public train(trainingData: { customer_text: string; weak_intent: IntentLabel }[]): void {
    console.log(`Training TF-IDF Intent Classifier on ${trainingData.length} silver examples...`);

    const N = trainingData.length;
    const docTokens: string[][] = trainingData.map((d) => tokenize(d.customer_text));

    // 1. Compute Document Frequencies (DF)
    const dfMap = new Map<string, number>();
    for (const tokens of docTokens) {
      const unique = new Set(tokens);
      for (const t of unique) {
        dfMap.set(t, (dfMap.get(t) || 0) + 1);
      }
    }

    // 2. Filter vocabulary with min_df >= 2 to remove single-typo noise
    const vocabulary: Record<string, number> = {};
    const idf: number[] = [];
    let vocabIndex = 0;

    for (const [token, df] of dfMap.entries()) {
      if (df >= 2) {
        vocabulary[token] = vocabIndex;
        // Standard smooth IDF formula: ln((1 + N) / (1 + df)) + 1
        idf[vocabIndex] = Math.log((1 + N) / (1 + df)) + 1.0;
        vocabIndex++;
      }
    }

    console.log(`Vocabulary size after min_df filtering: ${vocabIndex} features (unigrams + bigrams).`);

    // 3. Compute Class Priors P(c)
    const classCounts: Record<IntentLabel, number> = {
      playback_audio_issue: 0,
      offline_downloads_issue: 0,
      app_crash_performance: 0,
      content_catalog_request: 0,
      billing_payment_dispute: 0,
      account_access_security: 0,
      subscription_plan_family: 0,
      feedback_or_complaint: 0,
    };

    for (const d of trainingData) {
      classCounts[d.weak_intent]++;
    }

    const classPriors = {} as Record<IntentLabel, number>;
    for (const c of VALID_INTENTS) {
      classPriors[c] = Math.log(classCounts[c] / N);
    }

    // 4. Compute Weighted Feature Likelihoods P(w | c) with Laplace Smoothing
    // Initialize feature weights per class
    const classFeatureWeights: Record<IntentLabel, Float64Array> = {} as any;
    const classTotalWeight: Record<IntentLabel, number> = {} as any;

    for (const c of VALID_INTENTS) {
      classFeatureWeights[c] = new Float64Array(vocabIndex);
      classTotalWeight[c] = 0;
    }

    // Accumulate TF-IDF weights per class
    for (let i = 0; i < N; i++) {
      const intent = trainingData[i]!.weak_intent;
      const tokens = docTokens[i]!;
      const tfMap = new Map<number, number>();

      for (const t of tokens) {
        const idx = vocabulary[t];
        if (idx !== undefined) {
          tfMap.set(idx, (tfMap.get(idx) || 0) + 1);
        }
      }

      // Compute TF-IDF for this document
      for (const [idx, count] of tfMap.entries()) {
        const tf = Math.log(1 + count); // sublinear TF scaling
        const weight = tf * (idf[idx] || 1.0);
        classFeatureWeights[intent]![idx]! += weight;
        classTotalWeight[intent]! += weight;
      }
    }

    // Compute smoothed log conditional probabilities: log P(w | c)
    const alpha = 0.1; // Optimized Laplace smoothing for sparse NLP text
    const featureLogProb: Record<IntentLabel, number[]> = {} as any;

    for (const c of VALID_INTENTS) {
      featureLogProb[c] = new Array(vocabIndex);
      const denominator = classTotalWeight[c]! + alpha * vocabIndex;
      for (let j = 0; j < vocabIndex; j++) {
        const numerator = classFeatureWeights[c]![j]! + alpha;
        featureLogProb[c]![j] = Math.log(numerator / denominator);
      }
    }

    this.model = {
      vocabulary,
      idf,
      classPriors,
      featureLogProb,
      totalDocs: N,
    };

    console.log("Classifier training complete.");
  }

  /**
   * Predict intent and calibrated probabilities for any text string.
   */
  public predict(text: string): ClassificationResult {
    if (!this.model) {
      throw new Error("Classifier model is not trained or loaded.");
    }

    const tokens = tokenize(text);
    const { vocabulary, idf, classPriors, featureLogProb } = this.model;

    // Build document TF-IDF representation
    const tfMap = new Map<number, number>();
    for (const t of tokens) {
      const idx = vocabulary[t];
      if (idx !== undefined) {
        tfMap.set(idx, (tfMap.get(idx) || 0) + 1);
      }
    }

    // Compute log posterior scores per class
    const logScores: Record<IntentLabel, number> = {} as any;
    let maxLogScore = -Infinity;

    for (const c of VALID_INTENTS) {
      let score = classPriors[c];
      for (const [idx, count] of tfMap.entries()) {
        const tf = Math.log(1 + count);
        const tfidf = tf * (idf[idx] || 1.0);
        const logProb = featureLogProb[c]![idx]!;
        score += tfidf * logProb;
      }
      logScores[c] = score;
      if (score > maxLogScore) {
        maxLogScore = score;
      }
    }

    // Softmax normalization using numerical stability trick (subtract maxLogScore)
    let sumExp = 0;
    const expScores: Record<IntentLabel, number> = {} as any;

    for (const c of VALID_INTENTS) {
      const exp = Math.exp(logScores[c] - maxLogScore);
      expScores[c] = exp;
      sumExp += exp;
    }

    let topIntent: IntentLabel = "feedback_or_complaint";
    let topProb = -1;
    const probabilities: Record<IntentLabel, number> = {} as any;

    for (const c of VALID_INTENTS) {
      const prob = expScores[c] / sumExp;
      probabilities[c] = prob;
      if (prob > topProb) {
        topProb = prob;
        topIntent = c;
      }
    }

    return {
      predicted_intent: topIntent,
      confidence: topProb,
      probabilities,
    };
  }

  /**
   * Save model weights to JSON
   */
  public saveModel(outputPath: string = MODEL_PATH): void {
    if (!this.model) {
      throw new Error("Cannot save uninitialized model.");
    }
    saveJsonFile(outputPath, this.model);
    console.log(`Saved trained model to: ${outputPath}`);
  }

  /**
   * Load pre-trained model weights from JSON
   */
  public loadModel(inputPath: string = MODEL_PATH): void {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Model file not found at ${inputPath}`);
    }
    const raw = fs.readFileSync(inputPath, "utf-8");
    this.model = JSON.parse(raw) as SerializedClassifierModel;
  }

  public isLoaded(): boolean {
    return this.model !== null;
  }
}

// Global singleton instance for easy import across modules
export const intentClassifier = new TfidfIntentClassifier();

/**
 * CLI runner: Trains on silver set, saves model, and evaluates on golden set.
 */
function runTrainingAndEvaluation() {
  if (!fs.existsSync(SILVER_SET_PATH)) {
    throw new Error(`Silver set not found at ${SILVER_SET_PATH}. Run src/build-silver-set.ts first.`);
  }

  const silverRaw = fs.readFileSync(SILVER_SET_PATH, "utf-8");
  const silverData = JSON.parse(silverRaw);

  const classifier = new TfidfIntentClassifier();
  classifier.train(silverData);
  classifier.saveModel(MODEL_PATH);

  // Evaluate on the Strictly Held-Out Golden Set (Zero Leakage)
  console.log("\n=== Evaluating Classifier on Held-Out Golden Set (200 samples) ===");
  const goldenSet: GoldenExample[] = loadGoldenSet();

  let correct = 0;
  const perClassTotal: Record<string, number> = {};
  const perClassCorrect: Record<string, number> = {};

  for (const item of goldenSet) {
    perClassTotal[item.intent] = (perClassTotal[item.intent] || 0) + 1;
    const res = classifier.predict(item.customer_text);

    if (res.predicted_intent === item.intent) {
      correct++;
      perClassCorrect[item.intent] = (perClassCorrect[item.intent] || 0) + 1;
    }
  }

  const accuracy = (correct / goldenSet.length) * 100;
  console.log(`\nOverall Intent Accuracy: ${accuracy.toFixed(2)}% (${correct}/${goldenSet.length})`);
  console.log("\n--- Per-Class Accuracy Breakdown ---");
  for (const intent of VALID_INTENTS) {
    const tot = perClassTotal[intent] || 0;
    const corr = perClassCorrect[intent] || 0;
    const pct = tot > 0 ? ((corr / tot) * 100).toFixed(1) : "0.0";
    console.log(`- ${intent.padEnd(25)}: ${corr}/${tot} (${pct}%)`);
  }
}

if (require.main === module) {
  runTrainingAndEvaluation();
}
