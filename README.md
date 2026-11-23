# Spotify Support AI Triage Agent 🎧🤖

> An empirical, trustworthy AI support triage agent for **`@SpotifyCares`** on Twitter.  
> Built for the **Hiver SDE Intern** take-home assignment.  
> *"The proof is worth more than the system."*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%7C%20Node%2022+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Reproducible](https://img.shields.io/badge/Reproducibility-%3C%2015%20minutes-brightgreen)](#-quickstart--reproduction-in--15-minutes)

---

## 📌 Executive Summary

Real-world customer support inboxes receive thousands of ambiguous, angry, and technical queries every day. This repository builds a production-grade AI support triage pipeline that processes incoming customer tweets for Spotify, performs **3 core actions**, and mathematically proves whether the agent is safe enough to trust:

1. **Classifies Customer Intent:** Maps messages into an empirically derived 8-class taxonomy grounded in real Twitter data.
2. **Drafts Grounded Replies (RAG):** Uses an in-memory inverted TF-IDF index across **13,922 historical Spotify conversations** to retrieve similar resolved cases and ground replies in Spotify's authentic troubleshooting steps and brand voice.
3. **Makes Explicit Escalation Decisions:** Enforces a deterministic safety policy deciding whether a message can be safely **auto-handled** or must be **escalated to a human agent** (with stated justifications for billing/security risks).

---

## 🏗️ Architecture & Pipeline Flow

```
Incoming Customer Tweet: "@SpotifyCares my music stops playing when my screen turns off!"
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
1. Intent Classifier             2. Historical Retrieval (RAG)
   (TF-IDF + Multinomial Model)     (Inverted TF-IDF Index over 13,922 tweets)
   -> "playback_audio_issue"        -> Retrieves 2-3 similar past resolutions:
      (Confidence: 89.4%)              "Check background app refresh in iOS settings..."
         │                               │
         └───────────────┬───────────────┘
                         ▼
3. Grounded Reply Drafting (LLM / RAG)
   Prompt LLM with: Customer query + Retrieved Spotify solutions
   -> "Hi there! Let's get this sorted. Try heading to iOS Settings > Battery..."
                         │
                         ▼
4. Safety Escalation Policy (Deterministic Rules)
   Checks: Confidence threshold, financial charge risk, credential safety
   -> Decision: "Auto-handle (Standard technical troubleshooting applies)"
                         │
                         ▼
Unified AgentResult { intent, confidence, retrieved_examples, drafted_reply, should_escalate, escalate_reason }
```

---

## ⚡ Quickstart & Reproduction (Under 5 Minutes)

No external databases, Docker containers, or Python environments required. Everything runs 100% natively in TypeScript:

### 1. Clone & Install
```bash
git clone https://github.com/divyal-11/support-triage-agent.git
cd support-triage-agent
npm install
```

### 2. Run the Benchmark Baselines
Evaluate the Trivial and Simple baselines against the 200-sample machine-labelled evaluation set (not human-verified):
```bash
# Trivial Baseline (Majority Class Predictor)
npx tsx src/baseline-trivial.ts

# Simple Baseline (Rule-Based Keyword Matcher + Canned Responses)
npx tsx src/baseline-simple.ts
```

### 3. Run the Statistical Intent Classifier
Train on 1,891 weakly supervised silver examples and evaluate on the strictly held-out 200-sample machine-labelled evaluation set:
```bash
npx tsx src/classifier.ts
```

### 4. Run the Sub-5ms Retrieval Engine
Test historical retrieval (RAG) across real customer scenarios:
```bash
npx tsx src/retrieval.ts
```

---

## 📊 The 8-Class Intent Taxonomy

Derived empirically from reading real customer conversations in `data/spotifycares-pairs.json` (documented in [`docs/taxonomy.md`](docs/taxonomy.md)):

| Intent Label | Description | Default Action | Escalation Justification |
|---|---|---|---|
| `playback_audio_issue` | Pausing, skipping, shuffle/repeat broken, audio bugs | **Auto-Handle** | Self-serve troubleshooting (restart, clear cache, reinstall) |
| `offline_downloads_issue` | Downloaded tracks deleted, greyed out, offline playback fail | **Auto-Handle** | Storage & SD card permissions guide |
| `app_crash_performance` | App freezing, crashing on launch, battery overheating | **Auto-Handle** | OS/build version diagnostics |
| `content_catalog_request` | Missing songs, artist availability, clean vs. explicit | **Auto-Handle** | Music licensing rights explanation |
| `billing_payment_dispute` | Charged after cancel, double charges, student discount | **Escalate to Human** | Financial transaction requiring private account lookup |
| `account_access_security` | Password reset errors, CSRF tokens, hacked/compromised | **Escalate to Human** | Sensitive user credentials & identity verification |
| `subscription_plan_family` | Family members showing as "Free", invite link failures | **Escalate to Human** | Multi-user address verification via private DM |
| `feedback_or_complaint` | Venting about algorithms or support delays (no technical ask) | **Auto-Handle** | Empathetic de-escalation & feedback logging |

---

## 📈 Baseline Performance Floor

Every AI system must prove it is better than non-AI heuristics. We evaluated our two baselines against the **200-sample machine-labelled evaluation set (not human-verified)** ([`data/golden-set.json`](data/golden-set.json)):

| Metric | Trivial Baseline (Majority Class) | Simple Baseline (Keyword Matcher) | Standalone Classifier (Phase 5a) |
|---|---|---|---|
| **Intent Accuracy** | **39.00%** (78/200) | **91.00%** (182/200) | **57.00%** (Held-out zero leakage) |
| **Escalation Precision** | 0.00% | 100.00% | *Evaluating in Phase 5d* |
| **Escalation Recall** | **0.00%** | **65.45%** | *Evaluating in Phase 5d* |
| **Critical Missed Escalations (FN)** | **55** 🚨 | **19** ⚠️ | *Evaluating in Phase 5d* |
| **Reply Grounding** | Static single sentence | Canned category template | **Dynamic Historical RAG (25.5k tokens indexed)** |

*Note: Measured against machine-generated labels; not human-verified.*

> **Key Finding:** While the Simple Baseline achieves 91% accuracy via naive keywords, its **escalation recall is dangerously low (65.45%)**, silently missing **19 critical financial and account security emergencies**.

---

## 🔬 Scientific Rigor & Engineering Decisions

1. **Strict Held-Out Evaluation Set (Zero Data Leakage):**
   * The 200 evaluation set samples are **never** used during training.
   * Training for classical models uses a **Silver Set of 1,891 examples** generated from the remaining 13,722 pairs via weak supervision (`src/build-silver-set.ts`).
2. **Sub-5ms In-Memory Retrieval Index:**
   * Instead of heavy external vector DB dependencies, `src/retrieval.ts` implements a custom in-memory inverted TF-IDF index across 25,500 distinct terms.
   * Includes `excludeTweetId` self-match suppression during evaluation.
3. **Deterministic Safety Gating:**
   * High-risk domains (passwords, credit card billing) are never left to generative LLM hallucinations; deterministic rules enforce human escalation.

---

## 📂 Repository Structure

```
support-triage-agent/
├── data/
│   ├── spotifycares-pairs.json       # 13,922 clean customer-reply pairs (5.7 MB)
│   ├── golden-set.json               # 200 machine-labelled evaluation set (not human-verified)
│   ├── silver-set.json               # 1,891 weakly supervised training examples
│   ├── classifier-model.json         # Serialized TF-IDF model weights (1.5 MB)
│   ├── predictions-trivial.json      # Output predictions from Trivial baseline
│   └── predictions-simple.json       # Output predictions from Simple baseline
├── docs/
│   ├── taxonomy.md                   # Formal 8-intent taxonomy & escalation matrix
│   ├── labeling-notes.md             # Sampling methodology & disambiguation rules
│   └── sample-tweets.txt             # 50 exploratory sample tweets
├── src/
│   ├── types.ts                      # Central TypeScript data contracts & interfaces
│   ├── filter-brand.ts               # Phase 1: Two-pass streaming brand extractor
│   ├── sample-for-review.ts          # Phase 2: Exploratory tweet sampler
│   ├── build-labeling-sheet.ts       # Phase 3: Seeded pseudo-random benchmark sampler
│   ├── generate-golden-set.ts        # Phase 3: Golden evaluation generator
│   ├── baseline-trivial.ts           # Phase 4: Majority class baseline
│   ├── baseline-simple.ts            # Phase 4: Keyword matcher baseline
│   ├── build-silver-set.ts           # Phase 5a: Zero-leakage silver training set builder
│   ├── classifier.ts                 # Phase 5a: Statistical NLP intent classifier
│   ├── retrieval.ts                  # Phase 5b: Sub-5ms inverted TF-IDF retrieval (RAG)
│   └── utils/
│       ├── data-loader.ts            # Memory-safe CSV/JSON data loader
│       └── metrics.ts                # Precision, Recall, F1, Confusion Matrix harness
├── PLAN.md                           # Master implementation roadmap
├── package.json
└── tsconfig.json
```

---

## 📜 License
MIT License. Dataset sourced from Kaggle (`thoughtvector/customer-support-on-twitter`).
