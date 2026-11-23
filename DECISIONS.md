# Engineering Decision Log: Architectural Decisions

> A record of architectural trade-offs, engineering decisions, and why alternatives were rejected.

---

### 1. Selected Brand: `@SpotifyCares` over Retail or Airline Brands
* **Decision:** We selected `@SpotifyCares` from the 30+ brands in the 2.8M Kaggle Twitter dataset.
* **Why:** Spotify has clear boundaries between self-serve technical bugs (playback pauses, offline downloads, cache issues) and sensitive financial/security issues (family plans, credit card renewals, password resets).

---

### 2. Two-Pass Streaming over In-Memory CSV Loading
* **Decision:** Used Node.js streaming (`csv-parse`) with two sequential passes over `twcs.csv` rather than loading all rows into an array with `fs.readFileSync`.
* **Why:** A 189 MB CSV on disk expands into over 1.5 GB to 2+ GB of V8 heap memory when parsed into 1.16 million JavaScript objects, crashing Node.js with out-of-memory errors. Streaming maintains flat RAM usage (< 30 MB) regardless of file size.

---

### 3. Reversing Map Key Cardinality (Matching on Brand Replies)
* **Decision:** In Pass 1 of data filtering, we indexed Spotify's replies by parent tweet ID (`in_response_to_tweet_id`), rather than collecting incoming customer tweets.
* **Why:** Out of 1.16 million rows, Spotify only replied ~14,000 times. Storing 14,000 items in a JavaScript `Map` takes ~5 MB of RAM. If we had collected customer tweets from all brands in Pass 1, we would have stored hundreds of thousands of irrelevant tweets, blowing memory again.

---

### 4. Strictly Held-Out Evaluation Benchmark (Zero Data Leakage)
* **Decision:** Kept our 200-sample machine-labelled evaluation set (not human-verified) (`data/golden-set.json`) completely isolated as a test set, forbidding any model training on it.
* **Why:** In machine learning, training and testing on the same data invalidates evaluation numbers. A separate test set tests generalization, though metrics remain indicative of agreement with machine labels rather than human truth.

---

### 5. Weakly Supervised Silver Training Set (1,891 Examples)
* **Decision:** Built `src/build-silver-set.ts` to generate 1,891 training samples from the remaining 13,722 pairs using heuristic weak supervision, with explicit exclusion of evaluation set IDs.
* **Why:** Weak supervision trades minor label noise for training volume, allowing us to train a statistical NLP classifier without contaminating the evaluation benchmark.

---

### 6. In-Memory Inverted TF-IDF Index over External Vector Databases
* **Decision:** Built a custom in-memory inverted TF-IDF index (`src/retrieval.ts`) indexing 25,500 distinct tokens across 13,922 conversations instead of introducing Pinecone, Chroma, or Milvus.
* **Why:** External vector databases introduce Docker dependencies, network latency, API costs, and setup friction for reviewers. Our in-memory inverted index computes cosine similarity in under 5 milliseconds with zero external dependencies.

---

### 7. Self-Match Suppression (`excludeTweetId`) During Benchmarking
* **Decision:** Added an explicit `excludeTweetId` filter in `retrievalEngine.search()`.
* **Why:** When evaluating the 200 evaluation set tweets, if the retrieval engine searched the full 13,922 corpus, it would find the exact identical historical tweet and retrieve Spotify's actual past reply with 100% similarity. Suppressing self-matches forces the system to retrieve from *other* similar past cases.

---

### 8. Generative RAG Synthesis over Extractive Copy-Pasting
* **Decision:** Used an LLM prompted with historical examples to synthesize a fresh reply, rather than copy-pasting Spotify's past reply from the #1 match.
* **Why:** Historical tweets contain specific customer handles (e.g. `@115887`), outdated names, and broken `t.co` shortlinks from 2017. Generative RAG extracts the underlying troubleshooting steps while generating a clean, modern response for the new user.

---

### 9. Deterministic 4-Layer Safety Shield over LLM-Based Escalation
* **Decision:** Enforced escalation using a deterministic 4-layer rule engine (`src/escalation-policy.ts`) rather than asking an LLM to decide whether to escalate.
* **Why:** LLMs are probabilistic and can hallucinate. In customer support, an AI hallucinating that an unauthorized credit card charge or hacked account can be auto-handled creates liability. Deterministic guardrails enforce human escalation on high-risk domains.

---

### 10. Prioritizing Escalation Recall over Precision
* **Decision:** Tuned the escalation policy to prioritize Recall (83.64%) over Precision (74.19%).
* **Why:** In triage operations, the cost of a False Negative (failing to escalate a customer in distress) is high. The cost of a False Positive (a human agent answering a technical question) is minor.

---

### 11. Strict 280-Character Budget Enforcement in Post-Processing
* **Decision:** Built an automated string trimmer in `src/generate-reply.ts` that enforces a 280-character maximum and appends `/Spotify`.
* **Why:** LLMs naturally tend toward verbose explanations. Twitter/X rejects posts that exceed 280 characters. Enforcing this in post-processing ensures outputs fit within platform limits.

---

### 12. Local Response Caching (`data/cache/`) for Deterministic Reproduction
* **Decision:** Built a SHA-256 hashed local response cache for LLM calls (`src/utils/llm-client.ts`).
* **Why:** Evaluators should not have to wait, pay for API tokens, or suffer API rate limits. With pre-cached outputs, `npx tsx src/run-on-golden-set.ts` evaluates all 200 samples in ~1.1 seconds.

---

### 13. Multi-Provider LLM Fallback (Gemini + Groq + Native Synthesis)
* **Decision:** Implemented native `fetch` support for Gemini and Groq, with an offline grounded fallback synthesizer if no API keys are present.
* **Why:** Avoids heavy third-party SDK dependencies and guarantees the evaluation pipeline runs even in an air-gapped or keyless environment.

---

### 14. Quantitative Judge Agreement Analysis (Cohen's Kappa & Spearman)
* **Decision:** Measured automated judge consistency against a deterministic heuristic scoring baseline using Cohen's Kappa (0.706) and % agreement within ±1 point (92.1%) across 35 comparison samples.
* **Provenance Note:** These 35 comparison ratings were generated by a programmatic heuristic rule in `src/eval-validation.ts`, not by a human annotator.
* **Why:** Quantitative metrics provide an empirical estimate of judge consistency with deterministic rules compared to unconstrained impressions.

---

### 15. Machine-Generated Evaluation Labels
* **Decision:** Evaluation labels are machine-generated.
* **Reason:** Time constraints.
* **Consequence:** Metrics are indicative only.
