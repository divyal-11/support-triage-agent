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

## Phase 3 — Golden evaluation set ✅ (done)
**Goal:** 150-250 hand-labelled examples — this is your ground truth for everything downstream.

**Important:** this set is a strictly held-out test set. It is never used to train the classifier (Phase 5a uses a separate, larger "silver" set — see below) — only to evaluate. Mixing the two is data leakage and invalidates every metric downstream.

- `src/build-labeling-sheet.ts` deterministically sampled 200 high-signal pairs (`seed = 42`).
- Generated official ground truth: `data/golden-set.json` (200 labeled examples).
- Documented methodology, class distributions, and disambiguation rules in `docs/labeling-notes.md`.

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
- `src/eval-validation.ts` — statistical validation experiment comparing 35 human ground-truth evaluations against the automated judge:
  - **% Agreement within ±1 point:** **92.1%** (129/140 criteria checks)
  - **Cohen's Kappa (Escalation Agreement):** **0.706** (Substantial Agreement > 0.70)
  - **Spearman Rank Correlation:** **0.418**
  - **Human Mean:** 4.41 / 5.0 | **Judge Mean:** 4.43 / 5.0
- **Deliverable:** `docs/eval-results.md` generated with full 3-way baseline comparisons and statistical validation.

---

## Phase 7 — Failure analysis
**Goal:** find and understand where it breaks.

- Pull the worst-scoring examples from Phase 6 (by metric and by judge score).
- Group them into ~5 real failure modes (e.g. "misclassifies sarcasm as positive," "retrieval pulls superficially similar but wrong-intent cases," "escalation threshold too conservative on ambiguous billing tweets").
- For each: 1-2 real examples, a hypothesis for *why* it fails, and (if easy) whether a quick fix helps.

**Deliverable:** `docs/failure-analysis.md`
**Checkpoint:** none of your failure modes are "the LLM was wrong sometimes" — they should be specific and diagnosable.

---

## Phase 8 — Report & decision log
**Goal:** the write-up. Max 6 pages or a thorough README section.

Must include (per assignment spec):
- Problem framing — what "good" means for Spotify support, what you deliberately didn't build
- Results vs. both baselines (Phase 4/6 table)
- Failure analysis (Phase 7, condensed)
- **"What's misleading about my headline number"** — be honest about small golden-set size, TF-IDF's semantic-similarity blind spot, judge-agreement caveats, dataset window cutting off some threads, etc.
- What you'd do with one more week (e.g. swap TF-IDF retrieval for embeddings, expand golden set, fine-tune classifier)

Plus a separate **decision log**: 10-15 non-obvious decisions and why (brand choice, TF-IDF+LogReg over LLM classification, deterministic escalation, generative vs extractive reply drafting, etc. — most of these you've already reasoned through in this conversation, just write them down).

**Deliverable:** `REPORT.md` + `DECISIONS.md`

---

## Phase 9 — Repo polish
- `README.md` that lets someone reproduce your headline result in under 15 minutes (clear setup steps, sample command, expected output)
- `.env.example` for any API keys, nothing secret committed
- Clean folder structure: `src/`, `data/` (gitignored — too large to commit), `docs/`, `prompts/`
- Final sanity run-through from a clean clone

**Deliverable:** ready to submit via the form, with public (or access-granted) repo link + report.