"""Pydantic schemas for 22 ontology classes (mfg).

Mirrors ontology spec § 8.1. Each class corresponds to one Neptune label.
"""
from __future__ import annotations
from datetime import date
from typing import Optional, Literal
from pydantic import BaseModel, Field


# --- BOM 계층 (4) ---
class Product(BaseModel):
    id: str
    name: str
    line: str  # e.g. "VisionOLED"
    division: Literal["HA", "HE", "VS", "INNOTEK", "MAGNA"]
    brand: str = "AMZN Tech"
    sku_code: Optional[str] = None


class Module(BaseModel):
    id: str
    name: str
    category: str  # e.g. "Display Module"
    parent_product_ids: list[str] = []


class Component(BaseModel):
    id: str
    name: str
    category: str  # e.g. "IC", "PCB", "Connector"
    standards: list[str] = []
    substances: list[str] = []  # CAS-IDs
    eol_date: Optional[date] = None


class RawMaterial(BaseModel):
    id: str
    name: str
    cas_id: Optional[str] = None


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
    division: Optional[str] = None


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
    ks_mapping: Optional[str] = None


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
    cmr_grade: Optional[Literal["1A", "1B", "2"]] = None
    rohs_restricted: bool = False
    reach_svhc: bool = False


# --- 품질 (3) ---
class QualityIncident(BaseModel):
    id: str
    title: str
    component_id: Optional[str] = None
    plant_id: Optional[str] = None
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
    linked_supplier_id: Optional[str] = None
    linked_component_id: Optional[str] = None
    linked_plant_id: Optional[str] = None


# --- 운영 / ESG (4) ---
class Telemetry(BaseModel):
    sensor_id: str
    plant_id: Optional[str] = None
    component_id: Optional[str] = None
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


class CarbonScope(BaseModel):
    plant_id: str
    scope: Literal[1, 2, 3]
    period: str  # YYYY-MM
    co2e_tons: float
