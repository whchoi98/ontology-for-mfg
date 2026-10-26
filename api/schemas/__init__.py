# api/schemas — central response model registry
"""Pydantic response models for the synchronous scenario routers
(non-SSE). Each scenario router declares its top-level response shape
here so FastAPI auto-validates the body and the OpenAPI spec stays
machine-usable.

Models intentionally use `model_config = {"extra": "allow"}` because
the routers attach ad-hoc enrichment fields (`_synthetic`, debug
metadata, derived counts) that we don't want to enumerate but also
don't want the validator to strip. The strict-typed fields are the
contract; everything else is best-effort.

SSE routers (chat, eight_d, insights) intentionally do NOT have a
response_model — streaming bodies cannot be modeled at the FastAPI
boundary. See api/schemas/sse.py for their event-payload schemas.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class _LooseModel(BaseModel):
    """Base — allows extra fields so router-side enrichment doesn't break."""

    model_config = ConfigDict(extra="allow")


# ─── Search (A) ────────────────────────────────────────────────────────────


class CytoscapeNode(_LooseModel):
    data: dict[str, Any]


class CytoscapeEdge(_LooseModel):
    data: dict[str, Any]


class CytoscapeSubgraph(_LooseModel):
    nodes: list[CytoscapeNode] = Field(default_factory=list)
    edges: list[CytoscapeEdge] = Field(default_factory=list)


class SearchResponse(_LooseModel):
    hits: list[dict[str, Any]] = Field(default_factory=list)
    subgraph: CytoscapeSubgraph = Field(default_factory=CytoscapeSubgraph)


# Used by both /substitute and /spec-match — same fields, distinct only
# in domain semantics (substitute candidate vs spec-match candidate).
class Candidate(_LooseModel):
    id: str | None = None
    name: str | None = None
    score: float | None = None
    standards: list[str] | None = None


# ─── Substitute (F) ────────────────────────────────────────────────────────

SubstituteCandidate = Candidate


class SubstituteResponse(_LooseModel):
    original: dict[str, Any] | None = None
    candidates: list[Candidate] = Field(default_factory=list)
    subgraph: CytoscapeSubgraph | None = None


# ─── Compliance (E) ────────────────────────────────────────────────────────


class ComplianceViolation(_LooseModel):
    rule: str | None = None
    regulation: str | None = None
    substance: str | None = None
    detail: str | None = None
    severity: str | None = None


class ComplianceResponse(_LooseModel):
    component_id: str | None = None
    compliant: bool | None = None
    violations: list[ComplianceViolation] = Field(default_factory=list)


# ─── Price (G) ─────────────────────────────────────────────────────────────


class PriceOffer(_LooseModel):
    supplier_id: str | None = None
    supplier_name: str | None = None
    region: str | None = None
    leadtime_days: int | None = None
    otd: float | None = None
    unit_price_usd: float | None = None
    score: float | None = None


class PriceResponse(_LooseModel):
    component_id: str | None = None
    offers: list[PriceOffer] = Field(default_factory=list)
    best_supplier_id: str | None = None
    subgraph: CytoscapeSubgraph | None = None


# ─── Spec Match (D) ────────────────────────────────────────────────────────

SpecCandidate = Candidate


class SpecMatchResponse(_LooseModel):
    candidates: list[Candidate] = Field(default_factory=list)
    subgraph: CytoscapeSubgraph | None = None


# ─── Supplier RFM (I) ──────────────────────────────────────────────────────


class RfmRow(_LooseModel):
    id: str | None = None
    name: str | None = None
    region: str | None = None
    rfm_score: float | None = None


class SupplierRfmResponse(_LooseModel):
    tier: int | None = None
    ranked: list[RfmRow] = Field(default_factory=list)


# ─── PdM (L) ───────────────────────────────────────────────────────────────


class PdmSensor(_LooseModel):
    sensor_id: str | None = None
    metric: str | None = None
    unit: str | None = None
    plant_id: str | None = None


class PdmAlert(_LooseModel):
    sensor_id: str | None = None
    severity: str | None = None
    message: str | None = None


class PdmResponse(_LooseModel):
    sensors: list[PdmSensor] = Field(default_factory=list)
    alerts: list[PdmAlert] = Field(default_factory=list)
