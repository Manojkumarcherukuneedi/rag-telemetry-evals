# Evaluating RAG Systems

A RAG pipeline has two components that can each fail independently:
retrieval can return the wrong chunks, or generation can produce a wrong or
unsupported answer even when given the right chunks. Good evaluation
measures both separately rather than only checking whether the final answer
looks reasonable.

The most reliable approach is a ground-truth question-and-answer set: a
collection of realistic questions paired with the specific chunk or
document that should be retrieved and, ideally, a reference answer. This
lets you compute retrieval metrics like recall@k, whether the correct chunk
appears anywhere in the top k results, directly, without needing a model to
judge anything. Building this set by hand is slow, so many teams generate
candidate questions from their own corpus and then have a human spot-check
them.

Because writing ground truth for every possible question does not scale,
teams also lean on LLM-as-judge evaluation, where a separate model call
scores a generated answer against the retrieved context or a reference
answer, often on axes like correctness and relevance. A particularly
important axis for RAG specifically is faithfulness, sometimes called
groundedness: whether every claim in the generated answer is actually
supported by the retrieved chunks, as opposed to being invented by the
model. A system can be faithful but unhelpful, or fluent but ungrounded, so
faithfulness and answer quality are usually tracked as separate scores
rather than collapsed into one number.
