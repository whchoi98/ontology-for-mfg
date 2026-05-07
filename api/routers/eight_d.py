# api/routers/eight_d.py — Scenario J
from __future__ import annotations
import concurrent.futures
import logging
import time
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune
from api.services.eight_d_writer import draft_eight_d
from api.services.kb import retrieve_kb

# Bound the Bedrock call below the upstream gateway timeout (CloudFront origin
# response timeout is 30s by default). 25s leaves headroom for response
# serialization + network so the fallback path runs in-process instead of the
# user seeing a 504.
_BEDROCK_BUDGET_S = 25.0
_BEDROCK_POOL = concurrent.futures.ThreadPoolExecutor(
    max_workers=4, thread_name_prefix="eight_d_bedrock"
)

router = APIRouter(tags=["eight_d"])
log = logging.getLogger("mfg.eight_d")


class EightDRequest(BaseModel):
    incident_id: str


_FALLBACK_SECTIONS = [
    ("d1_team",        "팀 구성",        "Quality 부서 + 협력사 SQE + 설계 엔지니어 3명으로 cross-functional 팀 구성"),
    ("d2_problem",     "문제 정의",      "BGA 패키지 솔더볼 균열 — lot 2026-Q1-W04, 발생률 320 ppm (한도 50 ppm 초과)"),
    ("d3_containment", "임시 봉쇄 조치", "영향 lot 격리 + OEM A 출하 일시 중단 + 수입검사 AQL 0.65→0.40 강화"),
    ("d4_root_cause",  "근본 원인",      "Reflow peak 온도 +8°C 드리프트 + substrate 흡습 (창고 65% RH > 사양 50%)"),
    ("d5_corrective",  "시정 조치",      "Reflow 프로파일 재캘리브레이션 + dry pack 도입 + 흡습 모니터링"),
    ("d6_implemented", "조치 적용",      "차기 changeover에 라인 A12·A14 적용. 30일 검증 모니터링."),
    ("d7_prevention",  "재발 방지",      "Reflow SPC 차트 + 자동 alert (peak ±5°C). 분기별 supplier audit 추가."),
    ("d8_closure",     "마감",            "Quality Director 승인 후 60일 검증 통과 시 closure. 학습 사례 공유."),
]


def _fallback_draft(incident_title: str, reason: str) -> dict:
    """Return a deterministic 8D draft when Bedrock is unavailable, so the demo UI never blanks."""
    return {
        key: f"[{ko}] (자동 생성 폴백 — {reason}) {body} · 인시던트: {incident_title[:60]}"
        for key, ko, body in _FALLBACK_SECTIONS
    }


@router.post("/eight-d")
def eight_d(req: EightDRequest = Body(...)) -> dict:
    t0 = time.monotonic()
    log.info("eight_d.start incident=%s", req.incident_id)

    # ── Stage 1: Neptune lookup ──────────────────────────────────────────
    t1 = time.monotonic()
    try:
        inc_rows = get_neptune().run_cypher(
            "MATCH (i:QualityIncident {id: $id}) RETURN i.id AS id, i.title AS title, "
            "i.component_id AS component_id, i.plant_id AS plant_id, i.severity AS severity",
            {"id": req.incident_id},
        )
    except Exception as e:
        log.warning("eight_d.neptune_failed dur=%.1fs err=%s", time.monotonic() - t1, e)
        inc_rows = []
    log.info("eight_d.neptune_done dur=%.1fs rows=%d", time.monotonic() - t1, len(inc_rows or []))

    if inc_rows:
        inc = inc_rows[0]
    else:
        # Synthesize incident metadata so demo can proceed
        inc = {
            "id": req.incident_id,
            "title": "BGA solder ball crack on Innotek FC-BGA Gen5 (lot 2026-Q1-W04)",
            "component_id": "AMZN-CMP-IC-00001",
            "plant_id": "AMZN-PLANT-001",
            "severity": "CRITICAL",
            "_synthetic": True,
        }

    # ── Stage 2: KB retrieve ──────────────────────────────────────────────
    t2 = time.monotonic()
    try:
        kb_rows = retrieve_kb(inc["title"], top_k=3)
        similar = [r["content"]["text"] for r in kb_rows] if kb_rows else []
    except Exception as e:
        log.info("eight_d.kb_skipped dur=%.1fs err=%s", time.monotonic() - t2, e)
        similar = []
    log.info("eight_d.kb_done dur=%.1fs hits=%d", time.monotonic() - t2, len(similar))

    # ── Stage 3: Bedrock 8D draft (defensive — fallback if model fails) ──
    # Submitted on a worker thread + bounded by `_BEDROCK_BUDGET_S` so we
    # always return within the upstream gateway timeout. If the call exceeds
    # the budget we abandon the future (it keeps running but its result is
    # ignored) and surface the deterministic fallback instead of a 504.
    t3 = time.monotonic()
    future = _BEDROCK_POOL.submit(
        draft_eight_d,
        incident_title=inc["title"],
        incident_desc=inc.get("severity", ""),
        similar_reports=similar,
        standards=["JESD22", "AEC-Q100"],
    )
    try:
        draft = future.result(timeout=_BEDROCK_BUDGET_S)
        log.info("eight_d.bedrock_done dur=%.1fs keys=%d", time.monotonic() - t3, len(draft))
    except concurrent.futures.TimeoutError:
        log.warning("eight_d.bedrock_timeout dur=%.1fs budget=%.1fs — using fallback",
                    time.monotonic() - t3, _BEDROCK_BUDGET_S)
        draft = _fallback_draft(inc["title"], reason=f"Bedrock 응답 지연 (>{int(_BEDROCK_BUDGET_S)}s)")
    except Exception as e:
        log.warning("eight_d.bedrock_failed dur=%.1fs err=%s — using fallback",
                    time.monotonic() - t3, e, exc_info=True)
        draft = _fallback_draft(inc["title"], reason=f"Bedrock 호출 실패: {type(e).__name__}")

    # Build both shapes for the frontend:
    # - `eight_d` (dict, original shape)
    # - `sections` (array, frontend expects { section, title, content })
    SECTION_TITLES = [
        ("D1", "팀 구성 (Team Formation)",            draft.get("d1_team", "")),
        ("D2", "문제 설명 (Problem Description)",     draft.get("d2_problem", "")),
        ("D3", "긴급 조치 (Containment Action)",       draft.get("d3_containment", "")),
        ("D4", "근본 원인 분석 (Root Cause)",         draft.get("d4_root_cause", "")),
        ("D5", "영구 시정 조치 (Corrective)",         draft.get("d5_corrective", "")),
        ("D6", "시정 조치 실행 (Implemented)",         draft.get("d6_implemented", "")),
        ("D7", "재발 방지 (Prevention)",               draft.get("d7_prevention", "")),
        ("D8", "팀 공로 인정 (Closure)",               draft.get("d8_closure", "")),
    ]
    sections = [{"section": s, "title": t, "content": c} for s, t, c in SECTION_TITLES]

    is_fallback = all(v.startswith("[") for v in draft.values()) if draft else False
    log.info("eight_d.end incident=%s total=%.1fs fallback=%s",
             req.incident_id, time.monotonic() - t0, is_fallback)
    return {
        "incident": inc,
        "eight_d": draft,
        "sections": sections,
        "similar_count": len(similar),
        "_fallback": is_fallback,
    }
