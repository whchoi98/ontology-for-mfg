"""Pydantic schemas for 22 ontology classes (mfg).

Mirrors ontology spec § 8.1. Each class corresponds to one Neptune label.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, model_validator


# --- BOM 계층 (4) ---
class Product(BaseModel):
    id: str
    name: str
    line: str  # e.g. "VisionOLED"
    division: Literal["HA", "HE", "VS", "INNOTEK", "MAGNA"]
    brand: str = "AMZN Tech"
    sku_code: str | None = None
    manufacturer_id: str | None = None  # FK -> Manufacturer (MANUFACTURED_BY)
    customer_ids: list[str] = []  # FK list -> CustomerAccount (SOLD_TO)


class Module(BaseModel):
    id: str
    name: str
    category: str  # e.g. "Display Module"
    parent_product_ids: list[str] = []


class SupplyOffer(BaseModel):
    """One approved-vendor entry of a Component -> SUPPLIED_BY edge properties."""

    supplier_id: str
    leadtime: int  # days
    otd: float  # on-time-delivery ratio 0..1
    unit_price_usd: float
    moq: int


class Component(BaseModel):
    id: str
    name: str
    category: str  # e.g. "IC", "PCB", "Connector"
    standards: list[str] = []  # FK list -> Standard (CONFORMS_TO)
    substances: list[str] = []  # CAS-IDs, FK list -> Substance (CONTAINS_SUBSTANCE)
    eol_date: date | None = None
    module_ids: list[str] = []  # FK list -> Module (CONSISTS_OF, reversed)
    raw_material_ids: list[str] = []  # FK list -> RawMaterial (MADE_OF)
    supply: list[SupplyOffer] = []  # -> Supplier (SUPPLIED_BY, offer fields = edge props)


class RawMaterial(BaseModel):
    id: str
    name: str
    cas_id: str | None = None


# --- Supply 양면 (5) ---
class Manufacturer(BaseModel):
    id: str
    name: str
    division: Literal["HA", "HE", "VS", "INNOTEK", "MAGNA"]


class Supplier(BaseModel):
    id: str
    name: str
    tier: Literal[1, 2] = 1
    region: str  # e.g. "KR"
    rfm_recency: float = 0.0
    rfm_frequency: float = 0.0
    rfm_monetary: float = 0.0


class SubSupplier(BaseModel):
    id: str
    name: str
    parent_supplier_id: str
    region: str
    # Tier-2 RFM — read by /supplier-rfm (tier=2) exactly like Supplier.rfm_*
    rfm_recency: float = 0.0
    rfm_frequency: float = 0.0
    rfm_monetary: float = 0.0


class CustomerAccount(BaseModel):
    id: str
    name: str  # e.g. "Global Auto OEM A"
    segment: Literal["AUTO_OEM", "TIER1", "APPLIANCE_DIST", "TELECOM", "OTHER"]
    region: str


class Plant(BaseModel):
    id: str
    name: str
    region: str
    operator: Literal["SELF", "SUPPLIER"] = "SELF"
    division: str | None = None
    manufacturer_id: str | None = None  # FK -> Manufacturer (OPERATES, reversed); SELF plants only


# --- Geo / 운송 (2) ---
class Region(BaseModel):
    id: str  # ISO-3166-1 alpha-2 e.g. "KR"
    name: str
    name_ko: str


class TradeLane(BaseModel):
    id: str
    origin_region: str
    dest_region: str
    mode: Literal["SEA", "AIR", "RAIL", "ROAD"]
    transit_days: int
    regulations: list[str] = []  # IRA / USMCA / CBAM


# --- 표준 / 규제 (4) ---
class Standard(BaseModel):
    id: str  # e.g. "AEC-Q100"
    family: Literal["JEDEC", "IPC", "AEC-Q", "IATF", "ISO", "OTHER"]
    title: str
    ks_mapping: str | None = None


class Certification(BaseModel):
    id: str
    target_id: str  # Plant or Component
    standard_id: str
    expires: date


class Regulation(BaseModel):
    id: str  # e.g. "REACH-SVHC", "RoHS", "CBAM", "IRA-30D", "USMCA-Auto75"
    region: str  # "EU", "US", "KR"
    title: str


class Substance(BaseModel):
    cas_id: str  # CAS Registry Number
    name: str
    cmr_grade: Literal["1A", "1B", "2"] | None = None
    rohs_restricted: bool = False
    reach_svhc: bool = False
    regulation_ids: list[str] = []  # FK list -> Regulation (REGULATED_BY)


# --- 품질 (3) ---
class QualityIncident(BaseModel):
    id: str
    title: str
    component_id: str | None = None
    plant_id: str | None = None
    severity: Literal["LOW", "MID", "HIGH", "CRITICAL"]
    occurred_at: date


class EightDReport(BaseModel):
    id: str
    incident_id: str
    d1_team: str
    d2_problem: str
    d3_containment: str
    d4_root_cause: str
    d5_corrective: str
    d6_implemented: str
    d7_prevention: str
    d8_closure: str


class RootCause(BaseModel):
    id: str
    description: str
    incident_id: str | None = None  # joins EightDReport.incident_id (IDENTIFIES)
    linked_supplier_id: str | None = None
    linked_component_id: str | None = None
    linked_plant_id: str | None = None


# --- 운영 / ESG (4) ---
class Telemetry(BaseModel):
    sensor_id: str
    plant_id: str | None = None
    component_id: str | None = None
    metric: str  # e.g. "vibration_rms_g", "temp_c"
    unit: str


class MaintenanceEvent(BaseModel):
    id: str
    target_id: str  # plant or component
    kind: Literal["PM", "CM", "PdM"]
    occurred_at: date
    duration_hours: float


class ESGIndicator(BaseModel):
    id: str
    plant_id: str
    metric: str  # e.g. "water_use_m3", "waste_kg"
    period: str  # YYYY-MM
    value: float


def carbon_scope_id(plant_id: str, scope: int, period: str) -> str:
    """Deterministic application id for a CarbonScope row (one per plant × scope × period)."""
    return f"CS-{plant_id}-S{scope}-{period}"


class CarbonScope(BaseModel):
    id: str = ""  # derived from (plant_id, scope, period) when not given
    plant_id: str
    scope: Literal[1, 2, 3]
    period: str  # YYYY-MM
    co2e_tons: float

    @model_validator(mode="after")
    def _default_id(self) -> CarbonScope:
        if not self.id:
            self.id = carbon_scope_id(self.plant_id, self.scope, self.period)
        return self
