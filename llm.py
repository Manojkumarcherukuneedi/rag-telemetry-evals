import os

from anthropic import Anthropic


def complete(prompt, system=None, model="claude-sonnet-5", max_tokens=1024):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Retrieval works without it, "
            "but generation requires an Anthropic API key."
        )

    client = Anthropic(api_key=api_key)
    kwargs = {"system": system} if system else {}
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
        **kwargs,
    )
    return "".join(block.text for block in response.content if block.type == "text")
