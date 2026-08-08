# RAG Retrieval Fundamentals

Retrieval-augmented generation (RAG) combines a search step with a generation
step. Instead of relying only on what a language model memorized during
training, the system first retrieves relevant text chunks from an external
corpus and then feeds those chunks to the model as context. This lets the
model answer questions using up-to-date or domain-specific information it
was never trained on, and it reduces hallucination because the model can
ground its response in retrieved evidence.

The retrieval step usually works by embedding documents into dense vectors
using a neural encoder, storing those vectors in an index, and then embedding
the incoming query with the same encoder. Similarity between the query
vector and each document vector, often measured with cosine similarity, is
used to rank chunks and return the top matches. Choosing a good chunk size
matters: chunks that are too large dilute relevance signal and waste context,
while chunks that are too small lose surrounding context and can fragment
ideas that span multiple sentences. Overlapping windows between chunks help
avoid cutting a relevant idea exactly at a boundary.
