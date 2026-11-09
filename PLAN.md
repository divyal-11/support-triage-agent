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

## Phase 5 — Core agent pipeline
**Goal:** the real system. `customer_text → AgentResult`.

```ts
type AgentResult = {
  intent: string;
  confidence: number;
  retrieved_examples: { customer_text: string; brand_reply_text: string }[];
  drafted_reply: string;
  should_escalate: boolean;
  escalation_reason: string;
};
```

Sub-phases (build and test each independently before wiring together):

**5a — Intent classifier.** Do NOT train on the golden set — that's the held-out test set (Phase 3). Instead:
   1. `src/build-silver-set.ts` — apply heuristic/keyword rules (an extension of the Phase 4 simple baseline's logic) across the full `spotifycares-pairs.json` corpus (excluding golden-set examples) to weakly label ~500-1000 examples per intent bucket. This is noisy on purpose — weak supervision trades label quality for volume.
   2. `src/classifier.ts` — TF-IDF vectorizer + Logistic Regression trained on the silver set.
   3. Evaluate *only* on the golden set (Phase 6). Report the silver-set label noise as a known limitation — it's a legitimate, honest caveat for the "what's misleading about my headline number" section, not something to hide.

**5b — Retrieval.** TF-IDF similarity search over the full `spotifycares-pairs.json` corpus (not just the golden set) — given a new customer tweet, return the 2-3 most similar past cases and their actual replies. `src/retrieval.ts`.

**5c — Reply generation.** Prompt an LLM with the customer's tweet + the 2-3 retrieved similar cases, ask it to draft a reply in Spotify's voice grounded in those examples. `src/generate-reply.ts`. Keep the prompt itself in a version-controlled file (`prompts/reply-draft.txt`), not inline in code — you'll want to iterate on it and cite it in your decision log.

**5d — Escalation policy.** Deterministic rule, e.g.: escalate if `confidence < 0.6`, OR `intent` is one of a defined high-risk set (billing disputes, account security), OR the retrieved examples' historical replies show the brand itself escalated similar cases. Write the actual thresholds down with reasoning — this is exactly what "explain and modify your own code live" will probe. `src/escalation-policy.ts`.

**5e — Wire it together.** `src/agent.ts` exporting one function: `runAgent(customerText: string): Promise<AgentResult>`.

**Deliverable:** `runAgent` works end-to-end on a single tweet, and a script `src/run-on-golden-set.ts` that runs it on all golden-set examples and saves predictions.
**Checkpoint:** you can trace one example through all 4 steps by hand and explain each intermediate output.

---

## Phase 6 — Evaluation harness
**Goal:** prove the system works, and prove your judge of "works" is itself trustworthy.

1. **Automated metrics** — `src/eval-metrics.ts`: intent accuracy/F1 against golden set, escalation precision/recall (does it escalate what a human would escalate), retrieval relevance (rough measure — e.g. does retrieved case share the same true intent).
2. **LLM-as-judge rubric** — `src/eval-judge.ts`: prompt an LLM to score each drafted reply on a rubric (grounded in retrieved facts? correct tone? actually addresses the specific issue? appropriate escalation decision?). Score 1-5 per criterion with justification.
3. **Judge validation** — take ~30-40 golden-set examples, score them yourself by hand on the same rubric, then compare to the judge's scores using named metrics, not "roughly agrees":
   - Escalation (categorical, auto vs escalate): **Cohen's Kappa**
   - Rubric scores (1-5 scale): **Spearman correlation** and **% agreement within ±1**
   If agreement is weak, say so and note it as a limitation — don't fudge this.
4. **Baseline comparison** — run the same metrics + judge on both baselines from Phase 4 and the real system from Phase 5. This produces your results table.
5. **Make this reproducible in under 15 minutes.** LLM generation + judging on 150-250 sequential examples will blow the time budget (and possibly rate limits/cost) for whoever's grading this. Build:
   - Concurrency with a request cap (~5-10 in flight at once), not a sequential loop
   - A response cache (`data/cache/`) keyed by input hash — reruns skip already-drafted/judged examples unless a `--force` flag is passed
   - Ship the repo with a **precomputed cache** so `npm run eval` reproduces the headline tables in seconds; add `npm run eval -- --live 20` for the evaluator to verify live generation on a small slice if they want to confirm it isn't faked

**Deliverable:** `docs/eval-results.md` with the comparison table + judge-agreement numbers (Kappa + Spearman/±1).
**Checkpoint:** you can explain exactly what the judge is checking for, why you trust (or don't fully trust) its scores, and why the repo reproduces fast without hiding what's actually being computed.

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