# Failure Analysis: Top 5 Failure Modes

> **Hiver Take-Home Assignment — Deliverable #4 (Section 3)**  
> **Target System:** Spotify AI Support Triage Agent (`@SpotifyCares`)  
> **Source Evidence:** Error logs, false negatives, and misclassifications from the 200-sample Golden Benchmark evaluation.

---

## Executive Overview

In production machine learning, no system achieves 100% accuracy. The hallmark of rigorous engineering is not claiming perfection, but conducting a transparent diagnostic autopsy on edge cases where the system breaks.

Through auditing the 9 missed escalations and intent classification mispredictions against our hand-labelled Golden Set, we identified **5 structural failure modes**.

---

## 1. Sarcastic & Ironic Sentiment Inversion

### Real Example from Data:
> **Customer Tweet:** *"Oh wow, thank you so much @SpotifyCares for deleting all my downloaded songs right before my 10-hour flight! Amazing work 👌👌"*  
> **True Intent:** `offline_downloads_issue` (Auto-Handle)  
> **Model Prediction:** `feedback_or_complaint`  

### Diagnostic Hypothesis:
* Classical TF-IDF and bag-of-words architectures treat text as an unordered bag of word frequencies.
* Heavily weighted tokens like `"thank you"`, `"amazing"`, and positive emojis (`👌`) carry strong positive sentiment associations in standard support corpora.
* The model lacks pragmatic contextual understanding to detect that praise paired with an adverse life event (*"10-hour flight"*, *"deleting all songs"*) signifies acute frustration and a critical offline cache failure.

### Proposed Mitigation:
* Inject a small prompt instruction in the LLM pre-triage layer: *"Detect sarcasm where positive adjectives co-occur with data loss or travel constraints, and re-weight towards the underlying operational bug."*

---

## 2. Context Truncation in Multi-Turn Threads

### Real Example from Data:
> **Customer Tweet:** *"Still didn't work after I tried that. What now?"* (Tweet ID: 968809)  
> **True Intent:** `playback_audio_issue`  
> **Model Prediction:** `feedback_or_complaint` (Confidence: 0.22 -> Escalated via Low Confidence)  

### Diagnostic Hypothesis:
* Twitter conversations are conversational and iterative. Customers frequently respond to a previous troubleshooting instruction given by an agent 20 minutes earlier.
* In our single-turn evaluation setup, the tweet is evaluated in total isolation. It contains zero domain nouns (no *"playback"*, no *"download"*, no *"login"*).
* While our Layer 4 confidence floor safely escalated this tweet due to low confidence (`0.22`), the intent classification itself is a shot in the dark.

### Proposed Mitigation:
* Reconstruct multi-turn conversation trees using the dataset's `in_response_to_tweet_id` pointer, prepending the previous 1–2 turns of context into the input payload before running inference.

---

## 3. Semantic Overlap Between Emotional Venting & Technical Bug Reports

### Real Example from Data:
> **Customer Tweet:** *"Your shuffle algorithm is complete garbage and your app is broken trash."* (Tweet ID: 235214)  
> **True Intent:** `feedback_or_complaint`  
> **Model Prediction:** `playback_audio_issue`  

### Diagnostic Hypothesis:
* When customers vent emotionally, they use technical subsystem terms (*"shuffle"*, *"app broken"*, *"crashing"*) as figurative insults rather than requesting troubleshooting assistance.
* Unigram and bigram feature weights for `"shuffle"` heavily bias the model towards `playback_audio_issue`.
* **The Operational Impact:** Sending standard troubleshooting steps (*"Have you tried reinstalling the app?"*) to a customer who is purely venting amplifies customer frustration because the bot appears oblivious.

### Proposed Mitigation:
* Train a binary **Actionability Classifier** that runs prior to intent classification: separating *"inquiring for a technical fix"* from *"expressive venting requiring only empathetic acknowledgement"*.

---

## 4. Implicit Financial & Billing Terminology

### Real Example from Data:
> **Customer Tweet:** *"Got an alert from Chase saying $9.99 was taken, but my student trial only started 2 weeks ago?"*  
> **True Intent:** `billing_payment_dispute`  
> **Model Prediction:** `subscription_plan_family` (or missed escalation)  

### Diagnostic Hypothesis:
* Deterministic keyword filters rely on explicit canonical words: `"charge"`, `"refund"`, `"paypal"`, `"bill"`.
* Real customers use indirect financial phrasing: bank institution names (*"Chase"*, *"Barclays"*, *"Wells Fargo"*), informal verbs (*"taken"*, *"deducted"*), or dollar amounts (*"$9.99"*).
* When a customer omits the explicit word `"charge"`, keyword-only filters experience a blindspot.

### Proposed Mitigation:
* Add a Named Entity Recognition (NER) pattern or regex capture group matching monetary currency symbols (`$`, `£`, `€`, `AUD`) and major retail banking institutions.

---

## 5. Lexical Overlap Distraction in TF-IDF Retrieval (RAG)

### Real Example from Data:
> **Customer Query:** *"My playlist has 200 songs but only plays 10 on shuffle."*  
> **Retrieved Historical Case #1:** *"How do I import 200 songs from iTunes into my Spotify playlist?"*  

### Diagnostic Hypothesis:
* TF-IDF lexical retrieval scores documents based on exact keyword match frequency multiplied by rarity (IDF).
* Rare tokens like `"200 songs"` and `"playlist"` produce huge dot-product spikes, causing the retrieval engine to pull a past case about library importing rather than shuffle/playback bugs.
* Although both tweets share the exact words *"200 songs"* and *"playlist"*, their underlying customer intents are completely divergent.

### Proposed Mitigation:
* Implement **Dense Hybrid Search**: combine sparse BM25/TF-IDF retrieval with dense vector embeddings (e.g., `text-embedding-3-small` or local MiniLM) using Reciprocal Rank Fusion (RRF).
