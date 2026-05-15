"""Follow-up question suggestions — 3 natural-language follow-ups per turn.

Emitted as the `suggested_followups` SSE event from /api/chat so the web UI
can render clickable chips that send the picked question as the next user
turn. Persona tone is keyed off the manufacturing KPI map below.

Graceful degrade: any Bedrock error returns [] and the UI simply renders
no chips. Never raises into the SSE stream.
"""
from __future__ import annotations
import logging

from api.aws_clients import bedrock_runtime
from api.config import settings

log = logging.getLogger("mfg.followups")

# Persona → domain KPI tone string. Drives the follow-up generator's
# "what does this user care about?" framing. Aligned with the 22-class
# ontology in CLAUDE.md.
PERSONA_TONE: dict[str, str] = {
    "buyer":    "구매 부서 — 단가, 협력사 OTD, 리드타임, MOQ, 대체품, 비용 절감",
    "engineer": "R&D 엔지니어 — 스펙(전기/기계/온도), AEC-Q · JEDEC · IPC 인증, EOL, 호환성, 신뢰성",
    "quality":  "품질 부서 — 8D / RCA, 인시던트, 부적합, REACH-SVHC, RoHS, IATF 16949, 수입검사",
    "scm":      "공급망 부서 — TradeLane, IRA / CBAM / USMCA, FEoC, 재라우팅, ETA, FTA 활용",
    "plant":    "생산 / 공장 — OEE, 가동률, PdM, 텔레메트리(vibration / temp), MTBF, 정비 일정",
}

_DEFAULT_TONE = PERSONA_TONE["engineer"]

_SYSTEM = """당신은 Hi-Tech 제조 도메인 사용자의 후속 자연어 질문 3개를 추천한다.

규칙:
- 한국어 자연어. 짧고 구체적 (각 30자 이내 권장).
- 직전 답변을 더 깊게 파거나, 액션으로 이어지거나, 다른 차원으로 확장.
- 사용자 부서 페르소나의 KPI·관심사를 반영.
- 부품 ID / 인시던트 ID / 인증명 / 협력사명 등 구체적 엔티티 활용.
- 줄당 1개 질문, 불릿 / 번호 / 인용부호 없이.
- 정확히 3줄. 다른 설명 없음."""

# Bound to keep prompt cheap; longer answers truncate cleanly mid-paragraph
# without affecting follow-up quality.
_ANSWER_SNIPPET_MAX = 1200
_USER_SNIPPET_MAX = 300


def generate(assistant_text: str, persona: str, last_user_msg: str) -> list[str]:
    """Generate 3 follow-up questions for the next turn.

    Returns [] on any failure — caller must treat empty as "render nothing".
    """
    if not assistant_text.strip() or not last_user_msg.strip():
        return []

    tone = PERSONA_TONE.get(persona, _DEFAULT_TONE)
    snippet = assistant_text.strip()[:_ANSWER_SNIPPET_MAX]
    user_msg = last_user_msg.strip()[:_USER_SNIPPET_MAX]

    user_block = (
        f"사용자 부서 페르소나: {tone}\n\n"
        f"직전 사용자 질문: {user_msg}\n\n"
        f"직전 어시스턴트 답변:\n{snippet}\n\n"
        f"이 답변을 받은 사용자가 자연스럽게 던질 후속 질문 3개를 제안하세요."
    )

    try:
        # Haiku 4.5 is plenty for 3 short follow-ups — Sonnet would burn
        # ~10x cost/latency for the same 3 lines. Aligns with the eight_d
        # writer's Haiku choice (commit 2494436 in CHANGELOG).
        resp = bedrock_runtime().converse(
            modelId=settings.haiku_model,
            system=[{"text": _SYSTEM}],
            messages=[{"role": "user", "content": [{"text": user_block}]}],
            inferenceConfig={"temperature": 0.7, "maxTokens": 300},
        )
        text = resp["output"]["message"]["content"][0]["text"]
    except Exception as e:  # noqa: BLE001 — broad on purpose, never escape
        log.warning("followups generation failed: %s: %s", type(e).__name__, e)
        return []

    return _parse_three(text)


def _parse_three(text: str) -> list[str]:
    """Extract up to 3 single-line questions from raw model output."""
    stripped: list[str] = []
    for line in text.split("\n"):
        cleaned = line.strip(" -•*0123456789.).\t\"'`")
        if 5 <= len(cleaned) <= 120:
            stripped.append(cleaned)
    return stripped[:3]
