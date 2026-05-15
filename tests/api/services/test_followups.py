# tests/api/services/test_followups.py
from unittest.mock import patch

from api.services.followups import PERSONA_TONE, _parse_three, generate


def test_persona_tone_covers_five_mfg_personas():
    """Drift guard — chat.py routes any of these 5 personas; followups must
    have a tone string for each so the generator never falls through to the
    default unexpectedly."""
    assert set(PERSONA_TONE.keys()) == {"buyer", "engineer", "quality", "scm", "plant"}


def test_parse_three_strips_bullets_and_caps_at_three():
    raw = (
        "1. AEC-Q100 인증 대체품을 추천해 주세요\n"
        "- 동일 패키지의 다른 협력사 후보는?\n"
        "• 이 부품의 EOL 일정은 언제인가요?\n"
        "  4) 너무 길어서 잘라야 하는 무의미한 추가 줄로 컷오프를 검증합니다\n"
    )
    out = _parse_three(raw)
    assert len(out) == 3
    assert out[0] == "AEC-Q100 인증 대체품을 추천해 주세요"
    assert out[1] == "동일 패키지의 다른 협력사 후보는?"
    assert out[2] == "이 부품의 EOL 일정은 언제인가요?"


def test_parse_three_filters_too_short_or_too_long():
    # NOTE: explicit + here — implicit string concat binds tighter than *
    # and would multiply the wrong segment.
    raw = "ok\n" + "정상 길이 질문\n" + ("x" * 200) + "\n"
    out = _parse_three(raw)
    assert out == ["정상 길이 질문"]


def test_generate_empty_inputs_short_circuit():
    """No assistant text or no user message → [], without touching Bedrock."""
    assert generate("", "buyer", "안녕") == []
    assert generate("어떤 답변", "buyer", "") == []
    assert generate("   ", "buyer", "안녕") == []


@patch("api.services.followups.bedrock_runtime")
def test_generate_happy_path(mock_br):
    mock_br.return_value.converse.return_value = {
        "output": {"message": {"content": [{"text": (
            "AMZN-CMP-IC-00001의 대체품 EOL 일정도 알려주세요\n"
            "이 부품의 Tier-1 협력사 OTD는 어떤가요?\n"
            "AEC-Q100 미인증 후보를 제외하면 몇 개 남나요?\n"
        )}]}},
    }
    out = generate("AEC-Q100 인증된 후보 5개입니다", "engineer", "AEC-Q100 대체품")
    assert len(out) == 3
    # The persona tone block must have been sent in the user content.
    call = mock_br.return_value.converse.call_args
    user_text = call.kwargs["messages"][0]["content"][0]["text"]
    assert "R&D 엔지니어" in user_text
    assert "AEC-Q100 대체품" in user_text


@patch("api.services.followups.bedrock_runtime")
def test_generate_bedrock_failure_returns_empty(mock_br):
    """Bedrock raises → empty list, never propagated to the SSE stream."""
    mock_br.return_value.converse.side_effect = RuntimeError("throttled")
    out = generate("일부 답변", "plant", "센서 임계 초과")
    assert out == []


@patch("api.services.followups.bedrock_runtime")
def test_generate_unknown_persona_falls_back_to_default_tone(mock_br):
    mock_br.return_value.converse.return_value = {
        "output": {"message": {"content": [{"text": (
            "첫 번째 후속 질문입니다\n"
            "두 번째 다른 차원 질문\n"
            "세 번째 액션 지향 질문\n"
        )}]}},
    }
    out = generate("답변", "ceo", "질문")
    assert len(out) == 3
    # Default tone is engineer's — verify it slipped into the prompt.
    user_text = mock_br.return_value.converse.call_args.kwargs["messages"][0]["content"][0]["text"]
    assert "R&D 엔지니어" in user_text
