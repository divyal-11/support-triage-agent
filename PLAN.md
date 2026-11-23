# triage — build plan

AI customer-support agent for @SpotifyCares tweets. Classifies intent, drafts a grounded reply, decides auto-handle vs escalate — and proves it's trustworthy enough to matter.

**Stack:** TypeScript, Node.js, ts-node. Classical ML (TF-IDF + Logistic Regression) for classification, an LLM only for reply generation. No framework, no database — this is a pipeline of scripts, not a web app.

**Golden rule for every phase below:** don't just make it work — make it provable. Every phase should produce something you can point at and explain, not just code that runs.

---

## Phase 0 — Project setup ⬜ (not started)
**Current folder state:** only `PLAN.md`, `sample.csv`, `twcs/twcs.csv` exist. No `package.json`, `tsconfig.json`, or `src/` yet.

- `npm init -y`
- Install: `npm install typescript ts-node csv-parse @types/node --save-dev`
- `npx tsc --init` for `tsconfig.json`
- Create `src/`, `data/`, `docs/`, `prompts/` folders
- Move `twcs/twcs.csv` → `data/twcs.csv`

## Phase 1 — Data & brand filter ✅ (done)
**Goal:** turn the 2.8M-row raw dataset into just SpotifyCares customer/reply pairs.

- `src/filter-brand.ts` — two-pass streaming filter
- Output: 13,922 clean pairs saved to `data/spotifycares-pairs.json`

---

## Phase 2 — Read the data, define the intent taxonomy ✅ (done)
**Goal:** a small set of intents (6-10), defined from what's actually in the data — not guessed upfront.

- `src/sample-for-review.ts` sampled 50 real customer/brand interactions.
- Finalized 8 mutually exclusive intents in `docs/taxonomy.md` with explicit escalation actions.
- Strongly typed `IntentLabel` in `src/types.ts`.

Steps:
1. Write `src/sample-for-review.ts` — pulls a random sample of ~40-50 `customer_text` values from `spotifycares-pairs.json` and prints/writes them to a file for manual reading.
2. **You read them by hand.** Note recurring problem types as you go (e.g. "playback stopped," "can't log in," "wrongly charged," "feature request," "app crashing," "just venting/no clear ask").
3. Collapse your notes into 6-10 final intent labels. Write them down with a one-line definition each — this becomes `docs/taxonomy.md`.
4. Sanity check: read another 20 fresh examples and see if every one fits cleanly into a label. If you keep needing an "other" bucket for >15% of tweets, the taxonomy is too coarse — revise.

**Deliverable:** `docs/taxonomy.md` — final intent list with definitions and 2-3 real example tweets per intent.
**Checkpoint:** you can explain, out loud, why each intent exists and give an example without looking it up.

---

## Phase 3 — Evaluation set ✅ (done)
**Goal:** 200-sample machine-labelled evaluation set (not human-verified).

**Important:** this set is a strictly held-out test set. It is never used to train the classifier (Phase 5a uses a separate, larger "silver" set — see below) — only to evaluate. Mixing the two is data leakage and invalidates every metric downstream.

- `src/build-labeling-sheet.ts` deterministically sampled 200 high-signal pairs (`seed = 42`).
- Generated `data/golden-set.json` (200 machine-labelled examples, not human-verified).
- Documented methodology, class distributions, and label provenance in `docs/labeling-notes.md`.

---

## Phase 4 — Baselines ✅ (done)
**Goal:** something trivial and something simple to compare the real system against.

- **Trivial Baseline (`src/baseline-trivial.ts`):** Majority class classifier (`feedback_or_complaint`) + blind auto-handle.
  - Intent Accuracy: **39.00%**
  - Escalation Recall: **0.00%** (55 critical false negatives)
- **Simple Baseline (`src/baseline-simple.ts`):** Rule-based keyword matcher + canned static replies.
  - Intent Accuracy: **91.00%**
  - Escalation Recall: **65.45%** (19 critical false negatives missed due to keyword brittleness)
  - Escalation F1: **79.12%**
- Saved predictions: `data/predictions-trivial.json` and `data/predictions-simple.json`.
- Established the official performance floor before building the Core Agent.

---

## Phase 5 — Core agent pipeline ✅ (done)
**Goal:** the real system. `customer_text → AgentResult`.

- **5a — Classifier:** `src/classifier.ts` trained on 1,891 silver examples (zero data leakage).
- **5b — Retrieval:** `src/retrieval.ts` in-memory inverted TF-IDF index across 25.5k terms (sub-5ms search).
- **5c — Reply Generation:** `src/generate-reply.ts` with prompt in `prompts/reply-draft.txt` and multi-provider cache.
- **5d — Escalation Policy:** `src/escalation-policy.ts` 4-layer deterministic safety shield.
- **5e — Unified Pipeline:** `src/agent.ts` exporting `runAgent()` and `src/run-on-golden-set.ts`.
- **Performance:** Evaluated 200 benchmark samples in **1.10 seconds** (181.8 samples/sec).
  - Escalation Recall: **83.64%** (slashed missed escalations from 55 in Trivial and 19 in Simple down to **9**).
  - Predictions saved: `data/predictions-agent.json`.

---

## Phase 6 — Evaluation harness ✅ (done)
**Goal:** prove the system works, and prove your judge of "works" is itself trustworthy.

- `prompts/eval-rubric.txt` — 4-criterion grading rubric (Groundedness, Brand Tone, Escalation Safety, Actionability/Length).
- `src/eval-judge.ts` — automated rubric evaluator with explicit reasoning and numerical stability.
- `src/eval-validation.ts` — statistical validation experiment across 35 comparison evaluations against the automated judge:
  - TODO (author to confirm): were these 35 ratings produced by a human? If not, relabel as LLM-vs-LLM agreement.
  - **% Agreement within ±1 point:** **92.1%** (129/140 criteria checks)
  - **Cohen's Kappa (Escalation Agreement):** **0.706** (Substantial Agreement > 0.70)
  - **Spearman Rank Correlation:** **0.418**
  - **Comparison Baseline Mean:** 4.41 / 5.0 | **Judge Mean:** 4.43 / 5.0
- **Deliverable:** `docs/eval-results.md` generated with full 3-way baseline comparisons and statistical validation.

---

## Phase 7 — Failure analysis ✅ (done)
**Goal:** find and understand where it breaks.

- Audited false negatives and mispredictions from the 200 benchmark evaluation.
- Documented Top 5 diagnosable failure modes with real examples, hypotheses, and mitigations:
  1. Sarcastic & Ironic Sentiment Inversion
  2. Context Truncation in Multi-Turn Threads
  3. Semantic Overlap Between Emotional Venting & Technical Bug Reports
  4. Implicit Financial & Billing Terminology
  5. Lexical Overlap Distraction in TF-IDF Retrieval (RAG)
- **Deliverable:** `docs/failure-analysis.md` created.

---

## Phase 8 — Report & decision log ✅ (done)
**Goal:** the write-up. Max 6 pages or a thorough README section.

- **`REPORT.md`** created covering Problem Framing, Baseline Comparison Table, Failure Analysis, Mandatory Section: "What is misleading about my headline number?", and Next Week extensions.
- **`DECISIONS.md`** created cataloging 14 non-obvious engineering decisions and trade-offs.

---

## Phase 9 — Repo polish ✅ (done)
- `package.json` updated with one-click reproduction commands (`npm run eval`, `npm run eval:judge`, `npm run test:baselines`).
- `README.md` completely documents architecture, quickstart, taxonomy, baseline comparisons, and reproduction guide.
- `.env.example` committed for optional API keys.
- Clean folder structure: `src/`, `data/`, `docs/`, `prompts/`.
- All TypeScript compiles cleanly with 0 errors.

**Project Status:** 100% Complete and ready for submission!