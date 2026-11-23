"""
Precomputes dense vector embeddings for 13,922 Spotify customer-reply pairs
using sentence-transformers (all-MiniLM-L6-v2, 384 dimensions).
Saves:
  - data/corpus_embeddings.npy (normalized float32 matrix: 13922 x 384)
  - data/corpus_metadata.json (id, customer_text, brand_reply_text)
"""

import json
import os
import time
import numpy as np
from sentence_transformers import SentenceTransformer

PAIRS_PATH = os.path.join(os.path.dirname(__file__), "../data/spotifycares-pairs.json")
EMBEDDINGS_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../data/corpus_embeddings.npy")
METADATA_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../data/corpus_metadata.json")
MODEL_NAME = "all-MiniLM-L6-v2"

def main():
    print(f"Loading corpus from: {PAIRS_PATH}")
    with open(PAIRS_PATH, "r", encoding="utf-8") as f:
        pairs = json.load(f)

    print(f"Loaded {len(pairs):,} historical customer-reply pairs.")

    # Extract metadata and text to embed
    # We embed the customer's text (what future queries will be similar to)
    metadata = []
    texts_to_embed = []

    for item in pairs:
        metadata.append({
            "tweet_id": str(item["customer_tweet_id"]),
            "customer_text": item["customer_text"],
            "brand_reply_text": item["brand_reply_text"]
        })
        texts_to_embed.append(item["customer_text"])

    print(f"Loading SentenceTransformer model: {MODEL_NAME}...")
    start_time = time.time()
    model = SentenceTransformer(MODEL_NAME)
    print(f"Model loaded in {time.time() - start_time:.2f}s.")

    print(f"Encoding {len(texts_to_embed):,} texts with normalized embeddings (batch_size=128)...")
    t0 = time.time()
    embeddings = model.encode(
        texts_to_embed,
        batch_size=128,
        show_progress_bar=True,
        normalize_embeddings=True,  # Crucial: allows dot-product for cosine similarity
        convert_to_numpy=True
    ).astype(np.float32)

    elapsed = time.time() - t0
    print(f"Encoding complete in {elapsed:.1f}s ({len(texts_to_embed) / elapsed:.1f} texts/sec).")
    print(f"Embeddings shape: {embeddings.shape}, dtype: {embeddings.dtype}")

    # Save artifacts
    np.save(EMBEDDINGS_OUTPUT_PATH, embeddings)
    print(f"Saved dense embeddings matrix to: {EMBEDDINGS_OUTPUT_PATH}")

    with open(METADATA_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved metadata to: {METADATA_OUTPUT_PATH}")
    print("Done!")

if __name__ == "__main__":
    main()
