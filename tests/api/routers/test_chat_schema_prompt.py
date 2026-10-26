"""The chat agent writes its own Cypher — its system prompt must carry the real graph
schema (from ontology/registry.py, the same source the loader and contract tests use),
otherwise the model guesses relationship names and silently gets empty results."""

from api.routers.chat import _SYSTEM_PROMPT_TEMPLATE
from ontology import registry


def test_system_prompt_lists_every_relationship_type_the_loader_creates():
    prompt = _SYSTEM_PROMPT_TEMPLATE.format(persona="buyer")
    for rel in registry.rel_types():
        assert f"[:{rel}" in prompt, rel
    # Relationship properties are part of the hint — price / lead time live on the edge.
    assert "(Component)-[:SUPPLIED_BY {leadtime, moq, otd, unit_price_usd}]->(Supplier)" in prompt


def test_system_prompt_explains_ids_and_comma_joined_lists():
    prompt = _SYSTEM_PROMPT_TEMPLATE.format(persona="buyer")
    assert "{id:" in prompt and "comma-joined" in prompt


def test_system_prompt_asks_for_a_note_before_each_tool_call():
    """Without it Sonnet 5.5 streams nothing until the final answer (~17 s in-VPC, ADR-013);
    the note must stay one sentence so it arrives as a `text` block, not a thinking block."""
    prompt = _SYSTEM_PROMPT_TEMPLATE.format(persona="buyer")
    assert "Before each tool call, tell the user in one short Korean sentence" in prompt
    assert "must stand on its own" in prompt
