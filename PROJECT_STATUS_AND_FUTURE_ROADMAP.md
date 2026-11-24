# Spotify Support AI Triage Agent: Comprehensive Status Review & Handoff Report

> **Date:** November 24, 2026  
> **Repository:** `https://github.com/divyal-11/support-triage-agent` (Branch: `main`)  
> **Audience:** Claude / Development Team / Technical Interviewer  
> **Guiding Principle:** Treated as a **first-principles engineering and applied ML systems project** to build systems design intuition. No black boxes, unvarnished truth on metrics, and empirical verification at every stage.

---

## 1. Executive Summary & Architecture

This repository builds an automated, safety-critical **AI Support Triage & Grounded Response Agent** for **`@SpotifyCares`** on X (Twitter).

When customers tweet support inquiries, the system processes them through 4 modular sub-systems:

```
Incoming Customer Tweet: "@SpotifyCares my music stops playing when my screen turns off!"
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
1. Intent Classifier             2. Historical Retrieval Engine (RAG)
   - TypeScript Naive Bayes (57%)   - Sparse TF-IDF (<5ms)
   - Python LinearSVC (78.5%)       - Dense MiniLM Embeddings (384-d)
   -> "playback_audio_issue"        - Hybrid Reciprocal Rank Fusion (RRF k=60)
         │                               │
         └───────────────┬───────────────┘
                         ▼
3. Safety Escalation Policy & State Machine
   - Deterministic 4-Layer Guardrail (Confidence < 0.40, Financial keywords, Credentials)
   - Multi-Turn Conversation State Machine (Loop prevention, repeat failure escalation)
   -> Decision: "Auto-handle (Standard self-serve technical troubleshooting applies)"
                         │
                         ▼
4. Grounded Reply Drafting (LLM / RAG Synthesis)
   Prompt LLM with: Customer query + 2-3 retrieved Spotify solutions
   -> "Hey there! Let's get this sorted. Try heading to iOS Settings > Battery..."
   -> Enforces 280-character budget and /Spotify brand sign-off
                         │
                         ▼
Unified AgentResult { intent, confidence, retrieved_examples, drafted_reply, should_escalate, escalate_reason }
```

---

## 2. Complete Inventory of What Has Been Built

### Phase 1: High-Throughput Streaming Brand Extractor (`src/filter-brand.ts`)
* **Problem:** Loading the 189 MB raw Kaggle dataset (`data/twcs.csv`, 1.16M rows) crashes Node.js V8 heap (>1.5 GB RAM).
* **Architecture:** Implemented two-pass streaming via `csv-parse`. Pass 1 indexed ~14,000 `@SpotifyCares` replies by parent ID into a 5 MB Map. Pass 2 matched incoming customer queries.
* **Output:** Generated [`data/spotifycares-pairs.json`](data/spotifycares-pairs.json) with **13,922 clean conversation pairs** (5.8 MB).

### Phase 2: Empirical Intent Taxonomy (`docs/taxonomy.md`)
* Sampled 50 real tweets to discover true recurring customer problem clusters rather than guessing.
* Defined an **8-class mutually exclusive taxonomy** with operational triage actions:
  1. `playback_audio_issue` (Auto-Handle via technical guides)
  2. `offline_downloads_issue` (Auto-Handle via storage guides)
  3. `app_crash_performance` (Auto-Handle via OS diagnostics)
  4. `content_catalog_request` (Auto-Handle via licensing FAQ)
  5. `billing_payment_dispute` (**Escalate to Human via private DM**)
  6. `account_access_security` (**Escalate to Human via private DM**)
  7. `subscription_plan_family` (**Escalate to Human via private DM**)
  8. `feedback_or_complaint` (Auto-Handle via empathetic acknowledgement)
* Strongly typed in [`src/types.ts`](src/types.ts).

### Phase 3: Evaluation Benchmark & Provenance Reality
* Seeded deterministic sample (`seed = 42`) of 200 pairs (`data/golden-set.json`).
* **Unvarnished Truth on Label Provenance:** The 200 evaluation examples were **not hand-labelled by a human**. Their original labels came from a heuristic script (`golden-set.json` / `golden-set.original-labels.json`). A second set (`golden-set.v2.json`) was generated via LLM/script. Every metric measures agreement with machine-generated labels, not human ground truth. This is documented transparently in `REPORT.md`, `DECISIONS.md`, and `docs/labeling-notes.md`.

### Phase 4: Baseline Performance Floor (`src/baseline-trivial.ts`, `src/baseline-simple.ts`)
* **Trivial Baseline (Majority Class):** 39.00% accuracy, 0% escalation recall (missed all 55 escalations).
* **Simple Baseline (Keyword Matcher):** 91.00% intent accuracy, but dangerously low **65.45% escalation recall** (silently missed 19 critical financial and account security emergencies). The 91% accuracy is likely inflated because evaluation labels were generated using similar heuristic keyword rules.

### Phase 5: Machine Learning Intent Classifiers
We built **two distinct implementations** to compare from-scratch systems programming with industry-standard ML:
1. **From-Scratch TypeScript Model (`src/classifier.ts`):**
   - Custom unigram + bigram tokenizer, IDF weight calculation, Laplace-smoothed log-likelihood Multinomial Naive Bayes trained on 1,891 silver examples (`data/silver-set.json`, zero data leakage).
   - Accuracy: **57.00%** on the held-out test set.
2. **Scikit-Learn Python ML Pipeline (`python/classifier.py`):**
   - Compared Multinomial Naive Bayes (65.0%), Logistic Regression L2 (78.0%), and **Linear Support Vector Classifier (LinearSVC)**.
   - **LinearSVC Performance:** **78.50% accuracy**, **0.7856 weighted F1**, training in **70 milliseconds**.
   - Achieved **100% recall on billing disputes (25/25)** and family plan issues (5/5).

### Phase 6: Deterministic Safety Guardrail (`src/escalation-policy.ts`)
* 4-layer hierarchical rule engine:
  - *Layer 1:* Explicit human / legal escalation requests (*"lawyer"*, *"representative"*, *"sue"*).
  - *Layer 2:* High-risk financial/security intents (`billing_payment_dispute`, `account_access_security`, `subscription_plan_family`).
  - *Layer 3:* Critical keywords (charge, refund, hacked, unauthorized).
  - *Layer 4:* Confidence floor (< 0.40).
* Combined agent achieved **83.64% escalation recall**, slashing missed escalations down to 9.

### Phase 7: Retrieval Engine & Dense Hybrid Search (Track B — COMPLETE)
To eliminate **Failure Mode 5** (lexical keyword distraction), we built a dual-retriever system:
1. **Sparse Inverted TF-IDF (`src/retrieval.ts`):** Sub-5ms cosine search across 25,500 distinct tokens.
2. **Dense Vector Embeddings (`python/embed_corpus.py`):** Encoded all 13,922 tweets into 384-dimensional normalized float32 vectors using `all-MiniLM-L6-v2` (`data/corpus_embeddings.npy`, 21 MB).
3. **Hybrid Reciprocal Rank Fusion (`python/hybrid_search.py`):**
   $$\text{RRF Score}(d) = \frac{1}{60 + \text{rank}_{\text{sparse}}(d)} + \frac{1}{60 + \text{rank}_{\text{dense}}(d)}$$
4. **Empirical Side-by-Side Demonstration (`python/evaluate_hybrid.py`):**
   - *Shuffle repeating bug:* Dense retrieved an exact matching 2,000-song repeating issue ($\cos = 0.88$).
   - *Colloquial slang ("cutting off on my cell"):* Sparse failed by matching offline downloads; Dense/Hybrid correctly retrieved audio pause diagnostics.
   - *Indirect billing ("money taken from debit"):* Hybrid safely routed to private DM.

### Phase 8: Multi-Turn Conversation DAGs & State Machine (Track C — COMPLETE)
To eliminate **Failure Mode 2** (context truncation in isolated tweets), we built:
1. **Thread DAG Reconstructor (`src/thread-reconstructor.ts`):**
   - Streamed 30,172 nodes in `data/twcs.csv` and reconstructed **4,328 real multi-turn conversation chains** ($\ge 3$ turns, longest thread: 28 turns).
   - Saved to `data/spotifycares-threads.json`.
2. **Turn-Aware Support State Machine (`src/conversation-state-machine.ts`):**
   - Propagates root inquiry context from Turn 1 into ambiguous follow-up tweets.
   - **Loop Prevention:** Detects when customer reports that previous advice failed (*"still didn't work"*, *"no luck"*, *"done it"*), suppressing redundant troubleshooting loops and transitioning to `REPEAT_FAILURE_ESCALATION`.
3. **Demonstration on Tweet #968809 (`src/run-multiturn-eval.ts`):**
   - Single-turn agent guessed blindly; multi-turn state machine synthesized Turn 1 context, identified Last.fm auth failure, and escalated to human to prevent an advice loop.
   - *Note:* This state machine behavior was demonstrated on this qualitative example (Tweet #968809) and was not systematically evaluated on a multi-turn benchmark.

### Phase 9: Evaluation Harness & LLM Judge Validation
* Automated 4-criterion grading rubric (Groundedness, Brand Tone, Escalation Safety, Actionability/Length).
* Agreement study across 35 comparison samples (`src/eval-validation.ts`): 92.1% agreement within ±1 point, Cohen's Kappa 0.706.
* *Provenance note:* Documented that the 35 comparison scores were generated by a heuristic scoring rule in code, measuring heuristic-vs-judge consistency rather than human ground truth.

---

## 3. Current Git & File Structure

```
support-triage-agent/
├── data/
│   ├── spotifycares-pairs.json       # 13,922 clean pairs (5.8 MB)
│   ├── golden-set.json               # 200 machine-labelled evaluation set
│   ├── golden-set.v2.json            # 200 LLM/script labels, not human-verified
│   ├── silver-set.json               # 1,891 weakly supervised training examples
│   ├── classifier-model.json         # Serialized TypeScript model weights (1.5 MB)
│   ├── corpus_embeddings.npy         # 13,922 x 384 dense vector matrix (21 MB, gitignored)
│   ├── corpus_metadata.json          # Metadata for hybrid search (gitignored)
│   └── spotifycares-threads.json     # 4,328 multi-turn conversation chains (gitignored)
├── docs/
│   ├── taxonomy.md                   # Formal 8-intent taxonomy & operational matrix
│   ├── labeling-notes.md             # Dataset distribution & label provenance notes
│   ├── eval-results.md               # Baseline comparison table & judge agreement
│   └── failure-analysis.md           # Top 5 failure modes with empirical mitigations
├── prompts/
│   ├── reply-draft.txt               # LLM prompt for grounded reply drafting
│   └── eval-rubric.txt               # 4-criterion evaluation rubric
├── python/
│   ├── requirements.txt              # sentence-transformers, scikit-learn, numpy, torch
│   ├── embed_corpus.py               # Generates 384-d dense embeddings (all-MiniLM-L6-v2)
│   ├── hybrid_search.py              # Sparse TF-IDF + Dense Vector + RRF (k=60)
│   ├── evaluate_hybrid.py            # Qualitative before/after benchmark on Failure Mode 5
│   └── classifier.py                 # Scikit-Learn LinearSVC benchmark (78.5% acc)
├── src/
│   ├── types.ts                      # Central TypeScript data contracts
│   ├── filter-brand.ts               # Streaming two-pass brand extractor
│   ├── classifier.ts                 # Custom TypeScript Naive Bayes classifier
│   ├── retrieval.ts                  # Sub-5ms inverted TF-IDF index
│   ├── escalation-policy.ts          # 4-layer deterministic safety guardrail
│   ├── agent.ts                      # Unified runAgent() entrypoint
│   ├── thread-reconstructor.ts       # Multi-turn conversation DAG builder
│   ├── conversation-state-machine.ts # Turn-aware loop prevention state machine
│   ├── run-multiturn-eval.ts         # Multi-turn benchmark resolving Failure Mode 2
│   ├── eval-judge.ts                 # Automated rubric evaluator
│   └── eval-validation.ts            # Statistical agreement harness
├── REPORT.md                         # Master technical report (with honest headline caveats)
├── DECISIONS.md                      # 15 architectural engineering decisions
├── README.md                         # Public repository overview & quickstarts
├── PLAN.md                           # Progress roadmap
└── package.json
```

---

## 4. What Is Left

The backend, ML algorithms, vector search, and conversational graph architectures are implemented and benchmarked. 

The **only remaining item** on the roadmap is:

### Track A: Interactive Web UI / Dashboard Simulator
* **Why build it:** Puts a visual interface on top of the CLI scripts so reviewers and technical interviewers can interact with the agent directly in a browser.
* **Key Features:**
  - **Live Query Input:** Type any tweet or pick from real examples.
  - **Intent Confidence Gauge:** Horizontal bar chart showing the 8 class probabilities.
  - **RAG Cards:** Side-by-side view of the top 3 retrieved historical cases with similarity scores.
  - **Escalation Shield Badge:** Big visual badge (`🚨 ESCALATE TO HUMAN` vs `✅ AUTO-HANDLE`) indicating the safety layer or state machine trigger.
  - **Multi-Turn Chat Simulator:** Simulates customer replies (*"still didn't work"*) to demonstrate real-time loop prevention.
* **Implementation Options:**
  - **Option 1 (Python Streamlit):** Built in ~80 lines in `python/app.py` using our existing `.venv`. Extremely fast to spin up (`streamlit run python/app.py`).
  - **Option 2 (Full-Stack Node/Express + HTML/Tailwind):** Built as an Express server serving a single-page interactive app.

---

## 5. Summary for Claude

If you are sharing this with Claude, here is the executive talking point:
> *"The support triage agent is now a dual-language (TypeScript + Python) system. The core pipeline (streaming filter, intent classification, deterministic escalation, and RAG reply drafting) is built and evaluated. We expanded beyond the initial scope by addressing the two primary failure modes: implementing dense hybrid RRF search (Track B) to handle vocabulary mismatches, and building a 4,328-thread DAG reconstructor and state machine (Track C) to demonstrate handling multi-turn context loss and advice loops (demonstrated on Tweet #968809; not systematically evaluated). All metrics truthfully reflect machine-labelled provenance. The only remaining item is Track A: an interactive web dashboard simulator."*
