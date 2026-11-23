# Evaluation Harness & Judge Validation Report

> **Evaluator:** Agreement Analysis (Comparison Ratings vs. Automated LLM-as-a-Judge)

---

## 1. Executive Summary

An agreement experiment was run across **35 conversation samples** drawn from the 200-sample evaluation set.

TODO (author to confirm): were these 35 ratings produced by a human? If not, relabel as LLM-vs-LLM agreement.

The automated LLM judge scored each drafted reply across 4 dimensions:
1. Groundedness & Relevance (1–5)
2. Brand Voice & Tone (1–5)
3. Escalation Safety (1–5)
4. Actionability & Length (1–5)

---

## 2. Agreement Results (35 Samples)

TODO (author to confirm): were these 35 ratings produced by a human? If not, relabel as LLM-vs-LLM agreement.

| Metric | Observed Value | Industry Reference |
|---|---|---|
| **% Agreement within ±1 point** | **92.1%** | > 80.0% |
| **Cohen's Kappa (Escalation)** | **0.706** | > 0.700 |
| **Spearman Rank Correlation** | **0.418** | > 0.600 |
| **Comparison Baseline Mean Score** | **4.41 / 5.0** | - |
| **Judge Mean Score** | **4.43 / 5.0** | - |

Measured against machine-generated labels; not human-verified.

---

## 3. 3-Way Baseline Comparison Table

| Metric | Trivial Baseline | Simple Keyword Baseline | Support Triage Agent (Ours) |
|---|---|---|---|
| **Intent Accuracy** | 39.00% | 91.00% | 55.00% |
| **Escalation Recall** | **0.00%** | **65.45%** | **83.64%** |
| **Escalation Precision** | 0.00% | 100.00% | **74.19%** |
| **Critical Missed Escalations (False Negatives)** | **55** | **19** | **9** |
| **Reply Grounding** | Static 1-sentence | Static canned template | Inverted TF-IDF RAG |
| **Execution Latency (200 samples)** | < 1 sec | < 1 sec | 1.10 seconds |

Measured against machine-generated labels; not human-verified.

---

## 4. Observations & Limitations

1. **Label Provenance Limitation:** All metrics above are measured against a machine-labelled evaluation set (not human-verified). The intent accuracy of the simple keyword baseline (91%) is likely inflated because the evaluation labels were produced by similar rule-based logic.
2. **Judge Leniency:** The judge exhibits leniency towards replies ending with `/Spotify` even if troubleshooting advice is somewhat generic.
