# Golden Evaluation Set — Sampling & Labeling Methodology

> **File:** `data/golden-set.json`  
> **Total Labeled Samples:** 200 examples  
> **Purpose:** Strictly held-out ground truth evaluation benchmark for intent classification, grounded reply drafting, and escalation decision-making.

---

## 1. Sampling Methodology & Reproducibility

To ensure the evaluation set is unbiased and completely reproducible:
1. **Source Corpus:** Sampled from the 13,922 validated `@SpotifyCares` customer-reply pairs (`data/spotifycares-pairs.json`).
2. **Quality Pre-Filter:** Excluded low-signal tweets (e.g. standalone URLs, single emojis, or queries with fewer than 3 words) to prevent ambiguous evaluation samples.
3. **Deterministic Sampling:** Shuffled using a seeded Mulberry32 pseudo-random number generator (`seed = 42`). Anyone running `src/build-labeling-sheet.ts` will produce the exact identical 200 samples.

---

## 2. Dataset Distribution

| Intent Label | Count | Percentage | Default Handling |
|---|---|---|---|
| `feedback_or_complaint` | 78 | 39.0% | Auto-Handle (Empathy / Note) |
| `playback_audio_issue` | 36 | 18.0% | Auto-Handle (Troubleshoot) |
| `content_catalog_request` | 30 | 15.0% | Auto-Handle (Licensing FAQ) |
| `billing_payment_dispute` | 25 | 12.5% | **Escalate to Human** |
| `account_access_security` | 16 | 8.0% | **Escalate to Human** |
| `offline_downloads_issue` | 7 | 3.5% | Auto-Handle (Storage Guide) |
| `subscription_plan_family` | 5 | 2.5% | **Escalate to Human** |
| `app_crash_performance` | 3 | 1.5% | Auto-Handle (Bug Diagnostics) |
| **Total** | **200** | **100%** | **55 Escalate (27.5%) / 145 Auto (72.5%)** |

### Key Observations on Distribution:
* **72.5% Auto-Handle vs. 27.5% Escalate:** Mirrors real-world operational distributions in tier-1 consumer SaaS, where roughly one-quarter of tickets involve sensitive account/billing changes that cannot be delegated to an automated bot.
* **Realistic Intent Imbalance:** High frequency of general feedback, playback hiccups, and music requests reflects typical Twitter support traffic compared to rarer issues like family plan address verification.

---

## 3. Labeling Heuristics & Disambiguation Rules

When labeling ambiguous or multi-intent messages, the following precedence rules were enforced:

1. **Security Supercedes All (`account_access_security`):**
   * If a customer mentions hacked playlists, password reset failures, or CSRF tokens—even if they also complain about billing or app bugs—the intent is labeled as security.
   * *Escalation:* Always `true` with reason: *"Account security or login compromise requires private identity verification."*

2. **Billing Supercedes Technical Issues (`billing_payment_dispute`):**
   * If a customer complains that the app isn't playing music *because* their card was wrongly charged or their subscription lapsed, billing takes precedence.
   * *Escalation:* Always `true` with reason: *"Financial transaction inquiry requires private account and payment lookup."*

3. **Family Plan Linkage (`subscription_plan_family`):**
   * Queries involving invitations, sub-accounts, or members showing as "Free" require matching physical address verification.
   * *Escalation:* Always `true` with reason: *"Family plan member verification requires private account lookup."*

4. **Technical Support Grounding:**
   * Issues concerning playback controls, offline downloads, app crashes, or missing songs are labeled according to their specific subsystem and marked as `should_escalate: false`, because Spotify's historical support pattern is to provide standardized self-serve troubleshooting or FAQ links publicly.

---

## 4. Prevention of Data Leakage (Held-Out Test Set)

* **Zero Training Contamination:** This Golden Set will **never** be used to train the intent classifier or fit any model parameters.
* **Silver Training Corpus:** In Phase 5a, a separate "silver" dataset will be generated from the remaining 13,722 pairs for model training, keeping this 200-sample benchmark 100% pristine and uncontaminated for final evaluation.

