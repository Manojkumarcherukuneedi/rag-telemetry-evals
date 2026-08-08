# Chunk Size, Overlap, and Boundaries

Before anything can be embedded or indexed, a document has to be split into
chunks, and this splitting decision quietly shapes retrieval quality more
than most people expect. If chunks are too large, a single vector has to
represent several unrelated ideas at once, diluting its similarity to any
one specific query and making it harder to pinpoint the exact passage that
answers a question. If chunks are too small, each one loses the surrounding
context needed to make sense on its own, and an embedding of an isolated
sentence fragment can drift away from the meaning it had in context.

A common starting point is a word or token window of one to a few hundred
units, sized so each chunk covers roughly one coherent idea, like a
paragraph or a couple of related sentences. Overlap between consecutive
chunks, often twenty to thirty percent of the chunk size, exists specifically
to guard against the boundary problem: if a sentence explaining something
important falls right at the cut point between two chunks, a hard split with
no overlap can sever it so neither chunk contains the full thought. Sliding
the window forward by less than the full chunk size, so consecutive chunks
share some words, makes it far less likely that a relevant idea gets cut in
half and lost to both neighboring chunks.

More advanced splitters try to respect natural boundaries like sentences,
paragraphs, or markdown headings instead of cutting purely by word count,
but the size/overlap tradeoff remains the same underlying issue.
