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
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class _LooseModel(BaseModel):
    """Base — allows extra fields so router-side enrichment doesn't break."""
    model_config = ConfigDict(extra="allow")


# ─── Search (A) ────────────────────────────────────────────────────────────

class CytoscapeNode(_LooseModel):
    data: Dict[str, Any]


class CytoscapeEdge(_LooseModel):
    data: Dict[str, Any]


class CytoscapeSubgraph(_LooseModel):
    nodes: List[CytoscapeNode] = Field(default_factory=list)
    edges: List[CytoscapeEdge] = Field(default_factory=list)


class SearchResponse(_LooseModel):
    hits: List[Dict[str, Any]] = Field(default_factory=list)
    subgraph: CytoscapeSubgraph = Field(default_factory=CytoscapeSubgraph)


# Used by both /substitute and /spec-match — same fields, distinct only
# in domain semantics (substitute candidate vs spec-match candidate).
class Candidate(_LooseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    score: Optional[float] = None
    standards: Optional[List[str]] = None


# ─── Substitute (F) ────────────────────────────────────────────────────────

SubstituteCandidate = Candidate


class SubstituteResponse(_LooseModel):
    original: Optional[Dict[str, Any]] = None
    candidates: List[Candidate] = Field(default_factory=list)
    subgraph: Optional[CytoscapeSubgraph] = None


# ─── Compliance (E) ────────────────────────────────────────────────────────

class ComplianceViolation(_LooseModel):
    rule: Optional[str] = None
    regulation: Optional[str] = None
    substance: Optional[str] = None
    detail: Optional[str] = None
    severity: Optional[str] = None


class ComplianceResponse(_LooseModel):
    component_id: Optional[str] = None
    compliant: Optional[bool] = None
    violations: List[ComplianceViolation] = Field(default_factory=list)


# ─── Price (G) ─────────────────────────────────────────────────────────────

class PriceOffer(_LooseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    region: Optional[str] = None
    leadtime_days: Optional[int] = None
    otd: Optional[float] = None
    unit_price_usd: Optional[float] = None
    score: Optional[float] = None


class PriceResponse(_LooseModel):
    component_id: Optional[str] = None
    offers: List[PriceOffer] = Field(default_factory=list)
    best_supplier_id: Optional[str] = None
    subgraph: Optional[CytoscapeSubgraph] = None


# ─── Spec Match (D) ────────────────────────────────────────────────────────

SpecCandidate = Candidate


class SpecMatchResponse(_LooseModel):
    candidates: List[Candidate] = Field(default_factory=list)
    subgraph: Optional[CytoscapeSubgraph] = None


# ─── Supplier RFM (I) ──────────────────────────────────────────────────────

class RfmRow(_LooseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    region: Optional[str] = None
    rfm_score: Optional[float] = None


class SupplierRfmResponse(_LooseModel):
    tier: Optional[int] = None
    ranked: List[RfmRow] = Field(default_factory=list)


# ─── PdM (L) ───────────────────────────────────────────────────────────────

class PdmSensor(_LooseModel):
    sensor_id: Optional[str] = None
    metric: Optional[str] = None
    unit: Optional[str] = None
    plant_id: Optional[str] = None


class PdmAlert(_LooseModel):
    sensor_id: Optional[str] = None
    severity: Optional[str] = None
    message: Optional[str] = None


class PdmResponse(_LooseModel):
    sensors: List[PdmSensor] = Field(default_factory=list)
    alerts: List[PdmAlert] = Field(default_factory=list)
