"""
Hybrid Retrieval Engine (Sparse TF-IDF + Dense Vector Search + Reciprocal Rank Fusion)
Grounded in real historical @SpotifyCares Twitter support interactions.
"""

import json
import os
import time
from typing import List, Dict, Any, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sentence_transformers import SentenceTransformer

METADATA_PATH = os.path.join(os.path.dirname(__file__), "../data/corpus_metadata.json")
EMBEDDINGS_PATH = os.path.join(os.path.dirname(__file__), "../data/corpus_embeddings.npy")
MODEL_NAME = "all-MiniLM-L6-v2"

class HybridSearchEngine:
    def __init__(self):
        print("Initializing Hybrid Search Engine...")
        if not os.path.exists(METADATA_PATH) or not os.path.exists(EMBEDDINGS_PATH):
            raise FileNotFoundError(
                f"Missing corpus artifacts. Run python/embed_corpus.py first.\n"
                f"Expected: {METADATA_PATH} and {EMBEDDINGS_PATH}"
            )

        # 1. Load Metadata
        t0 = time.time()
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            self.metadata: List[Dict[str, str]] = json.load(f)
        self.num_docs = len(self.metadata)
        print(f"Loaded {self.num_docs:,} document records in {time.time() - t0:.2f}s.")

        # 2. Load Precomputed Dense Embeddings
        t0 = time.time()
        self.dense_embeddings = np.load(EMBEDDINGS_PATH)
        print(f"Loaded dense embeddings matrix {self.dense_embeddings.shape} in {time.time() - t0:.2f}s.")

        # 3. Fit Sparse TF-IDF Vectorizer
        t0 = time.time()
        print("Fitting Sparse TF-IDF Index (unigrams + bigrams)...")
        corpus_texts = [doc["customer_text"] for doc in self.metadata]
        self.tfidf_vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            sublinear_tf=True,
            max_features=35000,
            stop_words="english"
        )
        self.sparse_matrix = self.tfidf_vectorizer.fit_transform(corpus_texts)
        print(f"Sparse index ready ({self.sparse_matrix.shape[1]:,} features) in {time.time() - t0:.2f}s.")

        # 4. Load Dense Model for Query Encoding
        t0 = time.time()
        print(f"Loading query encoder model: {MODEL_NAME}...")
        self.model = SentenceTransformer(MODEL_NAME)
        print(f"Query encoder ready in {time.time() - t0:.2f}s.")

    def search_sparse(self, query: str, top_k: int = 20, exclude_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Retrieves top_k documents using Sparse TF-IDF Cosine Similarity.
        """
        q_vec = self.tfidf_vectorizer.transform([query])
        scores = (self.sparse_matrix * q_vec.T).toarray().flatten()

        # Sort descending
        top_indices = np.argsort(scores)[::-1]

        results = []
        rank = 1
        for idx in top_indices:
            doc = self.metadata[idx]
            if exclude_id and doc["tweet_id"] == str(exclude_id):
                continue
            if scores[idx] <= 0:
                break
            results.append({
                "tweet_id": doc["tweet_id"],
                "customer_text": doc["customer_text"],
                "brand_reply_text": doc["brand_reply_text"],
                "score": float(scores[idx]),
                "rank": rank,
                "engine": "sparse_tfidf"
            })
            rank += 1
            if len(results) >= top_k:
                break
        return results

    def search_dense(self, query: str, top_k: int = 20, exclude_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Retrieves top_k documents using Dense Semantic Cosine Similarity (Dot product on normalized vectors).
        """
        q_vec = self.model.encode(query, normalize_embeddings=True)
        # Dot product against all normalized embeddings in 1 vectorized call
        scores = np.dot(self.dense_embeddings, q_vec)

        # Sort descending
        top_indices = np.argsort(scores)[::-1]

        results = []
        rank = 1
        for idx in top_indices:
            doc = self.metadata[idx]
            if exclude_id and doc["tweet_id"] == str(exclude_id):
                continue
            results.append({
                "tweet_id": doc["tweet_id"],
                "customer_text": doc["customer_text"],
                "brand_reply_text": doc["brand_reply_text"],
                "score": float(scores[idx]),
                "rank": rank,
                "engine": "dense_embedding"
            })
            rank += 1
            if len(results) >= top_k:
                break
        return results

    def search_hybrid_rrf(
        self,
        query: str,
        top_k: int = 3,
        rrf_k: int = 60,
        candidate_pool: int = 40,
        exclude_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Fuses Sparse and Dense results using Reciprocal Rank Fusion:
        RRF_Score(d) = 1/(k + rank_sparse(d)) + 1/(k + rank_dense(d))
        """
        sparse_hits = self.search_sparse(query, top_k=candidate_pool, exclude_id=exclude_id)
        dense_hits = self.search_dense(query, top_k=candidate_pool, exclude_id=exclude_id)

        # Map doc id to ranking and details
        doc_info: Dict[str, Dict[str, Any]] = {}
        sparse_ranks: Dict[str, int] = {}
        dense_ranks: Dict[str, int] = {}

        for hit in sparse_hits:
            tid = hit["tweet_id"]
            sparse_ranks[tid] = hit["rank"]
            doc_info[tid] = hit

        for hit in dense_hits:
            tid = hit["tweet_id"]
            dense_ranks[tid] = hit["rank"]
            if tid not in doc_info:
                doc_info[tid] = hit

        # Compute RRF score across all unique candidates
        fused_scores: List[Dict[str, Any]] = []
        all_ids = set(sparse_ranks.keys()) | set(dense_ranks.keys())

        for tid in all_ids:
            s_rank = sparse_ranks.get(tid, None)
            d_rank = dense_ranks.get(tid, None)

            score = 0.0
            if s_rank is not None:
                score += 1.0 / (rrf_k + s_rank)
            if d_rank is not None:
                score += 1.0 / (rrf_k + d_rank)

            fused_scores.append({
                "tweet_id": tid,
                "customer_text": doc_info[tid]["customer_text"],
                "brand_reply_text": doc_info[tid]["brand_reply_text"],
                "rrf_score": score,
                "sparse_rank": s_rank,
                "dense_rank": d_rank
            })

        # Sort by RRF score descending
        fused_scores.sort(key=lambda x: x["rrf_score"], reverse=True)
        return fused_scores[:top_k]
