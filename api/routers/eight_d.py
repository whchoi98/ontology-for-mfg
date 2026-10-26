# api/routers/eight_d.py — Scenario J (SSE stream)
from __future__ import annotations

import concurrent.futures
import logging
import re
import time

from fastapi import APIRouter, Body
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from api.config import settings
from api.schemas.sse import as_event as _sse_event
from api.services.eight_d_writer import draft_eight_d
from api.services.kb import retrieve_kb
from api.services.neptune import get_neptune

# Bound the Bedrock call below the upstream gateway timeout (CloudFront origin
# response timeout is 30s by default). 25s leaves headroom for response
# serialization + network so the fallback path runs in-process instead of the
# user seeing a 504.
_BEDROCK_BUDGET_S = 25.0
_BEDROCK_POOL = concurrent.futures.ThreadPoolExecutor(
    max_workers=4, thread_name_prefix="eight_d_bedrock"
)

# Single-source-of-truth UI labels for Bedrock CRIP ids — a substring
# in the model id maps to the chip label. When AWS rotates a model
# version (Sonnet 4.6 → 4.7, etc.) update this table only.
# "claude-haiku-4-5-20251001" → Haiku 4.5, "claude-sonnet-5-5" → Sonnet 5.5. Read from the id
# so the chip can't go stale when the model is swapped (it once said "Sonnet 4.6").
_CLAUDE_ID = re.compile(r"claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?=$|[-:.])")


def _short_model_label(model_id: str) -> str:
    """Compress a Bedrock CRIP id into a UI-friendly chip label."""
    if not model_id:
        return "Bedrock"
    m = _CLAUDE_ID.search(model_id.lower())
    if m:
        family, major, minor = m.groups()
        return f"{family.title()} {major}" + (f".{minor}" if minor else "")
    return model_id.split(".")[-1].split(":")[0][:24]


router = APIRouter(tags=["eight_d"])
log = logging.getLogger("mfg.eight_d")


class EightDRequest(BaseModel):
    incident_id: str


_FALLBACK_SECTIONS = [
    (
        "d1_team",
        "팀 구성",
        "Quality 부서 + 협력사 SQE + 설계 엔지니어 3명으로 cross-functional 팀 구성",
    ),
    (
        "d2_problem",
        "문제 정의",
        "BGA 패키지 솔더볼 균열 — lot 2026-Q1-W04, 발생률 320 ppm (한도 50 ppm 초과)",
    ),
    (
        "d3_containment",
        "임시 봉쇄 조치",
        "영향 lot 격리 + OEM A 출하 일시 중단 + 수입검사 AQL 0.65→0.40 강화",
    ),
    (
        "d4_root_cause",
        "근본 원인",
        "Reflow peak 온도 +8°C 드리프트 + substrate 흡습 (창고 65% RH > 사양 50%)",
    ),
    (
        "d5_corrective",
        "시정 조치",
        "Reflow 프로파일 재캘리브레이션 + dry pack 도입 + 흡습 모니터링",
    ),
    ("d6_implemented", "조치 적용", "차기 changeover에 라인 A12·A14 적용. 30일 검증 모니터링."),
    (
        "d7_prevention",
        "재발 방지",
        "Reflow SPC 차트 + 자동 alert (peak ±5°C). 분기별 supplier audit 추가.",
    ),
    ("d8_closure", "마감", "Quality Director 승인 후 60일 검증 통과 시 closure. 학습 사례 공유."),
]

_SECTION_HEADERS = [
    ("D1", "팀 구성 (Team Formation)", "d1_team"),
    ("D2", "문제 설명 (Problem Description)", "d2_problem"),
    ("D3", "긴급 조치 (Containment Action)", "d3_containment"),
    ("D4", "근본 원인 분석 (Root Cause)", "d4_root_cause"),
    ("D5", "영구 시정 조치 (Corrective)", "d5_corrective"),
    ("D6", "시정 조치 실행 (Implemented)", "d6_implemented"),
    ("D7", "재발 방지 (Prevention)", "d7_prevention"),
    ("D8", "팀 공로 인정 (Closure)", "d8_closure"),
]


def _fallback_draft(incident_title: str, reason: str) -> dict:
    """Return a deterministic 8D draft when Bedrock is unavailable, so the demo UI never blanks."""
    return {
        key: f"[{ko}] (자동 생성 폴백 — {reason}) {body} · 인시던트: {str(incident_title or '')[:60]}"
        for key, ko, body in _FALLBACK_SECTIONS
    }


def _section_text(value) -> str:
    """Tool-use input is model-generated JSON — a section may come back as
    null, a list of bullet strings, a number or an object. Coerce to text."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(_section_text(v) for v in value if v is not None)
    return str(value)


def _normalize_draft(draft) -> dict | None:
    """String-valued 8 D-section dict, or None when the shape is unusable."""
    if not isinstance(draft, dict):
        return None
    return {key: _section_text(draft.get(key)) for _code, _ko, key in _SECTION_HEADERS}


def _assemble_markdown(
    inc: dict,
    draft: dict,
    *,
    similar_count: int,
    is_fallback: bool,
    total_s: float,
    model_label: str = "Bedrock",
    fallback_reason: str = "",
) -> str:
    """Assemble the 8D report into a single Markdown document for client rendering."""
    severity = inc.get("severity") or "—"
    component = inc.get("component_id") or "—"
    plant = inc.get("plant_id") or "—"
    title = inc.get("title") or inc.get("id", "")

    # Label comes from the runtime model id (settings) — never hardcoded.
    mode = (
        f"결정론적 폴백 ({fallback_reason or 'Bedrock 응답 없음'})"
        if is_fallback
        else f"{model_label} tool-use 생성"
    )

    lines = [
        f"# 8D Report — `{inc.get('id', '')}`",
        "",
        f"> **인시던트**: {title}  ",
        f"> **심각도**: `{severity}` · **부품**: `{component}` · **공장**: `{plant}`  ",
        f"> **유사 사례**: {similar_count}건 · **생성 모드**: {mode} · **총 소요**: {total_s:.1f}s",
        "",
        "---",
        "",
    ]
    for code, title_ko, key in _SECTION_HEADERS:
        body = _section_text(draft.get(key)).strip()
        lines.append(f"## {code} — {title_ko}")
        lines.append("")
        lines.append(body if body else "_(생성된 내용 없음)_")
        lines.append("")
    return "\n".join(lines)


@router.post("/eight-d")
def eight_d(req: EightDRequest = Body(...)):
    """SSE stream of the 8D pipeline so the UI can render phase chips in real-time."""

    def gen():
        t0 = time.monotonic()
        log.info("eight_d.start incident=%s", req.incident_id)
        # Every exit path — including an unexpected crash mid-pipeline — must
        # end with exactly one `stop` so the client can tell done from dead.
        try:
            yield from _pipeline(t0)
        except Exception as e:
            log.exception("eight_d.gen() crashed: %s", type(e).__name__)
            yield _sse_event(
                {
                    "type": "error",
                    "name": "eight_d_stream",
                    "content": f"8D 스트림 처리 중 오류: {type(e).__name__}",
                }
            )
            yield _sse_event({"type": "stop", "reason": "stream_error"})
            return
        yield _sse_event({"type": "stop", "reason": "ok"})

    def _pipeline(t0: float):
        # ── Phase 1: Neptune lookup ──────────────────────────────────────────
        yield _sse_event({"type": "phase", "phase": "neptune", "label": "지식 그래프 조회"})
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
        dur1 = time.monotonic() - t1
        log.info("eight_d.neptune_done dur=%.1fs rows=%d", dur1, len(inc_rows or []))
        yield _sse_event(
            {
                "type": "phase_done",
                "phase": "neptune",
                "duration_s": round(dur1, 1),
                "detail": f"{len(inc_rows or [])} rows",
            }
        )

        if inc_rows:
            inc = dict(inc_rows[0])
            inc["id"] = inc.get("id") or req.incident_id
            inc["title"] = str(inc.get("title") or inc["id"])
        else:
            inc = {
                "id": req.incident_id,
                "title": "BGA solder ball crack on Innotek FC-BGA Gen5 (lot 2026-Q1-W04)",
                "component_id": "AMZN-CMP-IC-00001",
                "plant_id": "AMZN-PLANT-001",
                "severity": "CRITICAL",
                "_synthetic": True,
            }

        # ── Phase 2: KB retrieve ──────────────────────────────────────────────
        yield _sse_event({"type": "phase", "phase": "kb", "label": "유사 사례 KB 검색"})
        t2 = time.monotonic()
        try:
            kb_rows = retrieve_kb(inc["title"], top_k=3)
            similar = [r["content"]["text"] for r in kb_rows] if kb_rows else []
        except Exception as e:
            log.info("eight_d.kb_skipped dur=%.1fs err=%s", time.monotonic() - t2, e)
            similar = []
        dur2 = time.monotonic() - t2
        log.info("eight_d.kb_done dur=%.1fs hits=%d", dur2, len(similar))
        yield _sse_event(
            {
                "type": "phase_done",
                "phase": "kb",
                "duration_s": round(dur2, 1),
                "detail": f"{len(similar)} hits",
            }
        )

        # ── Phase 3: Bedrock 8D draft (with 25s timeout safety net) ──────────
        # Mirror the writer's model selection so the chip label reflects the
        # *actual* runtime model — eight_d_writer prefers haiku, falling
        # back to sonnet only when haiku is unset.
        active_model_id = settings.haiku_model or settings.sonnet_model
        active_model_label = _short_model_label(active_model_id)
        yield _sse_event(
            {
                "type": "phase",
                "phase": "bedrock",
                "label": f"{active_model_label} 8D 작성",
                "model_id": active_model_id,
                "model_label": active_model_label,
            }
        )
        t3 = time.monotonic()
        future = _BEDROCK_POOL.submit(
            draft_eight_d,
            incident_title=inc["title"],
            incident_desc=str(inc.get("severity") or ""),
            similar_reports=similar,
            standards=["JESD22", "AEC-Q100"],
        )
        bedrock_detail = ""
        fallback_reason = ""
        draft: dict | None = None
        try:
            draft = _normalize_draft(future.result(timeout=_BEDROCK_BUDGET_S))
            if draft is None:
                fallback_reason = "Bedrock 응답 형식 오류"
                bedrock_detail = "invalid tool_use shape — fallback"
            else:
                bedrock_detail = f"{len(draft)} sections"
                log.info(
                    "eight_d.bedrock_done dur=%.1fs keys=%d", time.monotonic() - t3, len(draft)
                )
        except concurrent.futures.TimeoutError:
            # Drop the call if it is still queued behind a saturated pool; a
            # running call can't be interrupted but is bounded by the client
            # read_timeout (api/aws_clients.py) instead of botocore's minutes.
            cancelled = future.cancel()
            log.warning(
                "eight_d.bedrock_timeout dur=%.1fs budget=%.1fs cancelled=%s — using fallback",
                time.monotonic() - t3,
                _BEDROCK_BUDGET_S,
                cancelled,
            )
            fallback_reason = f"Bedrock 응답 지연 >{int(_BEDROCK_BUDGET_S)}s"
            bedrock_detail = f"timeout {int(_BEDROCK_BUDGET_S)}s — fallback"
        except Exception as e:
            log.warning(
                "eight_d.bedrock_failed dur=%.1fs err=%s — using fallback",
                time.monotonic() - t3,
                e,
                exc_info=True,
            )
            fallback_reason = f"Bedrock 호출 실패: {type(e).__name__}"
            bedrock_detail = f"error: {type(e).__name__}"
        is_fallback = draft is None
        if draft is None:
            draft = _fallback_draft(inc["title"], reason=fallback_reason)
        dur3 = time.monotonic() - t3
        yield _sse_event(
            {
                "type": "phase_done",
                "phase": "bedrock",
                "duration_s": round(dur3, 1),
                "detail": bedrock_detail,
            }
        )

        # ── Result (sections + assembled markdown) ───────────────────────────
        sections = [
            {"section": code, "title": title_ko, "content": draft.get(key, "")}
            for code, title_ko, key in _SECTION_HEADERS
        ]
        total_s = time.monotonic() - t0
        markdown = _assemble_markdown(
            inc,
            draft,
            similar_count=len(similar),
            is_fallback=is_fallback,
            total_s=total_s,
            model_label=active_model_label,
            fallback_reason=fallback_reason,
        )
        log.info(
            "eight_d.end incident=%s total=%.1fs fallback=%s", req.incident_id, total_s, is_fallback
        )

        yield _sse_event(
            {
                "type": "result",
                "incident": inc,
                "sections": sections,
                "markdown": markdown,
                "similar_count": len(similar),
                "fallback": is_fallback,
                "synthetic": bool(inc.get("_synthetic")),
                "total_s": round(total_s, 1),
            }
        )

    return EventSourceResponse(gen())
