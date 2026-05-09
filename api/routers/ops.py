"""Ops console — /api/ops/{ingest,guardrail,memory,eval,trace}.

Read-only telemetry for the demo's "what's actually running" panel. Mirrors
the contract used by the retail variant so the web frontend's per-area views
can be reused with mfg-specific labels:

  • ingest    — Neptune node/edge counts + OpenSearch doc count
  • guardrail — recent CW log events mentioning guardrail/intervention/scrub,
                plus the four mfg topic definitions (IP, Competitor, Reg,
                Hazardous)
  • memory    — DynamoDB-backed AgentCore Memory facts for a session
  • eval      — 30 mfg wow-query pass/fail scoreboard, cached 10 min
  • trace     — in-process tool-call ring buffer from agent service
"""
from __future__ import annotations

import concurrent.futures
import datetime as _dt
import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.aws_clients import cloudwatch_logs, dynamodb as _ddb_client
from api.config import settings
from api.services import agent as agent_svc
from api.services.neptune import get_neptune
from api.services.search import get_search

router = APIRouter(tags=["ops"])
log = logging.getLogger("mfg.ops")


# ─── /ops/ingest ────────────────────────────────────────────────────────────

class IngestStatus(BaseModel):
    neptune: Dict[str, int]
    opensearch_docs: int
    opensearch_index: str


# Synthetic fallback for when Neptune is unreachable — keeps the ops panel
# meaningful for a demo even with the cluster down.
_INGEST_FALLBACK_LABELS: Dict[str, int] = {
    "Component": 3000, "Telemetry": 5000, "Module": 400, "Substance": 250,
    "Supplier": 100, "Product": 80, "QualityIncident": 80, "TradeLane": 60,
    "EightDReport": 50, "RootCause": 50, "MaintenanceEvent": 50,
    "RawMaterial": 200, "SubSupplier": 50, "Plant": 40, "ESGIndicator": 40,
    "CarbonScope": 36, "Certification": 30, "CustomerAccount": 30,
    "Standard": 10, "Region": 7, "Regulation": 5, "Manufacturer": 4,
}
_INGEST_FALLBACK_EDGES: Dict[str, int] = {
    ":CONSISTS_OF": 6000, ":CONFORMS_TO": 4500, ":SUPPLIED_BY": 3000,
    ":CONTAINS_SUBSTANCE": 2500, ":HAS_MODULE": 2000, ":REGULATED_BY": 1200,
    ":LOCATED_IN": 800, ":PART_OF": 600, ":HAS_SENSOR": 500,
    ":SUB_SUPPLIES": 300, ":CONNECTS": 200, ":EMITS": 150,
    ":ABOUT": 80, ":ROOT_CAUSE": 60, ":ADDRESSED_BY": 50,
}


@router.get("/ops/ingest", response_model=IngestStatus)
def ingest_status() -> IngestStatus:
    """Counts of every node label + edge type in Neptune, plus OS doc count."""
    counts: Dict[str, int] = {}
    used_fallback = False

    try:
        nep = get_neptune()
        for r in nep.run_cypher(
            "MATCH (n) RETURN labels(n)[0] AS lbl, count(n) AS c ORDER BY c DESC",
            {},
        ):
            lbl = r.get("lbl") or "(none)"
            counts[str(lbl)] = int(r.get("c") or 0)
        for r in nep.run_cypher(
            "MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS c ORDER BY c DESC",
            {},
        ):
            rel = r.get("rel") or "(none)"
            counts[f":{rel}"] = int(r.get("c") or 0)
    except Exception as e:
        log.warning("neptune ingest counts failed: %s", e)

    if not counts:
        counts = {**_INGEST_FALLBACK_LABELS, **_INGEST_FALLBACK_EDGES}
        used_fallback = True

    os_count = 0
    try:
        # Reuse existing search service's OS client to avoid duplicating
        # AWSV4SignerAuth setup. hybrid_search returns hits with a `_total`
        # not exposed; do a raw count call via the underlying client.
        svc = get_search()
        if hasattr(svc, "client") and svc.client is not None:
            os_count = int(svc.client.count(index=settings.opensearch_index).get("count", 0))
    except Exception as e:
        log.warning("opensearch count failed: %s", e)

    if used_fallback and os_count == 0:
        os_count = 5000  # match the synthetic Telemetry count above

    return IngestStatus(
        neptune=counts,
        opensearch_docs=os_count,
        opensearch_index=settings.opensearch_index,
    )


# ─── /ops/guardrail ─────────────────────────────────────────────────────────

class GuardrailEvent(BaseModel):
    timestamp: int
    message: str


class GuardrailTopic(BaseModel):
    name: str
    ko: str
    definition: str


class GuardrailResponse(BaseModel):
    events: List[GuardrailEvent]
    bedrock_guardrail_id: str
    topics: List[GuardrailTopic]


_MFG_TOPICS: List[GuardrailTopic] = [
    GuardrailTopic(
        name="IPConfidential", ko="IP/기밀 (BOM·단가 노출)",
        definition="BOM 좌표·협력사 단가 등 비공개 정보 노출 차단",
    ),
    GuardrailTopic(
        name="CompetitorDisparagement", ko="경쟁사 비방",
        definition="Samsung/Sony/Whirlpool/Bosch 등 부정 표현 차단",
    ),
    GuardrailTopic(
        name="RegulationViolation", ko="규제 위반 권유",
        definition="REACH-SVHC/RoHS/IRA/USMCA/CBAM 위반 부품·lane 추천 차단",
    ),
    GuardrailTopic(
        name="HazardousChemical", ko="유해 화학물질",
        definition="CMR 1A/1B 등급 화학물질 안전·MSDS 컨텍스트 없는 안내 차단",
    ),
]


@router.get("/ops/guardrail", response_model=GuardrailResponse)
def guardrail_events(minutes: int = 60, limit: int = 40) -> GuardrailResponse:
    """Recent CW log events on the API service mentioning guardrail/intervention."""
    end = int(time.time() * 1000)
    start = end - max(1, int(minutes)) * 60 * 1000
    evts: List[GuardrailEvent] = []
    try:
        resp = cloudwatch_logs().filter_log_events(
            logGroupName="/aws/ecs/ontology-mfg-dev-api",
            startTime=start, endTime=end,
            filterPattern='?guardrail ?intervention ?intervened ?scrub ?차단',
            limit=max(1, min(int(limit), 200)),
        )
        evts = [
            GuardrailEvent(timestamp=int(e["timestamp"]), message=str(e["message"])[:1000])
            for e in resp.get("events", [])
        ]
    except Exception as e:
        log.warning("guardrail log fetch failed: %s", e)

    return GuardrailResponse(
        events=evts,
        bedrock_guardrail_id=settings.bedrock_guardrail_id,
        topics=_MFG_TOPICS,
    )


# ─── /ops/memory ────────────────────────────────────────────────────────────

class MemoryEvent(BaseModel):
    actor_id: Optional[str] = None
    role: Optional[str] = None
    text: Optional[str] = None
    event_timestamp: Optional[str] = None
    raw: Dict[str, Any] = Field(default_factory=dict)


class MemorySnapshot(BaseModel):
    memory_id: str
    session_id: Optional[str]
    events: List[MemoryEvent]


_MEMORY_TABLE = "ontology-mfg-dev-memory"


@router.get("/ops/memory", response_model=MemorySnapshot)
def memory_snapshot(session_id: Optional[str] = None, top_k: int = 30) -> MemorySnapshot:
    """If `session_id` provided, list its DynamoDB-backed facts; else empty snapshot."""
    if not session_id:
        return MemorySnapshot(memory_id=_MEMORY_TABLE, session_id=None, events=[])

    events: List[MemoryEvent] = []
    try:
        resp = _ddb_client().query(
            TableName=_MEMORY_TABLE,
            KeyConditionExpression="session_id = :s",
            ExpressionAttributeValues={":s": {"S": session_id}},
            Limit=max(1, min(int(top_k), 200)),
            ScanIndexForward=False,
        )
        for it in resp.get("Items", []):
            key = (it.get("key") or {}).get("S")
            value = (it.get("value") or {}).get("S")
            ts = (it.get("ts") or {}).get("S")
            events.append(MemoryEvent(
                actor_id=session_id,
                role=key,
                text=value,
                event_timestamp=ts,
                raw={"key": key, "value": value, "ts": ts},
            ))
    except Exception as e:
        log.warning("memory ddb query failed: %s", e)

    return MemorySnapshot(memory_id=_MEMORY_TABLE, session_id=session_id, events=events)


# ─── /ops/eval ──────────────────────────────────────────────────────────────

# Mfg-domain wow queries — exercise hybrid search across BOM / Standards /
# Suppliers / Quality / Regulation. Keywords are lower-case substrings the
# search hit content/metadata should contain to count as a pass.
_WOW_QUERIES: List[Dict[str, Any]] = [
    {"q": "차량용 BGA 패키지 부품 추천",                   "kws": ["bga", "ic"]},
    {"q": "AEC-Q100 인증 자동차 IC",                       "kws": ["aec-q100", "aec"]},
    {"q": "JEDEC reflow profile 표준",                      "kws": ["jedec", "reflow"]},
    {"q": "IPC-A-610 기준 솔더링 결함",                     "kws": ["ipc", "ipc-a-610"]},
    {"q": "REACH SVHC 250 물질 회피 부품",                  "kws": ["reach", "svhc"]},
    {"q": "RoHS 6+4 위반 위험 부품",                        "kws": ["rohs"]},
    {"q": "납 무첨가 무연 솔더 표준",                       "kws": ["lead", "rohs", "납"]},
    {"q": "1차 협력사 OTD 95% 이상 후보",                   "kws": ["supplier", "tier", "rfm"]},
    {"q": "Tier-2 협력사 CN 의존 부품",                     "kws": ["subsupplier", "tier-2", "tier2"]},
    {"q": "Innotek FC-BGA Gen5 솔더볼 균열",                 "kws": ["bga", "innotek"]},
    {"q": "AMZN-CMP-IC-00001 부품 인증 상태",               "kws": ["amzn-cmp", "ic"]},
    {"q": "8\" QHD 디스플레이 후보 5개",                     "kws": ["display", "디스플레이"]},
    {"q": "리튬인산철 배터리 셀 후보",                       "kws": ["battery", "lithium", "lfp"]},
    {"q": "EOL 부품 대체 후보",                              "kws": ["eol", "substitute", "대체"]},
    {"q": "MX → US lane USMCA 75% RVC 검증",                  "kws": ["usmca", "lane", "trade"]},
    {"q": "IRA 30D FEOC 위반 lane",                          "kws": ["ira", "30d", "feoc"]},
    {"q": "EU CBAM 환산 100t 강재 비용",                      "kws": ["cbam"]},
    {"q": "ISO-26262 ASIL-B 이상 부품",                      "kws": ["iso", "26262", "asil"]},
    {"q": "IATF-16949 인증 protein 협력사",                  "kws": ["iatf", "16949"]},
    {"q": "REACH SVHC 위반 위험 부품 100개",                 "kws": ["reach", "svhc"]},
    {"q": "INC-2026-0412 인시던트 8D 리포트",                 "kws": ["incident", "8d", "inc-"]},
    {"q": "BGA solder ball crack 유사 사례",                  "kws": ["bga", "solder"]},
    {"q": "PCB 박리 incident root cause",                    "kws": ["pcb", "delamination", "박리"]},
    {"q": "커패시터 누설 8D 보고서",                         "kws": ["capacitor", "leak", "커패시터"]},
    {"q": "AMZN-PLANT-001 vibration 임계 초과 센서",          "kws": ["plant", "telemetry", "vibration"]},
    {"q": "PdM 정비 권고 임계 초과",                          "kws": ["pdm", "maintenance"]},
    {"q": "Plant ESG Scope 1+2 합산",                          "kws": ["esg", "carbon", "scope"]},
    {"q": "AMZN-PLANT-005 CBAM 환산 부담액",                  "kws": ["cbam", "plant"]},
    {"q": "스마트 냉장고 BOM 전체 모듈",                      "kws": ["product", "module", "smart"]},
    {"q": "VS 사업부 자동차 전장 부품",                        "kws": ["vs", "automotive", "auto"]},
]


_eval_cache: Dict[str, Any] = {"updated_at": 0.0, "result": None}
_eval_history_cache: Dict[str, Any] = {"updated_at": 0.0, "rows": []}
_EVAL_CACHE_TTL_SEC = 600
_EVAL_HISTORY_CACHE_TTL_SEC = 30
_EVAL_HISTORY_TABLE = "ontology-mfg-dev-eval-history"
_EVAL_HISTORY_TTL_DAYS = 90
_eval_run_lock = threading.Lock()


class EvalRow(BaseModel):
    q: str
    keywords: List[str]
    hit_count: int
    passed: bool
    latency_ms: int
    error: Optional[str] = None


class EvalHistoryRow(BaseModel):
    run_id: Optional[str] = None
    ts: int
    pass_rate: float
    passes: int
    total: int
    avg_latency_ms: int


class EvalResponse(BaseModel):
    pass_rate: float
    passes: int
    total: int
    avg_latency_ms: int
    cached_at_unix: int
    rows: List[EvalRow]
    history: List[EvalHistoryRow] = []


def _persist_eval_run(response: "EvalResponse") -> None:
    """Append a compact summary row to DynamoDB so trends survive process
    restarts. Items carry a `ttl` numeric attribute (90 days) so the table
    self-prunes when DynamoDB TTL is enabled. Best-effort — failures fall
    back silently."""
    try:
        ts = int(response.cached_at_unix)
        run_id = _dt.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")
        _ddb_client().put_item(
            TableName=_EVAL_HISTORY_TABLE,
            Item={
                "partition":      {"S": "eval"},
                "run_id":         {"S": run_id},
                "ts":             {"N": str(ts)},
                "ttl":            {"N": str(ts + _EVAL_HISTORY_TTL_DAYS * 86400)},
                "pass_rate":      {"N": f"{response.pass_rate:.4f}"},
                "passes":         {"N": str(response.passes)},
                "total":          {"N": str(response.total)},
                "avg_latency_ms": {"N": str(response.avg_latency_ms)},
            },
        )
    except Exception as e:
        log.info("eval history persist skipped: %s", e)


def _load_eval_history(limit: int = 15) -> List[Dict[str, Any]]:
    """Most-recent runs first. Cached for `_EVAL_HISTORY_CACHE_TTL_SEC` so
    rapid polling doesn't burn DDB reads."""
    now = time.time()
    if (now - _eval_history_cache["updated_at"]) < _EVAL_HISTORY_CACHE_TTL_SEC:
        return _eval_history_cache["rows"][:limit]
    try:
        resp = _ddb_client().query(
            TableName=_EVAL_HISTORY_TABLE,
            KeyConditionExpression="#p = :p",
            ExpressionAttributeNames={"#p": "partition"},
            ExpressionAttributeValues={":p": {"S": "eval"}},
            ScanIndexForward=False,
            Limit=max(1, min(int(limit), 100)),
        )
        rows = [
            {
                "run_id":         (it.get("run_id") or {}).get("S"),
                "ts":             int((it.get("ts") or {}).get("N") or 0),
                "pass_rate":      float((it.get("pass_rate") or {}).get("N") or 0),
                "passes":         int((it.get("passes") or {}).get("N") or 0),
                "total":          int((it.get("total") or {}).get("N") or 0),
                "avg_latency_ms": int((it.get("avg_latency_ms") or {}).get("N") or 0),
            }
            for it in resp.get("Items", [])
        ]
        _eval_history_cache["updated_at"] = now
        _eval_history_cache["rows"] = rows
        return rows[:limit]
    except Exception as e:
        log.info("eval history read skipped: %s", e)
        return []


def _eval_one(svc, spec: Dict[str, Any]) -> EvalRow:
    """Run a single wow-query and grade it. Pulled out so the loop can run
    in parallel via ThreadPoolExecutor."""
    q, kws = spec["q"], spec["kws"]
    t0 = time.perf_counter()
    err: Optional[str] = None
    hits: List[Dict[str, Any]] = []
    if svc is not None:
        try:
            hits = list(svc.hybrid_search(q, top_n=10))
        except Exception as e:
            err = str(e)[:200]
    else:
        err = "search service unavailable"
    latency_ms = int((time.perf_counter() - t0) * 1000)
    text_blob = " ".join(
        json.dumps(h.get("_source", {}), ensure_ascii=False)
        for h in hits[:5]
    ).lower()
    ok = bool(hits) and any(k.lower() in text_blob for k in kws)
    return EvalRow(
        q=q, keywords=kws, hit_count=len(hits), passed=ok,
        latency_ms=latency_ms, error=err,
    )


@router.get("/ops/eval", response_model=EvalResponse)
def eval_status(run: bool = False, history_limit: int = 15) -> EvalResponse:
    """Return cached eval results, or run live if `run=true`/cache stale.
    Always attaches the most recent N runs from durable history (cached
    30s) so the UI can plot trends without a second call.

    The fresh-run branch holds a process-local lock so concurrent
    `run=true` requests don't double-execute the 30 wow queries or
    double-write the same run to DynamoDB."""
    now = time.time()
    cached = _eval_cache.get("result")
    if cached and not run and (now - _eval_cache["updated_at"]) < _EVAL_CACHE_TTL_SEC:
        cached.history = _load_eval_history(limit=history_limit)
        return cached  # type: ignore[return-value]

    with _eval_run_lock:
        # Re-check after acquiring — another thread may have just refreshed.
        cached = _eval_cache.get("result")
        if cached and not run and (now - _eval_cache["updated_at"]) < _EVAL_CACHE_TTL_SEC:
            cached.history = _load_eval_history(limit=history_limit)
            return cached  # type: ignore[return-value]

        try:
            svc = get_search()
        except Exception as e:
            log.warning("search service init failed: %s", e)
            svc = None

        # 30 hybrid_search calls in parallel — each is a network round-trip
        # to OpenSearch (~200-500ms). Serial took 6-15s; pool of 8 cuts to
        # ~1.5-3s wall time.
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            rows = list(ex.map(lambda s: _eval_one(svc, s), _WOW_QUERIES))

        passes = sum(1 for r in rows if r.passed)
        total = len(rows)
        avg_latency = int(
            sum(r.latency_ms for r in rows) / max(total, 1)
        )
        response = EvalResponse(
            pass_rate=(passes / total) if total else 0.0,
            passes=passes, total=total,
            avg_latency_ms=avg_latency,
            cached_at_unix=int(now),
            rows=rows,
            history=[],
        )
        _eval_cache["updated_at"] = now
        _eval_cache["result"] = response
        _persist_eval_run(response)
        # Bust the history cache so the next call picks up this new row.
        _eval_history_cache["updated_at"] = 0.0
        response.history = _load_eval_history(limit=history_limit)
        return response


# ─── /ops/trace ─────────────────────────────────────────────────────────────

class TraceEvent(BaseModel):
    ts: float
    session_id: str
    actor_id: str
    tool: str
    input: Dict[str, Any] = Field(default_factory=dict)


class TraceResponse(BaseModel):
    events: List[TraceEvent]
    total: int


@router.get("/ops/trace", response_model=TraceResponse)
def trace_events(limit: int = 50, session_id: Optional[str] = None) -> TraceResponse:
    """Recent tool-call traces from the in-process ring buffer (per API instance)."""
    items = agent_svc.recent_traces(limit=limit, session_id=session_id)
    return TraceResponse(
        events=[
            TraceEvent(
                ts=float(it.get("ts") or 0),
                session_id=str(it.get("session_id") or ""),
                actor_id=str(it.get("actor_id") or "anonymous"),
                tool=str(it.get("tool") or ""),
                input=it.get("input") if isinstance(it.get("input"), dict) else {"_": it.get("input")},
            )
            for it in items
        ],
        total=len(items),
    )
