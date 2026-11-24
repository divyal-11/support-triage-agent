# Support Triage Agent: Technical Report

> **Role:** Take-Home Project  
> **Brand Target:** `@SpotifyCares` (Twitter / X Customer Support)  
> **Repository:** [github.com/divyal-11/support-triage-agent](https://github.com/divyal-11/support-triage-agent)  

---

## 1. Problem Framing: What "Good" Means for Spotify Support

Customer support on public social channels like X (formerly Twitter) operates under specific operational constraints:
* **High Visibility:** Errors, inappropriate tone, or security slip-ups occur in public view.
* **Character Budget:** Replies must be concise and under 280 characters.
* **Security vs. Speed:** Routine technical questions can be automated, but financial transactions (billing charges, refunds) and credentials (password resets, CSRF errors) must not be handled in public tweets.

### Operational Objectives for This Brand
1. **Safety First:** The system must not output ungrounded financial advice or attempt to resolve account takeovers publicly. When in doubt, it escalates to a human agent via private Direct Message (DM).
2. **Contextual Grounding:** Technical advice should reflect historical troubleshooting steps used by Spotify (restarting device, clearing cache, checking OS settings).
3. **Escalation Recall:** In support triage, missing a customer with a severe account or billing issue carries high operational risk, whereas routing an ambiguous technical query to a human is manageable.

### Scope Boundaries
* **No autonomous refund execution:** The agent does not have API access to issue refunds or reset passwords; its scope is triage, retrieval grounding, and routing.
* **Deterministic routing:** Escalation decisions on sensitive topics rely on explicit policy rules rather than unconstrained model outputs.
* **Local execution:** The pipeline runs in-process in TypeScript without external vector database services.

---

## 2. Experimental Results vs. Baselines

The system was evaluated against two non-AI baselines on a held-out **200-sample machine-labelled evaluation set (not human-verified)** (`data/golden-set.json`):

1. **Trivial Baseline:** Majority-class predictor (predicts `feedback_or_complaint` and auto-handles all cases).
2. **Simple Baseline:** Rule-based keyword matching with canned template replies.
3. **Support Triage Agent:** TF-IDF Intent Classifier + Inverted Index RAG (25.5k tokens) + Grounded Reply Drafting + 4-Layer Deterministic Escalation Policy.

### Baseline Comparison Table

| Evaluation Metric | Trivial Baseline | Simple Keyword Baseline | Support Triage Agent (Ours) | Operational Context |
|---|---|---|---|---|
| **Escalation Recall** | **0.00%** | **65.45%** | **83.64%** | Catches 46 of 55 machine-flagged escalations |
| **Critical Missed Escalations (FN)** | **55** | **19** | **9** | Missed escalations reduced relative to baselines |
| **Escalation Precision** | 0.00% | 100.00% | **74.19%** | More conservative routing to human agents |
| **Escalation F1-Score** | 0.00% | 79.12% | **78.63%** | Balance of recall and precision |
| **Intent Classification Accuracy** | 39.00% | 91.00% | 55.00% | Measured against machine labels (see Section 4) |
| **Reply Grounding Quality** | Static 1-sentence | Canned category text | Dynamic RAG (25.5k indexed terms) | Troubleshooting steps retrieved from past cases |
| **Execution Latency (200 samples)** | < 0.1s | < 0.1s | **1.10 seconds** | Cached in-process evaluation |

*Note: Measured against machine-generated labels; not human-verified.*

---

## 3. Failure Analysis (Top 5 Diagnosed Failure Modes)

Analysis of the 9 missed escalations and classification mismatches identified 5 primary failure patterns (detailed in `docs/failure-analysis.md`):

1. **Sarcasm and Ironic Phrasing:** Customers expressing frustration with ironic phrasing (*"Thanks for deleting my offline songs before my flight! Amazing work"*) trigger positive token matches (*"thanks"*, *"amazing"*).
2. **Context Truncation in Multi-Turn Threads:** Short follow-up replies (*"Still didn't work after I did that"*) lack noun context within a single turn.
3. **Venting vs. Technical Query Ambiguity:** Customers using technical words purely to express frustration (*"Your shuffle is complete garbage"*) can trigger technical troubleshooting rather than an acknowledgement of feedback.
4. **Implicit Financial Terminology:** Customers referencing transactions through specific banking institutions without explicit keywords (*"charge"*, *"refund"*) can bypass keyword filters.
5. **Lexical Overlap in Keyword Retrieval:** Queries sharing rare non-diagnostic terms can retrieve past cases about different topics that happen to share vocabulary.

---

## 4. "What is Misleading About My Headline Number?" (Mandatory Section)

Headline numbers without context can misrepresent actual performance. The following limitations apply to the reported metrics:

### 1. Label Provenance: Metrics Measure Agreement with Machine Labels, Not Real-World Accuracy
The 200 evaluation examples were **not hand-labelled by a human**. Their labels were generated by a heuristic script (`data/golden-set.json`, backed up in `data/golden-set.original-labels.json`). A second label set (`data/golden-set.v2.json`) was produced by an LLM/script, also with no human review.
* Consequently, every metric measured against these labels (intent accuracy, escalation precision/recall/F1, baseline comparisons) measures agreement with machine-generated labels, not true real-world accuracy.
* The intent accuracy of the simple keyword baseline (91%) is likely inflated because the evaluation labels were generated using similar rule-based heuristic logic. This shared rule structure is a likely cause of the high apparent agreement, rather than evidence of 91% real-world accuracy.

### 2. High Headline Accuracy Masked Escalation Failures in the Baseline
Although the Simple Baseline achieved 91% intent agreement against the heuristic labels, its escalation recall was 65.45%, missing 19 of the 55 machine-flagged escalation cases. In customer operations, an agent that fails to flag one-third of account access and billing disputes presents substantial operational risk regardless of high category matching.

### 3. Training Set Constraints on the Real Agent's Intent Accuracy (55%)
The statistical classifier was trained on weakly supervised silver labels (`data/silver-set.json`) with the 200 evaluation examples strictly excluded to prevent data leakage. While the model had lower agreement on broad categories like `feedback_or_complaint`, the deterministic escalation layer caught edge cases to achieve 83.64% escalation recall against the machine-labelled set.

### 4. Classifier Comparison Note (TypeScript vs. Python)
We compared the TypeScript from-scratch Naive Bayes classifier against Scikit-Learn models in Python (`python/classifier.py`):
* **Training Data:** Both models trained on `data/silver-set.json` (1,891 examples). Zero golden-set IDs were included in the training data (verified 0 overlap).
* **Test Data:** Both the TypeScript 57.0% result and the Python Scikit-Learn results (Naive Bayes: 65.0%, Logistic Regression: 78.0%, LinearSVC: 78.5%) were evaluated on the exact same test dataset: the 200 examples in `data/golden-set.json`.
* **Caveat:** All labels in both the training set (weak supervision heuristics) and the evaluation set (heuristic script) are machine-generated and not human-verified. The metrics indicate agreement between different machine-learning formulations on heuristic data rather than real-world ground truth.

### 5. Automated Judge Agreement Measures Heuristic-vs-Judge Consistency, Not Human Agreement
The 35 comparison ratings in `src/eval-validation.ts` were **not produced by a human**; they were generated by a programmatic heuristic formula. Consequently, the agreement metrics (Cohen's Kappa 0.706, % agreement within ±1 point 92.1%, Spearman correlation 0.418) reflect consistency between a deterministic rule-based scorer and the automated judge, not human ground-truth validation. In addition, the judge exhibits a leniency bias toward responses that end with `/Spotify` and maintain polite formatting, occasionally scoring generic troubleshooting advice higher than warranted.

### 6. Multi-Turn Thread State Machine Note
The multi-turn state machine (`src/conversation-state-machine.ts`) was demonstrated on one specific historical example (Tweet #968809) to illustrate loop prevention. It has not been systematically evaluated across a larger multi-turn test benchmark.

---

## 5. Potential Next Steps

1. **Human Label Verification:** Conduct a formal manual review of the evaluation set to establish genuine human ground truth.
2. **Dense Semantic Retrieval:** Complement TF-IDF cosine matching with dense vector embeddings to improve retrieval when phrasing differs from historical vocabulary.
3. **Multi-Turn Thread Reconstruction:** Trace `in_response_to_tweet_id` across prior turns to provide context for short follow-up messages.
4. **CRM Integration:** Connect the triage output to shared inbox APIs (e.g., Zendesk, Hiver) to route escalated cases directly into agent queues.
