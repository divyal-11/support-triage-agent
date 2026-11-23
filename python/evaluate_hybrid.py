"""
Evaluates Hybrid Search (Sparse TF-IDF vs. Dense Embeddings vs. Hybrid RRF)
Qualitative side-by-side comparison on documented Failure Mode 5 cases and vocabulary mismatches.
"""

import os
import sys
from hybrid_search import HybridSearchEngine

TEST_QUERIES = [
    {
        "case_name": "Failure Mode 5: Rare Keyword Overlap Distraction",
        "query": "My playlist has 200 songs but only plays 10 on shuffle.",
        "intent_context": "Playback issue / shuffle loop bug (NOT library import)",
        "expected_topic": "Shuffle / repeat playback troubleshooting"
    },
    {
        "case_name": "Vocabulary Mismatch 1: Slang & Synonyms with Zero Keyword Overlap",
        "query": "my music keeps cutting off every few minutes on my cell",
        "intent_context": "Streaming pauses / playback interruption (words 'cutting off', 'cell' vs 'pause', 'mobile')",
        "expected_topic": "Audio playback pause / background app refresh"
    },
    {
        "case_name": "Vocabulary Mismatch 2: Indirect Financial Phrasing",
        "query": "money was taken from my debit account unexpectedly",
        "intent_context": "Billing dispute without canonical keywords ('charge', 'refund', 'paypal')",
        "expected_topic": "Billing inquiry routed to private DM"
    },
    {
        "case_name": "Vocabulary Mismatch 3: Offline Storage Phrasing",
        "query": "tracks won't play when I'm on an airplane with no connection",
        "intent_context": "Offline downloads issue (no literal word 'download' or 'offline')",
        "expected_topic": "Offline listening / storage guide"
    }
]

def format_reply_snippet(text: str, max_len: int = 140) -> str:
    clean = text.replace("\n", " ").strip()
    if len(clean) > max_len:
        return clean[:max_len] + "..."
    return clean

def main():
    engine = HybridSearchEngine()

    print("\n" + "=" * 90)
    print("HYBRID RETRIEVAL BENCHMARK: SPARSE TF-IDF vs. DENSE EMBEDDINGS vs. HYBRID RRF")
    print("=" * 90)

    for i, test in enumerate(TEST_QUERIES, 1):
        query = test["query"]
        print(f"\n--- [Test Case #{i}] {test['case_name']} ---")
        print(f"Query:            \"{query}\"")
        print(f"Expected Context: {test['intent_context']}")
        print("-" * 90)

        # 1. Sparse TF-IDF Top 1
        sparse_hits = engine.search_sparse(query, top_k=1)
        sparse_hit = sparse_hits[0] if sparse_hits else None

        # 2. Dense Vector Top 1
        dense_hits = engine.search_dense(query, top_k=1)
        dense_hit = dense_hits[0] if dense_hits else None

        # 3. Hybrid RRF Top 1
        hybrid_hits = engine.search_hybrid_rrf(query, top_k=1)
        hybrid_hit = hybrid_hits[0] if hybrid_hits else None

        # Print Comparison
        print(f"\n1. SPARSE (TF-IDF Lexical Match):")
        if sparse_hit:
            print(f"   Match Tweet ID: {sparse_hit['tweet_id']} (Score: {sparse_hit['score']:.4f})")
            print(f"   Historical Query: \"{format_reply_snippet(sparse_hit['customer_text'])}\"")
            print(f"   Spotify Reply:    \"{format_reply_snippet(sparse_hit['brand_reply_text'])}\"")
        else:
            print("   No match found.")

        print(f"\n2. DENSE (all-MiniLM-L6-v2 Embeddings):")
        if dense_hit:
            print(f"   Match Tweet ID: {dense_hit['tweet_id']} (Cosine Sim: {dense_hit['score']:.4f})")
            print(f"   Historical Query: \"{format_reply_snippet(dense_hit['customer_text'])}\"")
            print(f"   Spotify Reply:    \"{format_reply_snippet(dense_hit['brand_reply_text'])}\"")
        else:
            print("   No match found.")

        print(f"\n3. HYBRID (Reciprocal Rank Fusion - RRF k=60):")
        if hybrid_hit:
            s_rank_str = f"#{hybrid_hit['sparse_rank']}" if hybrid_hit['sparse_rank'] else "None"
            d_rank_str = f"#{hybrid_hit['dense_rank']}" if hybrid_hit['dense_rank'] else "None"
            print(f"   Match Tweet ID: {hybrid_hit['tweet_id']} (RRF: {hybrid_hit['rrf_score']:.5f} | Sparse: {s_rank_str}, Dense: {d_rank_str})")
            print(f"   Historical Query: \"{format_reply_snippet(hybrid_hit['customer_text'])}\"")
            print(f"   Spotify Reply:    \"{format_reply_snippet(hybrid_hit['brand_reply_text'])}\"")
        else:
            print("   No match found.")

        print("\n" + "=" * 90)

if __name__ == "__main__":
    main()
