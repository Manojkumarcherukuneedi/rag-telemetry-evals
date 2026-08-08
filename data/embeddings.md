# Dense Embeddings and Cosine Similarity

A dense embedding model maps a piece of text to a fixed-length vector of
real numbers, typically a few hundred dimensions, such that texts with
similar meaning end up close together in that vector space. Unlike sparse
retrieval, which only counts shared words, the model is trained on large
amounts of text so it can capture paraphrase, synonymy, and context: "how do
I reset my password" and "steps to change account credentials" can land
near each other in embedding space even though they share almost no words.

The encoder used to produce these vectors is usually a transformer trained
with a contrastive objective, where matching pairs (a question and its
correct answer, or two paraphrases) are pulled together in vector space and
unrelated pairs are pushed apart. Sentence-transformer models like
all-MiniLM-L6-v2 are popular because they are small and fast enough to run
on a laptop CPU while still producing useful embeddings.

Once every chunk in a corpus is embedded, comparing a new query to all of
them just requires a similarity measure. Cosine similarity measures the
angle between two vectors rather than their raw magnitude, which matters
because embedding magnitude often reflects things like text length rather
than meaning. If vectors are first normalized to unit length, cosine
similarity reduces to a simple dot product, which is why normalized
embeddings paired with a dot-product search are so common in practice.
