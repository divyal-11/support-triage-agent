# Support Triage Agent — Project Context & Handoff Summary

> **Date:** October 31, 2026  
> **Repository:** `https://github.com/divyal-11/support-triage-agent` (Branch: `main`)  
> **Workspace Path:** `C:\Users\divya\Projects\support-triage-agent`  
> **Target Audience:** Claude / Next AI Assistant / Reviewer

---

## 1. Executive Summary & Purpose

This repository contains the take-home assignment for the **Hiver SDE Intern** role. 
The core objective is to turn a noisy, real-world customer support dataset into a reliable, provable AI customer support triage agent for **@SpotifyCares** on Twitter, and demonstrate empirical proof that the agent is trustworthy enough to deploy.

The assignment emphasizes **proof and rigor over blind complexity**:
> *"The proof is worth more than the system."*  
> *"We will ask you to explain and modify your own code live."*  
> *The candidate writes the code themselves step-by-step to maintain 100% code ownership and comprehension.*

---

## 2. Assignment Requirements & Deliverables

### The 3 Core Agent Capabilities
For incoming customer tweets directed at the selected brand (`@SpotifyCares`):
1. **Intent Classification:** Classify the incoming message into a small, data-derived intent taxonomy (6–10 intents).
2. **Grounded Reply Drafting:** Draft a reply strictly grounded in how Spotify has historically resolved similar issues.
3. **Escalation Decision:** Decide whether the message should be auto-handled or escalated to a human agent, providing an explicit, stated reason.

### The 5 Required Deliverables
1. **Runnable Pipeline:** A clean repo with a `README.md` allowing reviewers to reproduce headline results in **under 15 minutes**.
2. **Golden Evaluation Set:** 150–250 hand-labelled examples with a note explaining sampling and labelling methodology.
3. **Evaluation Harness:** Automated metrics + LLM-as-judge rubric for reply quality, including statistical evidence of how well the judge agrees with human evaluation.
4. **Report (max 6 pages or README section):**
   - Problem framing (what "good" means for this brand, what was deliberately not built).
   - Results vs. at least two baselines (one trivial, one simple).
   - Failure analysis: top 5 failure modes with real examples and diagnostic hypotheses.
   - **"What is misleading about my headline number?"** *(Mandatory section)*.
   - What would be built next with one additional week.
5. **Decision Log:** A bulleted list of 10–15 non-obvious engineering and product decisions and the reasoning behind each.

---

## 3. Key Architectural Decisions & Safeguards

### A. Brand Choice: `@SpotifyCares`
- High volume in the Kaggle Twitter customer support dataset.
- Clear technical (playback, app crashes, offline sync) vs. account/billing (subscription charges, family plan, login) issue boundaries.
- Consistent historical response patterns (troubleshooting steps vs. routing to DMs for account security).

### B. Prevention of Data Leakage (Crucial ML Principle)
- The **Golden Set (150–250 hand-labelled examples) is strictly a held-out test set**.
- **No models are trained on the golden set.**
- For the intent classifier (TF-IDF + Logistic Regression):
  - A **Silver Set** of ~500–1000 examples will be generated via heuristic/weak supervision from the broader corpus.
  - The model trains on the silver set and is tested *only* against the golden set. The noise in the silver set is documented as an honest caveat in the report.

### C. The < 15-Minute Reproduction Guarantee
- Sequential LLM calls for 200 items would blow the 15-minute review window, risk timeouts, and burn API quota.
- Pipeline incorporates:
  - **Async concurrency pool** (~5–10 concurrent requests).
  - **Persistent local response cache** (`data/cache/`) keyed by input hash.
  - **Shipped precomputed cache:** Running `npm run eval` reproduces headline benchmark tables in seconds; passing `--live 20` lets reviewers verify live LLM generation on a 20-sample slice.

### D. Rigorous Judge-Human Agreement Metrics
Instead of vague qualitative agreement, the evaluation harness calculates:
- **Cohen's Kappa:** For categorical decisions (auto-handle vs. escalate).
- **Spearman Rank Correlation & % Within ±1:** For 1–5 rubric quality scores.

---

## 4. Current Workspace & Repository State

### Git & Remote
- Git is initialized, branch is `main`.
- Remote: `https://github.com/divyal-11/support-triage-agent.git`.
- Initial commit `d078470` pushed with basic configs and `PLAN.md`.
- Working tree is clean.

### Environment & Dependencies
- **Node.js** with **TypeScript** (`tsconfig.json` target `ES2022`, module `commonjs`).
- Runtime dependencies: `csv-parse`, `dotenv`.
- Dev dependencies: `typescript`, `ts-node`, `@types/node`.
- Configuration files present: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`.

### Files & Directory Layout
```
support-triage-agent/
├── .git/
├── .gitignore               # Ignores node_modules/, data/twcs.csv, twcs/, data/cache/, .env
├── package.json
├── package-lock.json
├── tsconfig.json
├── PLAN.md                  # Detailed master execution plan
├── sample.csv               # Kaggle sample extract (reference)
├── prompts/                 # (Created, currently empty)
├── docs/                    # (Created, currently empty)
├── data/
│   └── twcs.csv             # Kaggle Twitter customer support CSV (189.7 MB, ~1.16M rows)
└── src/                     # (Created, currently empty)
```

---

## 5. Phase-by-Phase Roadmap

| Phase | Description | Status | Deliverables |
|---|---|---|---|
| **Phase 0** | Project setup & tooling | **COMPLETED** | Repo, tsconfig, packages, git remote, data moved |
| **Phase 1** | Streaming brand filter for `@SpotifyCares` | **NEXT UP** | `src/filter-brand.ts` → `data/spotifycares-pairs.json` |
| **Phase 2** | Exploratory review & taxonomy definition | Pending | `src/sample-for-review.ts` → `docs/taxonomy.md` (6–10 intents) |
| **Phase 3** | Golden evaluation set creation | Pending | `src/build-labeling-sheet.ts` → `data/golden-set.json` (150–250 hand-labelled) |
| **Phase 4** | Baselines (Trivial + Simple) | Pending | `src/baseline-trivial.ts`, `src/baseline-simple.ts` |
| **Phase 5** | Core Agent Pipeline | Pending | `src/classifier.ts`, `src/retrieval.ts`, `src/generate-reply.ts`, `src/escalation-policy.ts`, `src/agent.ts` |
| **Phase 6** | Evaluation harness & LLM judge | Pending | `src/eval-metrics.ts`, `src/eval-judge.ts` → `docs/eval-results.md` |
| **Phase 7** | Failure analysis | Pending | `docs/failure-analysis.md` (Top 5 failure modes) |
| **Phase 8** | Report & Decision log | Pending | `REPORT.md`, `DECISIONS.md` |
| **Phase 9** | Reproduction polish & README | Pending | `README.md`, verified `<15 min` run |

---

## 6. Immediate Next Step: Phase 1 Implementation Guide

### Task: Build `src/filter-brand.ts`
The goal of Phase 1 is to filter the raw 189 MB `data/twcs.csv` into a structured array of matched customer-tweet / brand-reply pairs saved to `data/spotifycares-pairs.json`.

#### Data Schema in `data/twcs.csv`:
- `tweet_id`: unique tweet ID
- `author_id`: e.g., "SpotifyCares" or numeric user ID
- `inbound`: "TRUE" (customer to brand) or "FALSE" (brand to customer)
- `created_at`: date timestamp
- `text`: tweet body
- `response_tweet_id`: tweet ID of response
- `in_response_to_tweet_id`: tweet ID that this tweet replies to

#### Two-Pass Streaming Architecture (Memory Safe)
Loading the full CSV into memory crashes Node.js heap. Instead, use a two-pass stream:
1. **Pass 1:** Stream `data/twcs.csv`. Find rows where `author_id.toLowerCase() === "spotifycares"` and `inbound.toUpperCase() === "FALSE"` and `in_response_to_tweet_id` exists. Store in a lightweight Map: `Map<parentTweetId, { brand_reply_id, brand_reply_text, created_at }>`. (This map contains only a few thousand entries and easily fits in memory).
2. **Pass 2:** Stream `data/twcs.csv` again. For any row where `tweet_id` exists in the Map and `inbound.toUpperCase() === "TRUE"`, combine the customer query with the stored brand reply:
```ts
export type ConversationPair = {
  customer_tweet_id: string;
  customer_text: string;
  brand_reply_id: string;
  brand_reply_text: string;
  created_at: string;
};
```
3. Save to `data/spotifycares-pairs.json` and log the total number of matched pairs.

#### Verification Command
```powershell
npx ts-node src/filter-brand.ts
```
Expected output: A few thousand valid conversation pairs written to `data/spotifycares-pairs.json`.

---

## 7. Working Principles for AI Assistant (Guidance for Claude)
- **Do not write the whole codebase in one go:** Guide the candidate step-by-step. Explain the purpose, architecture, and edge cases, and let the candidate code and execute.
- **Always keep the Hiver evaluation criteria top-of-mind:** Every step must contribute to the five deliverables, honest baselines, and empirical trustworthiness.
- **Maintain git hygiene:** After completing each phase, commit with conventional commit messages so the repository history is clean and auditable.

