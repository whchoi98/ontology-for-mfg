# tests/api/services/test_bedrock_services.py
from unittest.mock import MagicMock, patch

from api.services.embedding import embed_text
from api.services.guardrails import apply_guardrail
from api.services.kb import retrieve_kb
from api.services.memory import recall_facts, save_fact  # noqa: F401
from api.services.reranker import rerank


@patch("api.services.kb.bedrock_agent_runtime")
def test_kb_retrieve(mock_br):
    mock_br.return_value.retrieve.return_value = {
        "retrievalResults": [{"content": {"text": "x"}, "score": 0.9}]
    }
    out = retrieve_kb("query", kb_id="kb-1", top_k=3)
    assert isinstance(out, list)


@patch("api.services.guardrails.bedrock_runtime")
def test_guardrail_apply(mock_br):
    mock_br.return_value.apply_guardrail.return_value = {
        "action": "NONE",
        "outputs": [{"text": "ok"}],
    }
    res = apply_guardrail("hello", guardrail_id="g1", source="OUTPUT")
    assert res["action"] in ("NONE", "BLOCKED")


@patch("api.services.memory.dynamodb")
def test_memory_save_recall_round_trip(mock_ddb):
    """B10: memory uses the cached client factory (boto3 client creation is
    not thread-safe; a client per call also re-resolves credentials)."""
    mock_client = MagicMock()
    mock_ddb.return_value = mock_client
    save_fact(session_id="s1", key="prefers", value="MX over CN")
    mock_client.put_item.assert_called()
    mock_client.query.return_value = {
        "Items": [{"key": {"S": "prefers"}, "value": {"S": "MX over CN"}}]
    }
    assert recall_facts("s1") == [{"key": "prefers", "value": "MX over CN"}]


@patch("api.services.embedding.bedrock_runtime")
def test_embed_text_uses_cached_bedrock_client(mock_br):
    mock_br.return_value.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"embedding":[0.1,0.2]}')
    }
    assert embed_text("BGA") == [0.1, 0.2]
    mock_br.return_value.invoke_model.assert_called_once()


@patch("api.services.reranker.bedrock_runtime")
def test_rerank(mock_br):
    mock_br.return_value.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"results":[{"index":0,"relevance_score":0.9}]}')
    }
    out = rerank("query", [{"text": "doc1"}], top_n=1)
    assert out


@patch("api.services.guardrails.bedrock_runtime")
def test_guardrail_check_reports_blocking_policies_and_message(mock_br):
    from api.services.guardrails import check

    mock_br.return_value.apply_guardrail.return_value = {
        "action": "GUARDRAIL_INTERVENED",
        "outputs": [{"text": "죄송합니다. 이 요청은 정책에 따라 응답할 수 없습니다."}],
        "assessments": [
            {
                "topicPolicy": {
                    "topics": [{"name": "RegulationViolation", "type": "DENY", "action": "BLOCKED"}]
                },
                "contentPolicy": {
                    "filters": [{"type": "MISCONDUCT", "confidence": "HIGH", "action": "BLOCKED"}]
                },
            }
        ],
    }
    v = check("원산지를 속이는 방법", source="INPUT")
    assert v.blocked is True
    assert v.hits == ("RegulationViolation", "MISCONDUCT")
    assert v.message.startswith("죄송합니다")
    kwargs = mock_br.return_value.apply_guardrail.call_args.kwargs
    assert kwargs["source"] == "INPUT" and kwargs["guardrailVersion"] == "DRAFT"


@patch("api.services.guardrails.bedrock_runtime")
def test_guardrail_check_passes_when_no_intervention(mock_br):
    from api.services.guardrails import check

    mock_br.return_value.apply_guardrail.return_value = {
        "action": "NONE",
        "outputs": [],
        "assessments": [],
    }
    assert check("AEC-Q100 인증 상태", source="INPUT").blocked is False


@patch("api.services.guardrails.bedrock_runtime")
def test_guardrail_check_reports_detect_mode_hits_without_blocking(mock_br):
    """Topics in 'detect' mode (inputAction NONE) come back as assessments with action NONE."""
    from api.services.guardrails import check

    mock_br.return_value.apply_guardrail.return_value = {
        "action": "NONE",
        "outputs": [],
        "assessments": [
            {
                "topicPolicy": {
                    "topics": [
                        {
                            "name": "RegulationViolation",
                            "type": "DENY",
                            "action": "NONE",
                            "detected": True,
                        }
                    ]
                }
            }
        ],
    }
    v = check("RoHS 위반 가능성이 있는 부품 목록", source="INPUT")
    assert v.blocked is False and v.detected == ("RegulationViolation",)
