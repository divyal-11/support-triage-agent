import { ConversationPair } from "./types";
import { loadSpotifyPairs } from "./utils/data-loader";
import { tokenize } from "./classifier";

export interface RetrievedCase {
  customer_tweet_id: string;
  customer_text: string;
  brand_reply_text: string;
  similarity_score: number;
}

interface Posting {
  docIndex: number;
  weight: number;
}

export class HistoricalRetrievalEngine {
  private pairs: ConversationPair[] = [];
  private invertedIndex: Map<string, Posting[]> = new Map();
  private docNorms: Float64Array = new Float64Array(0);
  private idfMap: Map<string, number> = new Map();
  private isIndexed: boolean = false;

  /**
   * Builds an in-memory inverted TF-IDF index over historical conversation pairs.
   */
  public indexCorpus(pairs: ConversationPair[]): void {
    console.log(`Building inverted retrieval index over ${pairs.length} historical conversations...`);
    this.pairs = pairs;
    const N = pairs.length;
    this.docNorms = new Float64Array(N);
    this.invertedIndex.clear();
    this.idfMap.clear();

    const docTokens: string[][] = [];
    const dfMap = new Map<string, number>();

    // 1. Tokenize all customer queries and calculate Document Frequencies
    for (let i = 0; i < N; i++) {
      const tokens = tokenize(pairs[i]!.customer_text);
      docTokens.push(tokens);
      const unique = new Set(tokens);
      for (const t of unique) {
        dfMap.set(t, (dfMap.get(t) || 0) + 1);
      }
    }

    // 2. Compute smooth IDF weights: ln((1 + N) / (1 + df)) + 1
    for (const [token, df] of dfMap.entries()) {
      if (df >= 2) {
        this.idfMap.set(token, Math.log((1 + N) / (1 + df)) + 1.0);
      }
    }

    // 3. Build Inverted Index postings and precompute L2 document vector norms
    for (let i = 0; i < N; i++) {
      const tokens = docTokens[i]!;
      const tfMap = new Map<string, number>();

      for (const t of tokens) {
        if (this.idfMap.has(t)) {
          tfMap.set(t, (tfMap.get(t) || 0) + 1);
        }
      }

      let sumSquaredWeights = 0;
      for (const [token, count] of tfMap.entries()) {
        const idf = this.idfMap.get(token) || 1.0;
        const tf = Math.log(1 + count); // Sublinear TF
        const weight = tf * idf;
        sumSquaredWeights += weight * weight;

        let postings = this.invertedIndex.get(token);
        if (!postings) {
          postings = [];
          this.invertedIndex.set(token, postings);
        }
        postings.push({ docIndex: i, weight });
      }

      this.docNorms[i] = Math.sqrt(sumSquaredWeights);
    }

    this.isIndexed = true;
    console.log(`Index built successfully! Indexed ${this.invertedIndex.size} distinct search terms.\n`);
  }

  /**
   * Search for the Top-K most similar past conversations using Cosine Similarity.
   * @param queryText The incoming customer tweet
   * @param topK Number of historical cases to retrieve (default: 3)
   * @param excludeTweetId Optional tweet ID to exclude (prevents self-retrieval during evaluation)
   */
  public search(queryText: string, topK: number = 3, excludeTweetId?: string): RetrievedCase[] {
    if (!this.isIndexed) {
      this.indexCorpus(loadSpotifyPairs());
    }

    const queryTokens = tokenize(queryText);
    const queryTf = new Map<string, number>();

    for (const t of queryTokens) {
      if (this.idfMap.has(t)) {
        queryTf.set(t, (queryTf.get(t) || 0) + 1);
      }
    }

    if (queryTf.size === 0) {
      return [];
    }

    // Compute query vector and query L2 norm
    const queryWeights = new Map<string, number>();
    let querySumSquared = 0;

    for (const [token, count] of queryTf.entries()) {
      const idf = this.idfMap.get(token) || 1.0;
      const weight = Math.log(1 + count) * idf;
      queryWeights.set(token, weight);
      querySumSquared += weight * weight;
    }

    const queryNorm = Math.sqrt(querySumSquared);
    if (queryNorm === 0) return [];

    // Accumulate dot products using the inverted index
    const dotProducts = new Map<number, number>();

    for (const [token, qWeight] of queryWeights.entries()) {
      const postings = this.invertedIndex.get(token);
      if (!postings) continue;

      for (const p of postings) {
        dotProducts.set(p.docIndex, (dotProducts.get(p.docIndex) || 0) + qWeight * p.weight);
      }
    }

    // Score and rank candidates by Cosine Similarity
    const candidates: { docIndex: number; score: number }[] = [];

    for (const [docIndex, dotProd] of dotProducts.entries()) {
      const pair = this.pairs[docIndex]!;
      if (excludeTweetId && pair.customer_tweet_id === excludeTweetId) {
        continue; // Suppress self-match during benchmarking
      }

      const docNorm = this.docNorms[docIndex]!;
      if (docNorm > 0) {
        const cosineSim = dotProd / (queryNorm * docNorm);
        candidates.push({ docIndex, score: cosineSim });
      }
    }

    // Sort descending by similarity score
    candidates.sort((a, b) => b.score - a.score);

    // Return Top-K cases
    return candidates.slice(0, topK).map((c) => {
      const pair = this.pairs[c.docIndex]!;
      return {
        customer_tweet_id: pair.customer_tweet_id,
        customer_text: pair.customer_text,
        brand_reply_text: pair.brand_reply_text,
        similarity_score: Math.min(1.0, Math.max(0.0, c.score)),
      };
    });
  }
}

// Global singleton instance for easy import across modules
export const retrievalEngine = new HistoricalRetrievalEngine();

/**
 * CLI Runner: Tests the retrieval engine with real-world query scenarios.
 */
function testRetrieval() {
  const pairs = loadSpotifyPairs();
  retrievalEngine.indexCorpus(pairs);

  const testQueries = [
    "My music stops playing whenever my phone screen turns off",
    "Why was I charged twice for Spotify Premium this month?",
    "Cannot reset my password, the website keeps giving me an error message",
    "Downloaded songs disappeared and won't play offline",
  ];

  console.log("=== Testing Retrieval Engine (RAG) on Sample Customer Issues ===\n");

  for (const q of testQueries) {
    console.log(`QUERY: "${q}"`);
    const results = retrievalEngine.search(q, 2);

    if (results.length === 0) {
      console.log("  No matches found.\n");
      continue;
    }

    results.forEach((r, idx) => {
      console.log(`  [Match #${idx + 1}] (Cosine Similarity: ${(r.similarity_score * 100).toFixed(1)}%)`);
      console.log(`  - Past Customer: "${r.customer_text}"`);
      console.log(`  - Spotify Reply: "${r.brand_reply_text}"`);
    });
    console.log("--------------------------------------------------------------------------------\n");
  }
}

if (require.main === module) {
  testRetrieval();
}
