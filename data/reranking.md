# Cross-Encoder Rerankers

Initial retrieval, whether dense, sparse, or hybrid, is optimized for speed:
it needs to search across thousands or millions of chunks in milliseconds,
so it scores each chunk independently against the query using a cheap
similarity measure like a dot product. That speed comes at a cost to
precision, because the query and each document are embedded separately and
never actually interact with each other during scoring.

A cross-encoder reranker fixes this by taking the query and a single
candidate chunk together, as one combined input, and running them jointly
through a transformer that outputs a single relevance score. Because the
model can attend across both texts at once, it captures interactions that
independent embeddings miss, like negation, precise numeric matches, or
subtle contradictions, and it is noticeably more accurate at judging true
relevance than cosine similarity alone.

The catch is cost: scoring every chunk in a large corpus this way would be
far too slow for real-time search. So rerankers are used as a second stage,
applied only to a small pool, typically the top 20 to 100 candidates already
returned by fast initial retrieval. The reranker reorders that short list so
the handful of chunks ultimately shown to a user or passed to a generation
step are the most genuinely relevant ones, combining the speed of the first
pass with the precision of the second.
