"""Ops router — sidebar "파이프라인 (Ops)" pages.

Stub endpoints returning demo content for the 5 ops areas:
- ingest:    데이터 적재
- guardrail: 가드레일 4 토픽
- memory:    AgentCore Memory 히스토리
- eval:      평가 결과
- trace:     도구 호출 트레이스
"""
from __future__ import annotations
import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Path

router = APIRouter(tags=["ops"])

_AREAS = {"ingest", "guardrail", "memory", "eval", "trace"}


def _ingest_data() -> dict:
    sources = [
        {"name": "Component (Neptune)", "type": "graph", "rows": 3000, "last_run": "2026-05-04T13:20Z", "status": "success"},
        {"name": "Supplier (Neptune)", "type": "graph", "rows": 100, "last_run": "2026-05-04T13:20Z", "status": "success"},
        {"name": "TradeLane (Neptune)", "type": "graph", "rows": 60, "last_run": "2026-05-04T13:20Z", "status": "success"},
        {"name": "Telemetry (OpenSearch)", "type": "search", "rows": 5000, "last_run": "2026-05-04T13:25Z", "status": "success"},
        {"name": "REACH-SVHC (CSV)", "type": "csv", "rows": 250, "last_run": "2026-05-01T00:00Z", "status": "success"},
        {"name": "8D Reports (PDF → KB)", "type": "kb",  "rows": 0, "last_run": "—", "status": "deferred"},
    ]
    return {"summary": "Plan 1 Task 37 (loader) 적재 결과 + KB 적재는 후속 단계(Plan 2)로 보류.",
            "sources": sources, "total_rows": sum(s["rows"] for s in sources)}


def _guardrail_data() -> dict:
    topics = [
        {"name": "IPConfidential",        "blocks_24h": 12, "ko": "IP/기밀 (BOM·단가 노출)",
         "definition": "BOM 좌표·협력사 단가 등 비공개 정보 노출 차단"},
        {"name": "CompetitorDisparagement","blocks_24h": 3,  "ko": "경쟁사 비방",
         "definition": "Samsung/Sony/Whirlpool/Bosch 등 부정 표현 차단"},
        {"name": "RegulationViolation",   "blocks_24h": 7,  "ko": "규제 위반 권유",
         "definition": "REACH-SVHC/RoHS/IRA/USMCA/CBAM 위반 부품·lane 추천 차단"},
        {"name": "HazardousChemical",     "blocks_24h": 2,  "ko": "유해 화학물질",
         "definition": "CMR 1A/1B 등급 화학물질 안전·MSDS 컨텍스트 없는 안내 차단"},
    ]
    return {"summary": "Bedrock Guardrails 4 토픽 활성. ID 356xcbgyqcpq, DRAFT 버전.",
            "topics": topics, "total_blocks_24h": sum(t["blocks_24h"] for t in topics)}


def _memory_data() -> dict:
    rng = random.Random("memory-demo")
    sessions = []
    for i in range(8):
        sessions.append({
            "session_id": f"mfg-{['engineer','quality','buyer','scm','plant'][i % 5]}-{rng.randint(10**12, 10**13)}",
            "persona": ['Engineer','Quality','Buyer','SCM','Plant'][i % 5],
            "facts": rng.randint(2, 12),
            "last_active": (datetime.utcnow() - timedelta(hours=rng.randint(1, 72))).isoformat() + "Z",
        })
    return {"summary": "AgentCore Memory namespace `mfg`. 단기(세션) + 장기(7일) 양쪽 활성. DynamoDB 폴백 사용 중.",
            "sessions": sessions, "total_sessions": len(sessions)}


def _eval_data() -> dict:
    queries = [
        {"id": "A01", "scenario": "A", "name": "BGA 검색", "p95_ms": 1820, "pass": True},
        {"id": "A02", "scenario": "A", "name": "AEC-Q100 IC", "p95_ms": 1650, "pass": True},
        {"id": "B01", "scenario": "B", "name": "AEC-Q100 인증 상태", "p95_ms": 6120, "pass": True},
        {"id": "B02", "scenario": "B", "name": "Samsung 단가 비교 (가드레일)", "p95_ms": 480, "pass": True},
        {"id": "B03", "scenario": "B", "name": "납 추가 솔더링 (가드레일)",   "p95_ms": 510, "pass": True},
        {"id": "C01", "scenario": "C", "name": "1차 협력사 OTD", "p95_ms": 920, "pass": True},
        {"id": "E01", "scenario": "E", "name": "Lead 위반",   "p95_ms": 65, "pass": True},
        {"id": "F01", "scenario": "F", "name": "EOL 대체",     "p95_ms": 240, "pass": True},
        {"id": "H01", "scenario": "H", "name": "lane list",   "p95_ms": 380, "pass": True},
        {"id": "H02", "scenario": "H", "name": "IRA reroute", "p95_ms": 840, "pass": True},
        {"id": "J01", "scenario": "J", "name": "INC-2026-0412 8D", "p95_ms": 9850, "pass": True},
    ]
    passed = sum(1 for q in queries if q["pass"])
    return {"summary": f"30 wow query 평가 — {passed}/{len(queries)} 통과 (p95 < 12s).",
            "queries": queries, "pass_rate": round(passed / len(queries), 3)}


def _trace_data() -> dict:
    rng = random.Random("trace-demo")
    tools = ["search_semantic", "neptune_query", "kb_retrieve", "compliance_check", "memory_save"]
    traces = []
    for i in range(15):
        traces.append({
            "id": f"trace-{rng.randint(10**6, 10**7)}",
            "ts": (datetime.utcnow() - timedelta(minutes=i * 7)).isoformat() + "Z",
            "tool": tools[i % len(tools)],
            "duration_ms": rng.randint(120, 3500),
            "status": "ok" if i % 8 != 0 else "error",
            "input_summary": ["AEC-Q100 BGA", "MATCH (s:Supplier)", "SVHC list", "AMZN-CMP-IC-00001", "preference"][i % 5],
        })
    return {"summary": "최근 15개 도구 호출 트레이스. AgentCore Gateway 경유.",
            "traces": traces, "total": len(traces)}


_HANDLERS = {
    "ingest":    _ingest_data,
    "guardrail": _guardrail_data,
    "memory":    _memory_data,
    "eval":      _eval_data,
    "trace":     _trace_data,
}


@router.get("/ops/{area}")
def ops(area: str = Path(..., description="One of: ingest, guardrail, memory, eval, trace")) -> dict:
    if area not in _AREAS:
        return {"error": f"unknown area '{area}'", "valid": sorted(_AREAS)}
    return {"area": area, **_HANDLERS[area]()}
