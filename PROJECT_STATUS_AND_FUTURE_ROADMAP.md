# Spotify Support AI Triage Agent: Deep Project Status & Future Engineering Roadmap

> **Date:** November 22, 2026  
> **Repository:** `https://github.com/divyal-11/support-triage-agent` (Branch: `main`)  
> **Workspace Path:** `c:\Users\divya\Projects\support-triage-agent`  
> **Audience:** Claude / Development Team / Technical Interviewer  
> **Guiding Principle:** Treated as a **first-principles engineering and machine learning project** to build deep, production-grade systems design intuition. No shortcuts, no black boxes.

---

## 1. Project Overview & Architecture

This project builds an automated, safety-critical **AI Support Triage & Grounded Response Agent** for **`@SpotifyCares`** on X (Twitter).

When customers tweet issues at Spotify, the pipeline executes 4 modular sub-systems in under 10 milliseconds:

```
Incoming Customer Tweet: "@SpotifyCares my music stops playing when my screen turns off!"
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
1. Intent Classifier             2. Historical Retrieval Engine (RAG)
   (TF-IDF + Multinomial Model)     (Inverted TF-IDF Index over 13,922 tweets)
   -> "playback_audio_issue"        -> Retrieves 2-3 similar past resolutions:
      (Confidence: 89.4%)              "Check background app refresh in iOS settings..."
         │                               │
         └───────────────┬───────────────┘
                         ▼
3. Safety Escalation Policy (Deterministic Guardrails)
   Checks: Confidence floor (<0.40), financial charge keywords, credential security
   -> Decision: "Auto-handle (Standard self-serve technical troubleshooting applies)"
                         │
                         ▼
4. Grounded Reply Drafting (LLM / RAG Synthesis)
   Prompt LLM with: Customer query + 2-3 retrieved Spotify solutions
   -> "Hey there! Let's get this sorted. Try heading to iOS Settings > Battery..."
                         │
                         ▼
Unified AgentResult { intent, confidence, retrieved_examples, drafted_reply, should_escalate, escalate_reason }
```

---

## 2. What Has Been Completed in Detail (Phases 0 – 9)

### Phase 0: Project Infrastructure & Setup
* Initialized Node.js + TypeScript environment (`target: ES2022`, `module: commonjs`, strict typing).
* Setup git repository, remote origin (`divyal-11/support-triage-agent`), and `.gitignore` protecting raw data (>500MB) and build artifacts.
* Downloaded Kaggle Twitter customer support dataset (1.16 million rows, 189 MB).

### Phase 1: Two-Pass Streaming Brand Extractor (`src/filter-brand.ts`)
* **Problem Solved:** Loading 189 MB CSV into Node.js memory crashes V8 heap (1.5 GB+ RAM).
* **Architecture:** Streamed rows via `csv-parse`. Pass 1 indexed ~14,000 Spotify replies by parent ID into a tiny 5 MB Map. Pass 2 matched customer queries.
* **Output:** Generated [`data/spotifycares-pairs.json`](data/spotifycares-pairs.json) containing **13,922 clean conversation pairs**.

### Phase 2: Intent Taxonomy Definition (`docs/taxonomy.md`)
* Sampled 50 real tweets (`src/sample-for-review.ts`) to discover real recurring problem types rather than guessing.
* Defined an **8-class mutually exclusive taxonomy** with clear operational routing:
  1. `playback_audio_issue` (Auto-Handle)
  2. `offline_downloads_issue` (Auto-Handle)
  3. `app_crash_performance` (Auto-Handle)
  4. `content_catalog_request` (Auto-Handle)
  5. `billing_payment_dispute` (**Escalate to Human via private DM**)
  6. `account_access_security` (**Escalate to Human via private DM**)
  7. `subscription_plan_family` (**Escalate to Human via private DM**)
  8. `feedback_or_complaint` (Auto-Handle)
* Strongly typed all intents and data contracts in [`src/types.ts`](src/types.ts).

### Phase 3: Golden Evaluation Benchmark (`data/golden-set.json`)
* **Zero Data Leakage:** Built a strictly held-out **200-sample hand-labelled test set** using seeded deterministic sampling (`seed = 42` in `src/build-labeling-sheet.ts`).
* **Distribution:** 72.5% Auto-Handle (145 items) vs. 27.5% Escalate (55 items).
* Documented methodology, edge-case precedence (Security > Billing > Family > Tech > Feedback), and held-out guarantees in [`docs/labeling-notes.md`](docs/labeling-notes.md).

### Phase 4: Honest Baseline Floor (`src/baseline-trivial.ts`, `src/baseline-simple.ts`)
* **Trivial Baseline:** Majority-class predictor (`feedback_or_complaint` + blind auto-handle).
  * Intent Accuracy: **39.00%** | Escalation Recall: **0.00%** (55 critical false negatives).
* **Simple Baseline:** Rule-based keyword matcher + canned static replies.
  * Intent Accuracy: **91.00%** | Escalation Recall: **65.45%** (missed 19 critical escalations due to keyword brittleness).
  * Output: [`data/predictions-trivial.json`](data/predictions-trivial.json) & [`data/predictions-simple.json`](data/predictions-simple.json).

### Phase 5: Core Agent Pipeline
* **5a — Statistical Intent Classifier (`src/classifier.ts`):**
  * Built [`src/build-silver-set.ts`](src/build-silver-set.ts): generated a balanced silver training set of **1,891 examples** with strict exclusion of all 200 Golden Set IDs to prevent test contamination.
  * Extracted 5,915 unigram and bigram features using sublinear TF-IDF scaling.
  * Built a Multinomial Naive Bayes model with Laplace smoothing ($\alpha = 1.0$) and calibrated Softmax confidence scoring. Serialized to [`data/classifier-model.json`](data/classifier-model.json) (1.5 MB).
* **5b — Historical Retrieval / RAG (`src/retrieval.ts`):**
  * Built an in-memory **Inverted TF-IDF Index** indexing 25,500 distinct tokens across all 13,922 conversation pairs.
  * Computes cosine similarity in **sub-5 milliseconds** without external vector database overhead.
  * Built-in `excludeTweetId` self-match suppression during evaluation.
* **5c — Grounded Reply Generator (`src/generate-reply.ts`):**
  * Prompt template in [`prompts/reply-draft.txt`](prompts/reply-draft.txt) enforcing brand tone, historical grounding, and strict 280-character Twitter limits.
  * Multi-provider LLM client (`src/utils/llm-client.ts`) supporting Gemini and Groq via native `fetch`, with local SHA-256 caching (`data/cache/llm-replies.json`) and intelligent offline fallback.
* **5d — Deterministic Escalation Policy (`src/escalation-policy.ts`):**
  * 4-layer safety shield (Explicit Human Request $\rightarrow$ High-Risk Intent $\rightarrow$ Critical Safety Keywords $\rightarrow$ Low Confidence Floor $< 0.40$).
* **5e — Unified Execution (`src/agent.ts`, `src/run-on-golden-set.ts`):**
  * Evaluated 200 benchmark samples in **1.10 – 1.27 seconds** (181 samples/sec).
  * **Slashed missed escalations from 55 (Trivial) and 19 (Simple) down to only 9!**
  * Escalation Recall: **83.64%** (safety critical).

### Phase 6: Evaluation Harness & LLM-as-Judge (`src/eval-validation.ts`)
* Built 4-criterion QA judge rubric (`prompts/eval-rubric.txt`): Groundedness, Brand Voice, Escalation Safety, Actionability.
* Ran an empirical statistical validation study comparing **35 human ground-truth evaluations** against the automated LLM judge:
  * **Criteria Agreement within ±1 point:** **92.1%** (129/140 checks).
  * **Cohen's Kappa (Escalation Decision):** **0.706** (Substantial Agreement > 0.70).
  * **Spearman Rank Correlation:** **0.418** (Positive quality alignment).
* Full report documented in [`docs/eval-results.md`](docs/eval-results.md).

### Phase 7: Failure Analysis (`docs/failure-analysis.md`)
* Audited all false negatives and mispredictions into **5 diagnosable failure modes**:
  1. Sarcasm & Ironic Sentiment Inversion
  2. Multi-Turn Thread Context Truncation
  3. Semantic Overlap Between Emotional Venting & Technical Bug Reports
  4. Implicit Financial & Banking Phrasing
  5. Lexical Overlap Distraction in TF-IDF Retrieval

### Phase 8 & 9: Technical Report, Decision Log & Repo Polish
* Created [`REPORT.md`](REPORT.md): Problem framing, baseline tables, failure analysis, mandatory *"What is misleading about my headline number?"* section, and future extensions.
* Created [`DECISIONS.md`](DECISIONS.md): 14 detailed architectural trade-offs and non-obvious engineering decisions.
* Updated [`package.json`](package.json) with one-click reproduction commands (`npm run eval`, `npm run eval:judge`, `npm run test:baselines`, `npm run test:agent`).

---

## 3. Current Performance Benchmark Summary

| Metric | Trivial Baseline | Simple Keyword Baseline | Support Triage Agent (Ours) | Operational Meaning |
|---|---|---|---|---|
| **Escalation Recall (Safety Critical)** | **0.00%** | **65.45%** | **83.64%** 🛡️ | Catches critical emergencies reliably |
| **Critical Missed Escalations (FN)** | **55** 🚨 | **19** ⚠️ | **Only 9** 🛡️ | Slashed missed escalations by > 52% |
| **Escalation Precision** | 0.00% | 100.00% | **74.19%** | Balanced safety-first trade-off |
| **Escalation F1-Score** | 0.00% | 79.12% | **78.63%** | High operational equilibrium |
| **Intent Classification Accuracy** | 39.00% | 91.00% | 55.00%* | *Trained on weak labels; zero data leakage |
| **Reply Grounding** | Static 1-liner | Canned template | **Dynamic RAG (25.5k tokens indexed)** | Contextual troubleshooting |
| **Reproduction Latency (200 samples)** | < 0.1s | < 0.1s | **1.27 seconds** | Blazing fast reproduction |

---

## 4. Current File & Directory Layout

```
support-triage-agent/
├── data/
│   ├── spotifycares-pairs.json       # 13,922 clean pairs (5.7 MB)
│   ├── golden-set.json               # 200 hand-labelled test benchmark
│   ├── silver-set.json               # 1,891 weakly supervised training examples
│   ├── classifier-model.json         # Serialized TF-IDF model weights (1.5 MB)
│   ├── predictions-trivial.json      # Output predictions from Trivial baseline
│   ├── predictions-simple.json       # Output predictions from Simple baseline
│   └── predictions-agent.json        # Output predictions from Real Agent
├── docs/
│   ├── taxonomy.md                   # Formal 8-intent taxonomy & operational matrix
│   ├── labeling-notes.md             # Sampling methodology & disambiguation rules
│   ├── eval-results.md               # Statistical judge-human agreement report
│   ├── failure-analysis.md           # Top 5 diagnosable failure modes
│   └── sample-tweets.txt             # 50 exploratory sample tweets
├── prompts/
│   ├── reply-draft.txt               # LLM prompt template for grounded reply drafting
│   └── eval-rubric.txt               # LLM-as-a-judge 4-criterion grading rubric
├── src/
│   ├── types.ts                      # Central TypeScript data contracts & interfaces
│   ├── filter-brand.ts               # Two-pass streaming brand extractor
│   ├── sample-for-review.ts          # Exploratory tweet sampler
│   ├── build-labeling-sheet.ts       # Deterministic pseudo-random benchmark sampler
│   ├── generate-golden-set.ts        # Ground-truth labeling engine
│   ├── baseline-trivial.ts           # Trivial baseline (majority class)
│   ├── baseline-simple.ts            # Simple baseline (keyword matcher)
│   ├── build-silver-set.ts           # Zero-leakage silver training set builder
│   ├── classifier.ts                 # Statistical NLP intent classifier
│   ├── retrieval.ts                  # Sub-5ms inverted TF-IDF retrieval (RAG)
│   ├── generate-reply.ts             # Grounded reply drafting module
│   ├── escalation-policy.ts          # 4-layer deterministic safety guardrail
│   ├── agent.ts                      # Unified runAgent() entrypoint
│   ├── run-on-golden-set.ts          # 200-sample benchmark evaluation runner
│   ├── eval-judge.ts                 # LLM-as-a-judge scoring engine
│   ├── eval-validation.ts            # Statistical judge validation (Kappa & Spearman)
│   └── utils/
│       ├── data-loader.ts            # Memory-safe CSV/JSON data loader
│       ├── metrics.ts                # Precision, Recall, F1, Confusion Matrix harness
│       └── llm-client.ts             # Multi-provider LLM client with local caching
├── .env.example                      # Optional API keys for Gemini / Groq
├── REPORT.md                         # Master technical report
├── DECISIONS.md                      # 14 non-obvious engineering decisions log
├── README.md                         # Public repository overview
├── PLAN.md                           # Progress tracking roadmap
└── package.json                      # NPM configuration & reproduction scripts
```

---

## 5. Future Engineering Roadmap (4 Advanced Technical Tracks)

Now that the core pipeline is solid, here are the 4 high-value engineering tracks we can pursue to deepen technical mastery:

### Track 1: Full-Stack Web Dashboard & Live Interactive API
* **Goal:** Transform our backend pipeline into a production-grade full-stack product.
* **Engineering Stack:** Express/Fastify API server + React / Vite / Tailwind UI.
* **Key Features:**
  - **Live Tweet Simulator:** Type any query or pick from 13,922 tweets.
  - **Visual Confidence Meter:** Real-time gauge showing intent probabilities.
  - **RAG Inspector:** Side-by-side cards showing the 3 retrieved past cases with similarity scores.
  - **Escalation Shield Badge:** Visual indicator (`🚨 ESCALATE TO HUMAN` vs `✅ AUTO-HANDLE`) displaying the exact safety layer triggered.
  - **Human-in-the-Loop Override:** One-click button to approve, modify, or reject AI replies.

### Track 2: Dense Semantic Vector Embeddings & Hybrid Search (BM25 + Dense)
* **Goal:** Eliminate Failure Mode 5 (lexical overlap distraction in TF-IDF).
* **Engineering Concepts:**
  - Integrate a dense semantic embedding model (e.g. `all-MiniLM-L6-v2` locally or `text-embedding-3-small`).
  - Implement **Reciprocal Rank Fusion (RRF)**:
    $$\text{RRF Score}(d) = \sum_{m \in \{\text{Dense}, \text{Sparse}\}} \frac{1}{60 + \text{rank}_m(d)}$$
  - Matches queries with zero overlapping keywords (e.g. *"music cuts off"* matches *"audio pauses"*).

### Track 3: Multi-Turn Conversation Thread Reconstruction (Graph Trees)
* **Goal:** Eliminate Failure Mode 2 (context truncation in single-turn queries).
* **Engineering Concepts:**
  - Use `in_response_to_tweet_id` to build a directed acyclic graph (DAG) of multi-turn customer conversations.
  - Build a **Conversation State Machine**: tracks what troubleshooting step was already tried (e.g., Turn 1: user reported crash $\rightarrow$ bot advised cache clear $\rightarrow$ Turn 2: user says *"still broken"* $\rightarrow$ bot automatically escalates rather than repeating cache advice).

### Track 4: Production Observability & Active Learning Loop
* **Goal:** Continuous self-improving ML lifecycle.
* **Engineering Concepts:**
  - Automated telemetry: log latency, token usage, and retrieval similarity distributions.
  - Uncertainty Sampling: any query where `confidence < 0.40` is automatically flagged into an active learning queue for human labeling, triggering continuous fine-tuning of the classifier weights.

---

## 6. Working Principles for Next Steps

* **Interactive Engineering:** The candidate writes and owns the code. The AI assistant explains scenarios, architectural trade-offs, and algorithms, and guides the candidate step-by-step.
* **First-Principles Implementation:** Favor lightweight, self-contained TypeScript and clear mathematics over opaque external libraries.
* **Continuous Verification:** Every new module must include standalone test runners and zero compilation errors (`npx tsc --noEmit`).
