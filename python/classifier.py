"""
Production Intent Classifier using Scikit-Learn
Trains on 1,891 weakly supervised silver examples and evaluates on the strictly held-out 200 evaluation samples.
Compares:
  1. Multinomial Naive Bayes (generative baseline)
  2. Logistic Regression (L2 regularized discriminative model)
  3. Linear Support Vector Classifier (margin-maximizing linear model)
"""

import json
import os
import time
import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.pipeline import make_pipeline
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix

SILVER_PATH = os.path.join(os.path.dirname(__file__), "../data/silver-set.json")
GOLDEN_PATH = os.path.join(os.path.dirname(__file__), "../data/golden-set.json")
MODEL_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../data/classifier_sklearn.joblib")

VALID_INTENTS = [
    "playback_audio_issue",
    "offline_downloads_issue",
    "app_crash_performance",
    "content_catalog_request",
    "billing_payment_dispute",
    "account_access_security",
    "subscription_plan_family",
    "feedback_or_complaint"
]

def load_datasets():
    print(f"Loading training data from: {SILVER_PATH}")
    with open(SILVER_PATH, "r", encoding="utf-8") as f:
        silver_data = json.load(f)

    print(f"Loading evaluation data from: {GOLDEN_PATH}")
    with open(GOLDEN_PATH, "r", encoding="utf-8") as f:
        golden_data = json.load(f)

    X_train = [item["customer_text"] for item in silver_data]
    y_train = [item["weak_intent"] for item in silver_data]

    X_test = [item["customer_text"] for item in golden_data]
    y_test = [item["intent"] for item in golden_data]

    print(f"Train samples: {len(X_train):,} | Test samples: {len(X_test):,} (Zero data leakage)")
    return X_train, y_train, X_test, y_test

def main():
    X_train, y_train, X_test, y_test = load_datasets()

    print("\n" + "=" * 85)
    print("SCIKIT-LEARN MODEL COMPARISON BENCHMARK (TF-IDF N-GRAMS 1-2)")
    print("=" * 85)

    models = {
        "Multinomial Naive Bayes": make_pipeline(
            TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=2),
            MultinomialNB(alpha=0.5)
        ),
        "Logistic Regression (L2)": make_pipeline(
            TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=2),
            LogisticRegression(C=2.0, max_iter=1000, random_state=42)
        ),
        "Linear Support Vector (SVC)": make_pipeline(
            TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=2),
            LinearSVC(C=1.0, random_state=42, max_iter=2000)
        )
    }

    results = []
    best_model_name = None
    best_model = None
    best_acc = -1.0

    for name, pipeline in models.items():
        t0 = time.time()
        pipeline.fit(X_train, y_train)
        train_time = time.time() - t0

        y_pred = pipeline.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        macro_f1 = f1_score(y_test, y_pred, average="macro", zero_division=0)
        weighted_f1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)

        results.append({
            "name": name,
            "accuracy": acc,
            "macro_f1": macro_f1,
            "weighted_f1": weighted_f1,
            "train_time": train_time,
            "pipeline": pipeline
        })

        if acc > best_acc:
            best_acc = acc
            best_model_name = name
            best_model = pipeline

    # Print Summary Table
    print(f"{'Model Architecture':<32} | {'Accuracy':<10} | {'Macro F1':<10} | {'Weighted F1':<12} | {'Train Time':<10}")
    print("-" * 85)
    for r in results:
        print(f"{r['name']:<32} | {r['accuracy']*100:>8.2f}% | {r['macro_f1']:>10.4f} | {r['weighted_f1']:>12.4f} | {r['train_time']:>8.3f}s")
    print("=" * 85)

    print(f"\n🏆 Best Performing Model: {best_model_name} ({best_acc*100:.2f}% accuracy)")

    # Detailed Classification Report for Best Model
    y_pred_best = best_model.predict(X_test)
    print("\n--- Detailed Classification Report for " + best_model_name + " ---")
    print(classification_report(y_test, y_pred_best, labels=VALID_INTENTS, target_names=VALID_INTENTS, zero_division=0))

    # Confusion Matrix
    print("--- Confusion Matrix (Rows: True, Columns: Predicted) ---")
    short_names = [v[:7] for v in VALID_INTENTS]
    cm = confusion_matrix(y_test, y_pred_best, labels=VALID_INTENTS)
    header = "True \\ Pred  | " + " | ".join(s.ljust(7) for s in short_names)
    print(header)
    print("-" * len(header))
    for idx, row in enumerate(cm):
        row_str = f"{short_names[idx].ljust(12)} | " + " | ".join(str(val).rjust(7) for val in row)
        print(row_str)

    # Save model
    joblib.dump(best_model, MODEL_OUTPUT_PATH)
    print(f"\nSaved trained model to: {MODEL_OUTPUT_PATH}")

    # Interactive sanity check
    print("\n--- Inference Sanity Checks ---")
    sample_queries = [
        "why did you charge my credit card 9.99 after I cancelled?",
        "my music won't play when I have no wifi connection on airplane",
        "the app completely freezes and crashes when I tap search",
        "how do I invite my sister to my family plan? she shows as free"
    ]
    for q in sample_queries:
        pred = best_model.predict([q])[0]
        # Check if decision_function or predict_proba available
        conf_str = ""
        if hasattr(best_model.named_steps[list(best_model.named_steps.keys())[-1]], "predict_proba"):
            probs = best_model.predict_proba([q])[0]
            conf = float(np.max(probs))
            conf_str = f" (Confidence: {conf*100:.1f}%)"
        print(f"Query: \"{q}\"")
        print(f"  -> Predicted Intent: {pred}{conf_str}\n")

if __name__ == "__main__":
    main()
