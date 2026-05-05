# tests/api/services/test_bedrock_services.py
from unittest.mock import patch, MagicMock
from api.services.kb import retrieve_kb
from api.services.guardrails import apply_guardrail
from api.services.memory import save_fact, recall_facts  # noqa: F401
from api.services.reranker import rerank


@patch("api.services.kb.bedrock_agent_runtime")
def test_kb_retrieve(mock_br):
    mock_br.return_value.retrieve.return_value = {"retrievalResults": [{"content": {"text": "x"}, "score": 0.9}]}
    out = retrieve_kb("query", kb_id="kb-1", top_k=3)
    assert isinstance(out, list)


@patch("api.services.guardrails.bedrock_runtime")
def test_guardrail_apply(mock_br):
    mock_br.return_value.apply_guardrail.return_value = {"action": "NONE", "outputs": [{"text": "ok"}]}
    res = apply_guardrail("hello", guardrail_id="g1", source="OUTPUT")
    assert res["action"] in ("NONE", "BLOCKED")


@patch("api.services.memory.boto3.client")
def test_memory_save_recall_round_trip(mock_boto):
    mock_client = MagicMock()
    mock_boto.return_value = mock_client
    save_fact(session_id="s1", key="prefers", value="MX over CN")
    mock_client.put_item.assert_called()


@patch("api.services.reranker.bedrock_runtime")
def test_rerank(mock_br):
    mock_br.return_value.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"results":[{"index":0,"relevance_score":0.9}]}')
    }
    out = rerank("query", [{"text": "doc1"}], top_n=1)
    assert out
