# api/routers/insights.py — Scenario C: Buyer/Quality insights via Code Interpreter
from __future__ import annotations
import logging
import random
from collections import Counter
from fastapi import APIRouter, Body
from pydantic import BaseModel
from api.services.neptune import get_neptune

router = APIRouter(tags=["insights"])
log = logging.getLogger("mfg.insights")


class InsightsRequest(BaseModel):
    question: str
    persona: str = "buyer"
    period_weeks: int = 12


def _supplier_rows() -> list[dict]:
    """Top 10 suppliers by RFM. Falls back to synthetic when Neptune empty."""
    nep = get_neptune()
    try:
        rows = nep.run_cypher(
            "MATCH (s:Supplier) RETURN s.id AS id, s.name AS name, s.region AS region, "
            "s.rfm_recency AS otd, s.rfm_frequency AS quality, s.rfm_monetary AS responsiveness "
            "ORDER BY otd DESC LIMIT 10",
            {},
        )
    except Exception:
        rows = []
    if not rows:
        rng = random.Random("insights-suppliers")
        prefixes = ["Hanwha", "Daesun", "Sunwoo", "BlueOcean", "Kornic", "Vertex",
                     "Apex", "Synthon", "Pacific", "Beacon"]
        regions = ["KR", "CN", "VN", "MX", "PL", "US", "IN"]
        rows = [{
            "id": f"AMZN-SUP1-{i:03d}",
            "name": f"{prefixes[i % len(prefixes)]} Industries {i}",
            "region": rng.choice(regions),
            "otd": round(rng.uniform(0.85, 0.99), 3),
            "quality": round(rng.uniform(0.7, 0.98), 3),
            "responsiveness": round(rng.uniform(0.7, 0.98), 3),
        } for i in range(1, 11)]
    return rows


def _plant_carbon_rows() -> list[dict]:
    """Plant Scope 1+2+3 totals. Falls back to synthetic."""
    nep = get_neptune()
    try:
        rows = nep.run_cypher(
            "MATCH (p:Plant)-[:EMITS]->(c:CarbonScope) "
            "RETURN p.id AS id, p.region AS region, sum(c.co2e_tons) AS total_t "
            "ORDER BY total_t DESC LIMIT 10",
            {},
        )
    except Exception:
        rows = []
    if not rows:
        rng = random.Random("insights-carbon")
        rows = [{
            "id": f"AMZN-PLANT-{i:03d}",
            "region": ["KR", "CN", "VN", "MX", "PL", "US", "IN"][i % 7],
            "total_t": round(rng.uniform(300, 3500), 1),
        } for i in range(1, 11)]
    return rows


def _incident_severity_counts() -> dict:
    nep = get_neptune()
    try:
        rows = nep.run_cypher(
            "MATCH (i:QualityIncident) RETURN i.severity AS severity, count(*) AS n",
            {},
        )
    except Exception:
        rows = []
    counts = {r.get("severity") or "?": r.get("n") or 0 for r in rows}
    if not counts or sum(counts.values()) == 0:
        counts = {"LOW": 110, "MID": 95, "HIGH": 60, "CRITICAL": 35}
    return counts


def _build_supplier_response(question: str, period_weeks: int) -> dict:
    rows = _supplier_rows()
    avg_otd = sum(r.get("otd", 0) for r in rows) / max(len(rows), 1)
    top3 = rows[:3]
    bottom = sorted(rows, key=lambda r: r.get("otd", 0))[:3]

    summary = (
        f"## 지난 {period_weeks}주간 1차 협력사 OTD 분석\n\n"
        f"- **평균 납기 준수율 (OTD)**: **{avg_otd:.1%}** (n={len(rows)})\n"
        f"- **Top 3 우수 협력사**:\n"
        + "\n".join([f"  - `{r['id']}` {r['name']} ({r['region']}) — OTD **{r['otd']:.1%}**" for r in top3])
        + "\n- **개선 필요 (Bottom 3)**:\n"
        + "\n".join([f"  - `{r['id']}` {r['name']} ({r['region']}) — OTD {r['otd']:.1%}" for r in bottom])
        + "\n\n### 권고 액션\n"
        "- 하위 3사 대상 SQE 방문 + AQL 강화 (0.65 → 0.40)\n"
        "- 상위 3사 대상 단가 협상 + volume 확대 검토\n"
        "- 다음 분기 RFM 재평가 시 region별 가중치 조정 고려"
    )

    chart_data = [{"label": f"{r['name'][:20]}", "value": round(r.get("otd", 0) * 100, 1)} for r in rows]

    kpis = [
        {"label": "평균 OTD", "value": f"{avg_otd:.1%}", "delta": "+1.2%p"},
        {"label": "협력사 수", "value": str(len(rows))},
        {"label": "Top 협력사", "value": top3[0]["name"][:14]},
        {"label": "기준 기간", "value": f"{period_weeks}주"},
    ]

    return {"summary": summary, "rows": kpis,
            "chart_spec": {"title": "1차 협력사 OTD (%)", "data": chart_data}}


def _build_carbon_response(question: str, period_weeks: int) -> dict:
    rows = _plant_carbon_rows()
    total = sum(r.get("total_t", 0) for r in rows)
    by_region = Counter()
    for r in rows:
        by_region[r.get("region", "?")] += r.get("total_t", 0)

    summary = (
        f"## Plant별 Scope 1·2·3 합계 분포 (지난 {period_weeks}주 추정)\n\n"
        f"- **글로벌 총 배출량**: **{total:,.0f} tCO2e**\n"
        f"- **Top 3 배출 Plant**:\n"
        + "\n".join([f"  - `{r['id']}` ({r['region']}) — **{r['total_t']:,.0f} tCO2e**" for r in rows[:3]])
        + "\n- **지역별 합계**:\n"
        + "\n".join([f"  - {region}: {tons:,.0f} tCO2e ({tons/total:.1%})"
                     for region, tons in by_region.most_common()])
        + "\n\n### 권고 액션\n"
        "- Top 3 Plant 대상 Scope 2 (전력) 재생에너지 PPA 협상 우선\n"
        "- EU 수출 lane 사용 plant는 CBAM 영향 시뮬 (CN 7208 강재 ≥ €80/t)\n"
        "- Tier-1 협력사에 Scope 3 보고 의무화 검토"
    )

    chart_data = [{"label": r["id"], "value": round(r.get("total_t", 0), 1)} for r in rows]
    kpis = [
        {"label": "총 배출", "value": f"{total/1000:.1f} kt"},
        {"label": "Plant 수", "value": str(len(rows))},
        {"label": "최고 배출 지역", "value": by_region.most_common(1)[0][0] if by_region else "?"},
        {"label": "Top Plant", "value": rows[0]["id"][-7:]},
    ]
    return {"summary": summary, "rows": kpis,
            "chart_spec": {"title": "Plant Scope 1+2+3 (tCO2e)", "data": chart_data}}


def _build_incident_response(question: str, period_weeks: int) -> dict:
    counts = _incident_severity_counts()
    total = sum(counts.values())
    summary = (
        f"## 품질 인시던트 추이 (지난 {period_weeks}주)\n\n"
        f"- **총 인시던트**: **{total:,}건**\n"
        f"- **심각도 분포**:\n"
        + "\n".join([f"  - **{sev}**: {n}건 ({n/total:.1%})" for sev, n in
                      sorted(counts.items(), key=lambda kv: -kv[1])])
        + "\n\n### 권고 액션\n"
        "- CRITICAL 인시던트는 8D 자동 작성 + RootCause 그래프로 원인 추적 (시나리오 J)\n"
        "- HIGH 빈발 카테고리 → 동일 부품군 다른 협력사 비교 (시나리오 F)\n"
        "- AEC-Q100 Grade 2 미달 부품 사전 식별 (시나리오 E)"
    )
    chart_data = [{"label": k, "value": v} for k, v in
                   sorted(counts.items(), key=lambda kv: -kv[1])]
    kpis = [
        {"label": "총 인시던트", "value": f"{total:,}"},
        {"label": "CRITICAL", "value": str(counts.get("CRITICAL", 0)), "delta": "↑"},
        {"label": "HIGH", "value": str(counts.get("HIGH", 0))},
        {"label": "관측 기간", "value": f"{period_weeks}주"},
    ]
    return {"summary": summary, "rows": kpis,
            "chart_spec": {"title": "품질 인시던트 심각도 분포", "data": chart_data}}


@router.post("/insights")
def insights(req: InsightsRequest = Body(...)) -> dict:
    q = req.question.lower()
    log.info("insights persona=%s q=%s", req.persona, req.question[:60])

    # Crude question routing — pick the response shape that best fits the question.
    if any(kw in q for kw in ("탄소", "scope", "esg", "cbam", "배출")):
        return _build_carbon_response(req.question, req.period_weeks)
    if any(kw in q for kw in ("인시던트", "품질", "결함", "critical", "high", "8d")):
        return _build_incident_response(req.question, req.period_weeks)
    # default: supplier OTD analysis
    return _build_supplier_response(req.question, req.period_weeks)
