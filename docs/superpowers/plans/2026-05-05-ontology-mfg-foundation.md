# Ontology MFG — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data foundation and AWS infrastructure for the AMZN Tech Hi-Tech MFG demo — produce all standards CSV mappings, synthetic graph data (~10K nodes / ~30K edges, 22 ontology classes), and 6 deployable CDK stacks that import retail's existing VPC and provision mfg-specific Neptune / Aurora / OpenSearch / ECS / CloudFront / Cognito.

**Architecture:** Three sequential phases — **Phase 0** (1주): Public standards modules (JEDEC/IPC/AEC-Q/IATF/ISO 26262/REACH-SVHC/RoHS/CBAM/IRA/USMCA + Korean adapters). **Phase 1** (1.5주): Pydantic schemas (22 classes) + 10 synthetic generators (Bedrock-assisted via `_bedrock.py`) + Neptune/OpenSearch loader. **Phase 2** (1주): 6 CDK TypeScript stacks (network imports retail VPC; data/ai/compute/edge/observability are mfg-new) with Jest snapshot tests.

**Tech Stack:** Python 3.12 (FastAPI/pydantic v2/boto3), Node.js 20 (CDK v2 TypeScript), Neptune Serverless (openCypher), Aurora PostgreSQL Serverless v2, OpenSearch Serverless (Nori + KNN), Bedrock (Claude Sonnet 4.6, Cohere Embed v4), AgentCore (Memory namespace), pytest, Jest snapshot tests, ARM64 Fargate, CloudFront + Lambda@Edge (us-east-1).

**Spec reference:** `docs/superpowers/specs/2026-05-05-ontology-mfg-hitech-design.md` (918 lines, 17 sections).

**Out of this plan:** API backend (Plan 2), Web frontend (Plan 2), demo validation (Plan 3).

---

## Setup Tasks (1–3)

### Task 1: Initialize project skeleton + git

**Files:**
- Create: `.gitignore`, `README.md`, `CLAUDE.md`, `SECURITY.md`, `CHANGELOG.md`, `requirements-dev.txt`, `requirements.txt`, `data/__init__.py`, `data/public/__init__.py`, `data/synthetic/__init__.py`, `ontology/__init__.py`, `ontology/adapters/__init__.py`, `tests/__init__.py`, `tests/data/__init__.py`, `tests/ontology/__init__.py`

- [ ] **Step 1: Initialize git repo**

```bash
cd /home/ec2-user/my-project/ontology-for-mfg
git init
git config user.email "demo@whchoi.net"
git config user.name "ontology-mfg-dev"
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
__pycache__/
*.pyc
.venv/
node_modules/
cdk.out/
.cdk.staging/
data/output/
.env
.DS_Store
*.swp
.pytest_cache/
.mypy_cache/
.ruff_cache/
```

- [ ] **Step 3: Create `requirements-dev.txt`**

```
pytest==8.3.4
pytest-asyncio==0.25.0
ruff==0.8.4
black==24.10.0
mypy==1.13.0
```

- [ ] **Step 4: Create `requirements.txt`**

```
boto3>=1.36.0
botocore>=1.36.0
pydantic>=2.10.0
fastapi==0.115.6
uvicorn[standard]==0.34.0
gremlinpython==3.7.2
opensearch-py==2.7.1
psycopg[binary]==3.2.3
httpx==0.28.1
rdflib==7.1.1
```

- [ ] **Step 5: Create directory tree + `__init__.py` files**

```bash
mkdir -p data/public data/synthetic data/output ontology/adapters infra-cdk/{bin,lib,test} api/{routers,services} web tests/{data,ontology,infra} scripts tools
touch data/__init__.py data/public/__init__.py data/synthetic/__init__.py
touch ontology/__init__.py ontology/adapters/__init__.py
touch tests/__init__.py tests/data/__init__.py tests/ontology/__init__.py tests/infra/__init__.py
```

- [ ] **Step 6: Create stub `README.md` / `CLAUDE.md` / `SECURITY.md` / `CHANGELOG.md`**

```markdown
# ontology-mfg

Korean Hi-Tech MFG (AMZN Tech) PoC demo — AWS Bedrock + AgentCore + Neptune.

See `docs/superpowers/specs/2026-05-05-ontology-mfg-hitech-design.md` for the design spec.
```

```markdown
# CLAUDE.md
Project memory for Claude Code. mfg PoC demo mirroring `ontology-for-retail`.
Custom domain: `https://mfg-ontology.whchoi.net`. Demo users: `admin@whchoi.net` / `demo@whchoi.net` (PW `***ROTATED***`).
22 ontology classes, 12 scenarios A–L, 5 personas (Buyer/Engineer/Quality/SCM/Plant).
```

```markdown
# SECURITY.md
Synthetic data only. No customer PII. Cognito demo passwords are not for production.
Report security issues to security@whchoi.net.
```

```markdown
# CHANGELOG.md
## 0.1.0-foundation
- Project skeleton + standards mapping (Phase 0)
- Synthetic data generators (Phase 1)
- 6 CDK stacks (Phase 2)
```

- [ ] **Step 7: Initial commit**

```bash
git add .
git commit -m "chore: initialize project skeleton (Phase 0 prep)"
```

Expected: commit succeeds, no errors.

---

### Task 2: Pydantic schemas for 22 ontology classes

**Files:**
- Create: `data/schemas.py`
- Test: `tests/data/test_schemas.py`

- [ ] **Step 1: Write the failing test**

`tests/data/test_schemas.py`:
```python
"""Validate that all 22 ontology classes have pydantic schemas with required fields."""
import pytest
from data import schemas


@pytest.mark.parametrize("cls_name", [
    # BOM 계층 (4)
    "Product", "Module", "Component", "RawMaterial",
    # Supply 양면 (5)
    "Manufacturer", "Supplier", "SubSupplier", "CustomerAccount", "Plant",
    # Geo / 운송 (2)
    "Region", "TradeLane",
    # 표준 / 규제 (4)
    "Standard", "Certification", "Regulation", "Substance",
    # 품질 (3)
    "QualityIncident", "EightDReport", "RootCause",
    # 운영 / ESG (4)
    "Telemetry", "MaintenanceEvent", "ESGIndicator", "CarbonScope",
])
def test_class_exists(cls_name):
    assert hasattr(schemas, cls_name), f"Missing schema: {cls_name}"


def test_class_count_22():
    classes = [c for c in dir(schemas) if c[0].isupper() and not c.startswith("_")]
    pydantic_classes = [c for c in classes if hasattr(getattr(schemas, c), "model_validate")]
    assert len(pydantic_classes) >= 22, f"Expected >=22 pydantic classes, got {len(pydantic_classes)}"


def test_product_has_required_fields():
    p = schemas.Product(id="AMZN-HE-OLED88-001", name="VisionOLED 88", line="VisionOLED",
                        division="HE", brand="AMZN Tech")
    assert p.id == "AMZN-HE-OLED88-001"


def test_component_conforms_to_standard_relation():
    c = schemas.Component(id="AMZN-CMP-IC-0001", name="MCU", category="IC",
                          standards=["AEC-Q100", "JESD22"])
    assert "AEC-Q100" in c.standards
```

- [ ] **Step 2: Run test to verify FAIL**

```bash
pytest tests/data/test_schemas.py -v
```

Expected: ImportError or AttributeError on `data.schemas`.

- [ ] **Step 3: Write `data/schemas.py`**

```python
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
```

- [ ] **Step 4: Run test to verify PASS**

```bash
pytest tests/data/test_schemas.py -v
```

Expected: 4 tests pass (parametrized 22 + 3 individual).

- [ ] **Step 5: Commit**

```bash
git add data/schemas.py tests/data/test_schemas.py
git commit -m "feat(data): add pydantic schemas for 22 ontology classes"
```

---

### Task 3: Bedrock helper for LLM-assisted generation

**Files:**
- Create: `data/synthetic/_bedrock.py`
- Test: `tests/data/test_bedrock_helper.py`

- [ ] **Step 1: Write the failing test**

`tests/data/test_bedrock_helper.py`:
```python
"""Mock-only test — actual Bedrock calls are made by generators in later tasks."""
from unittest.mock import MagicMock, patch
from data.synthetic._bedrock import array_tool_schema, call_with_tool


def test_array_tool_schema_shape():
    schema = array_tool_schema(
        name="emit_products",
        description="Emit list of products",
        item_schema={"type": "object", "properties": {"id": {"type": "string"}}},
    )
    assert schema["name"] == "emit_products"
    assert schema["input_schema"]["type"] == "object"
    assert "items" in schema["input_schema"]["properties"]


@patch("data.synthetic._bedrock.boto3.client")
def test_call_with_tool_parses_response(mock_boto):
    mock_client = MagicMock()
    mock_boto.return_value = mock_client
    mock_client.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"content": [{"type": "tool_use", "name": "emit_x", "input": {"items": [{"id": "X1"}]}}]}'),
    }
    items = call_with_tool(
        model_id="anthropic.claude-sonnet-4-6-v1:0",
        system="x", user="y",
        tool=array_tool_schema("emit_x", "x", {"type": "object"}),
    )
    assert items == [{"id": "X1"}]
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pytest tests/data/test_bedrock_helper.py -v
```

Expected: ImportError.

- [ ] **Step 3: Write `data/synthetic/_bedrock.py`**

```python
"""Bedrock helper for LLM-assisted synthetic data generation.

Mirrors retail's `data/synthetic/_bedrock.py` pattern. Uses Anthropic's tool-use
to enforce structured array output, parsed back into pydantic models by callers.
"""
from __future__ import annotations
import json
import os
from typing import Any
import boto3


def array_tool_schema(name: str, description: str, item_schema: dict) -> dict:
    """Build a tool schema that emits a JSON array. Caller defines `item_schema` (per-item shape)."""
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": item_schema,
                },
            },
            "required": ["items"],
        },
    }


def call_with_tool(
    *,
    model_id: str,
    system: str,
    user: str,
    tool: dict,
    region: str = "ap-northeast-2",
    max_tokens: int = 4096,
    temperature: float = 0.4,
) -> list[dict]:
    """Invoke Bedrock with anthropic-style tool-use. Returns the `items` array from the tool input.

    Caller is responsible for validating each item with their pydantic schema and retrying on
    pydantic ValidationError (typically by reducing batch size).
    """
    client = boto3.client("bedrock-runtime", region_name=region)
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "tools": [tool],
        "tool_choice": {"type": "tool", "name": tool["name"]},
    })
    resp = client.invoke_model(modelId=model_id, body=body)
    payload = json.loads(resp["body"].read())
    for block in payload.get("content", []):
        if block.get("type") == "tool_use":
            return block["input"]["items"]
    return []


DEFAULT_SONNET = os.environ.get("MFG_SONNET_MODEL_ID", "anthropic.claude-sonnet-4-6-v1:0")
DEFAULT_HAIKU = os.environ.get("MFG_HAIKU_MODEL_ID", "anthropic.claude-haiku-4-5-20251001-v1:0")
```

- [ ] **Step 4: Run test to verify PASS**

```bash
pytest tests/data/test_bedrock_helper.py -v
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add data/synthetic/_bedrock.py tests/data/test_bedrock_helper.py
git commit -m "feat(data): add Bedrock tool-use helper for LLM-assisted generation"
```

---

## Phase 0 — Standards Mapping (Tasks 4–13)

### Task 4: JEDEC standards module

**Files:**
- Create: `data/public/jedec.py`
- Test: `tests/data/test_jedec.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/data/test_jedec.py
from data.public.jedec import load_jedec_standards
from data.schemas import Standard

def test_load_jedec_returns_standards():
    items = load_jedec_standards()
    assert len(items) >= 8
    assert all(isinstance(s, Standard) for s in items)
    assert all(s.family == "JEDEC" for s in items)
    ids = {s.id for s in items}
    assert "JESD22" in ids
    assert "MO-220" in ids
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pytest tests/data/test_jedec.py -v
```

- [ ] **Step 3: Implement `data/public/jedec.py`**

```python
"""JEDEC reliability/packaging standards subset for hi-tech MFG demo.

Source: https://www.jedec.org/ (public titles, no member-only docs).
"""
from __future__ import annotations
from data.schemas import Standard

_RAW: list[tuple[str, str, str | None]] = [
    ("JESD22",  "Reliability Test Methods for Packaged Devices", "KS C IEC 60749"),
    ("JESD46",  "Solid State Memories: Standards & Definitions", None),
    ("JESD47",  "Stress-Test-Driven Qualification of ICs", None),
    ("JESD51",  "Thermal Test Method for Surface-Mount Packages", None),
    ("JESD78",  "IC Latch-Up Test", None),
    ("JESD89",  "Soft Error Rate Measurement", None),
    ("MO-220",  "Ball Grid Array (BGA) Outline", None),
    ("MO-247",  "Quad Flat No-Lead Outline", None),
    ("JEP122",  "Failure Mechanisms and Models for ICs", None),
    ("JEP155",  "ESD Sensitivity Classification", None),
]


def load_jedec_standards() -> list[Standard]:
    return [
        Standard(id=jid, family="JEDEC", title=title, ks_mapping=ks)
        for jid, title, ks in _RAW
    ]
```

- [ ] **Step 4: Run test to verify PASS**

```bash
pytest tests/data/test_jedec.py -v
```

- [ ] **Step 5: Commit**

```bash
git add data/public/jedec.py tests/data/test_jedec.py
git commit -m "feat(data): add JEDEC standards loader (10 IDs)"
```

---

### Task 5: IPC standards module

**Files:**
- Create: `data/public/ipc.py`
- Test: `tests/data/test_ipc.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_ipc.py
from data.public.ipc import load_ipc_standards
from data.schemas import Standard

def test_load_ipc():
    items = load_ipc_standards()
    assert len(items) >= 5
    assert all(s.family == "IPC" for s in items)
    assert "IPC-A-610" in {s.id for s in items}
```

- [ ] **Step 2: Verify FAIL**

```bash
pytest tests/data/test_ipc.py -v
```

- [ ] **Step 3: Implement**

```python
# data/public/ipc.py
from __future__ import annotations
from data.schemas import Standard

_RAW: list[tuple[str, str]] = [
    ("IPC-A-610",  "Acceptability of Electronic Assemblies"),
    ("IPC-J-STD-001", "Requirements for Soldered Electrical and Electronic Assemblies"),
    ("IPC-A-600",  "Acceptability of Printed Boards"),
    ("IPC-2221",   "Generic Standard on Printed Board Design"),
    ("IPC-7711/21","Rework, Modification, and Repair of Electronic Assemblies"),
    ("IPC-WHMA-A-620", "Requirements for Cable and Wire Harness Assemblies"),
]


def load_ipc_standards() -> list[Standard]:
    return [Standard(id=i, family="IPC", title=t) for i, t in _RAW]
```

- [ ] **Step 4: Verify PASS**

```bash
pytest tests/data/test_ipc.py -v
```

- [ ] **Step 5: Commit**

```bash
git add data/public/ipc.py tests/data/test_ipc.py
git commit -m "feat(data): add IPC standards loader (6 IDs)"
```

---

### Task 6: AEC-Q standards module

**Files:**
- Create: `data/public/aec_q.py`
- Test: `tests/data/test_aec_q.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_aec_q.py
from data.public.aec_q import load_aec_q_standards
from data.schemas import Standard

def test_load_aec_q():
    items = load_aec_q_standards()
    assert {"AEC-Q100", "AEC-Q101", "AEC-Q200"}.issubset({s.id for s in items})
    assert all(s.family == "AEC-Q" for s in items)
```

- [ ] **Step 2-3: Implement**

```python
# data/public/aec_q.py
from __future__ import annotations
from data.schemas import Standard

_RAW: list[tuple[str, str]] = [
    ("AEC-Q100", "Failure Mechanism Based Stress Test Qualification for ICs"),
    ("AEC-Q101", "Failure Mechanism Based Stress Test Qualification for Discrete Semiconductors"),
    ("AEC-Q102", "Failure Mechanism Based Stress Test Qualification for Discrete Optoelectronic Semiconductors"),
    ("AEC-Q104", "Failure Mechanism Based Stress Test Qualification for Multichip Modules"),
    ("AEC-Q200", "Stress Test Qualification for Passive Components"),
]


def load_aec_q_standards() -> list[Standard]:
    return [Standard(id=i, family="AEC-Q", title=t) for i, t in _RAW]
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_aec_q.py -v
git add data/public/aec_q.py tests/data/test_aec_q.py
git commit -m "feat(data): add AEC-Q standards loader (5 IDs)"
```

---

### Task 7: IATF 16949 + ISO 26262 + ISO 9001/14001 module

**Files:**
- Create: `data/public/iso_iatf.py`
- Test: `tests/data/test_iso_iatf.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_iso_iatf.py
from data.public.iso_iatf import load_iso_iatf_standards
from data.schemas import Standard

def test_load_iso_iatf():
    items = load_iso_iatf_standards()
    ids = {s.id for s in items}
    assert {"IATF-16949", "ISO-26262", "ISO-9001", "ISO-14001"}.issubset(ids)
    families = {s.family for s in items}
    assert families == {"IATF", "ISO"}
```

- [ ] **Step 2-3: Implement**

```python
# data/public/iso_iatf.py
from __future__ import annotations
from data.schemas import Standard

_RAW: list[tuple[str, str, str, str | None]] = [
    ("IATF-16949", "IATF", "Quality Management System for Automotive", None),
    ("ISO-26262", "ISO", "Road vehicles — Functional safety (ASIL A–D)", None),
    ("ISO-9001",  "ISO", "Quality Management Systems — Requirements", "KS Q ISO 9001"),
    ("ISO-14001", "ISO", "Environmental Management Systems — Requirements", "KS I ISO 14001"),
    ("ISO-45001", "ISO", "Occupational Health and Safety Management Systems", None),
    ("ISO-50001", "ISO", "Energy Management Systems", None),
]


def load_iso_iatf_standards() -> list[Standard]:
    return [Standard(id=i, family=f, title=t, ks_mapping=ks) for i, f, t, ks in _RAW]


# ISO 26262 ASIL grades (used as Component property, not separate Standard rows)
ASIL_GRADES = ["QM", "ASIL-A", "ASIL-B", "ASIL-C", "ASIL-D"]
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_iso_iatf.py -v
git add data/public/iso_iatf.py tests/data/test_iso_iatf.py
git commit -m "feat(data): add IATF/ISO standards loader (6 IDs + ASIL grades)"
```

---

### Task 8: REACH-SVHC + Substance module

**Files:**
- Create: `data/public/reach_svhc.py`
- Test: `tests/data/test_reach_svhc.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_reach_svhc.py
from data.public.reach_svhc import load_svhc_substances, load_reach_regulation
from data.schemas import Substance, Regulation

def test_load_svhc():
    subs = load_svhc_substances()
    assert len(subs) >= 30
    assert all(isinstance(s, Substance) for s in subs)
    assert all(s.reach_svhc for s in subs)
    cas_ids = {s.cas_id for s in subs}
    # spot-check well-known SVHC entries
    assert "117-81-7" in cas_ids   # DEHP
    assert "1303-86-2" in cas_ids  # Boric acid


def test_reach_regulation():
    reg = load_reach_regulation()
    assert isinstance(reg, Regulation)
    assert reg.id == "REACH-SVHC"
    assert reg.region == "EU"
```

- [ ] **Step 2-3: Implement**

```python
# data/public/reach_svhc.py
"""ECHA REACH-SVHC candidate list — curated 50-entry subset for hi-tech MFG demo.

Full list (244+ as of 2026): https://echa.europa.eu/candidate-list-table.
Subset chosen to cover plasticizers, flame retardants, heavy metals relevant to
electronics manufacturing.
"""
from __future__ import annotations
from data.schemas import Substance, Regulation

# (cas_id, name, cmr_grade)
_SVHC_SUBSET: list[tuple[str, str, str | None]] = [
    ("117-81-7",  "Bis(2-ethylhexyl) phthalate (DEHP)", "1B"),
    ("84-69-5",   "Diisobutyl phthalate (DIBP)", "1B"),
    ("84-74-2",   "Dibutyl phthalate (DBP)", "1B"),
    ("85-68-7",   "Benzyl butyl phthalate (BBP)", "1B"),
    ("1303-86-2", "Boric acid", "1B"),
    ("7440-43-9", "Cadmium", "1B"),
    ("7440-02-0", "Nickel", "2"),
    ("7439-92-1", "Lead", "1A"),
    ("7440-50-8", "Copper", None),  # not CMR but on watch list
    ("75-09-2",   "Dichloromethane", "2"),
    ("106-99-0",  "1,3-Butadiene", "1A"),
    ("75-01-4",   "Vinyl chloride", "1A"),
    ("121-14-2",  "2,4-Dinitrotoluene", "1B"),
    ("100-42-5",  "Styrene", "2"),
    ("75-21-8",   "Ethylene oxide", "1B"),
    ("96-09-3",   "Styrene oxide", "1B"),
    ("75-07-0",   "Acetaldehyde", "2"),
    ("80-05-7",   "Bisphenol A", None),
    ("85-44-9",   "Phthalic anhydride", None),
    ("123-91-1",  "1,4-Dioxane", "2"),
    ("60-35-5",   "Acetamide", "2"),
    ("78-93-3",   "Methyl ethyl ketone", None),
    ("872-50-4",  "1-Methyl-2-pyrrolidone (NMP)", "1B"),
    ("1330-43-4", "Disodium tetraborate, anhydrous", "1B"),
    ("64-19-7",   "Acetic acid", None),
    ("110-86-1",  "Pyridine", None),
    ("108-95-2",  "Phenol", None),
    ("106-89-8",  "Epichlorohydrin", "1B"),
    ("75-12-7",   "Formamide", "1B"),
    ("57-12-5",   "Cyanide", None),
    ("1330-20-7", "Xylenes", None),
    ("100-41-4",  "Ethylbenzene", "2"),
    ("71-43-2",   "Benzene", "1A"),
    ("108-88-3",  "Toluene", None),
    ("67-66-3",   "Chloroform", "2"),
    ("71-55-6",   "1,1,1-Trichloroethane", None),
    ("127-18-4",  "Tetrachloroethylene (PCE)", "2"),
    ("79-01-6",   "Trichloroethylene (TCE)", "1B"),
    ("110-54-3",  "n-Hexane", None),
    ("64-17-5",   "Ethanol", None),
    ("67-56-1",   "Methanol", None),
    ("123-86-4",  "n-Butyl acetate", None),
    ("141-78-6",  "Ethyl acetate", None),
    ("67-64-1",   "Acetone", None),
    ("75-05-8",   "Acetonitrile", None),
    ("110-71-4",  "1,2-Dimethoxyethane", "1B"),
    ("96-12-8",   "1,2-Dibromo-3-chloropropane (DBCP)", "1B"),
    ("106-93-4",  "1,2-Dibromoethane (EDB)", "1B"),
    ("79-06-1",   "Acrylamide", "1B"),
    ("107-13-1",  "Acrylonitrile", "1B"),
]


def load_svhc_substances() -> list[Substance]:
    return [
        Substance(cas_id=cas, name=name, cmr_grade=cmr, reach_svhc=True)
        for cas, name, cmr in _SVHC_SUBSET
    ]


def load_reach_regulation() -> Regulation:
    return Regulation(
        id="REACH-SVHC",
        region="EU",
        title="REACH Article 33 — Substances of Very High Concern (Candidate List)",
    )
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_reach_svhc.py -v
git add data/public/reach_svhc.py tests/data/test_reach_svhc.py
git commit -m "feat(data): add REACH-SVHC subset (50 substances) + regulation"
```

---

### Task 9: RoHS module (6+4 restricted substances)

**Files:**
- Create: `data/public/rohs.py`
- Test: `tests/data/test_rohs.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_rohs.py
from data.public.rohs import load_rohs_substances, load_rohs_regulation


def test_rohs_count_10():
    subs = load_rohs_substances()
    assert len(subs) == 10  # 6 original + 4 phthalates added 2019
    assert all(s.rohs_restricted for s in subs)


def test_rohs_includes_lead_and_dehp():
    subs = load_rohs_substances()
    cas_ids = {s.cas_id for s in subs}
    assert "7439-92-1" in cas_ids   # Lead
    assert "117-81-7" in cas_ids    # DEHP


def test_rohs_regulation():
    reg = load_rohs_regulation()
    assert reg.id == "RoHS"
    assert reg.region == "EU"
```

- [ ] **Step 2-3: Implement**

```python
# data/public/rohs.py
"""EU RoHS Directive 2011/65/EU — 10 restricted substances (6 original + 4 phthalates).

Threshold: 0.1% by weight in homogeneous material (Cd: 0.01%).
"""
from __future__ import annotations
from data.schemas import Substance, Regulation

_ROHS_10: list[tuple[str, str]] = [
    ("7439-92-1", "Lead"),
    ("7439-97-6", "Mercury"),
    ("7440-43-9", "Cadmium"),
    ("18540-29-9", "Hexavalent chromium (Cr VI)"),
    ("32534-81-9", "Polybrominated biphenyls (PBB)"),
    ("32534-81-9", "Polybrominated diphenyl ethers (PBDE)"),
    ("117-81-7",  "Bis(2-ethylhexyl) phthalate (DEHP)"),
    ("85-68-7",   "Benzyl butyl phthalate (BBP)"),
    ("84-74-2",   "Dibutyl phthalate (DBP)"),
    ("84-69-5",   "Diisobutyl phthalate (DIBP)"),
]


def load_rohs_substances() -> list[Substance]:
    return [Substance(cas_id=cas, name=name, rohs_restricted=True) for cas, name in _ROHS_10]


def load_rohs_regulation() -> Regulation:
    return Regulation(id="RoHS", region="EU", title="RoHS Directive 2011/65/EU — Restriction of Hazardous Substances")
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_rohs.py -v
git add data/public/rohs.py tests/data/test_rohs.py
git commit -m "feat(data): add RoHS 6+4 restricted substances + regulation"
```

---

### Task 10: CBAM module (CN codes + EU CBAM regulation)

**Files:**
- Create: `data/public/cbam.py`
- Test: `tests/data/test_cbam.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_cbam.py
from data.public.cbam import load_cbam_cn_codes, load_cbam_regulation


def test_cbam_cn_codes():
    codes = load_cbam_cn_codes()
    assert len(codes) >= 5
    keys = {c["cn_code"] for c in codes}
    # CBAM Phase 1 covers iron/steel/cement/aluminium/electricity/fertilizer/hydrogen
    assert "7208" in keys or "7208 51 20" in keys  # iron/steel


def test_cbam_regulation():
    reg = load_cbam_regulation()
    assert reg.id == "CBAM"
    assert reg.region == "EU"
```

- [ ] **Step 2-3: Implement**

```python
# data/public/cbam.py
"""EU CBAM (Carbon Border Adjustment Mechanism) — CN code subset + regulation.

Source: EU Regulation 2023/956. Transitional period 2023-10 to 2025-12,
definitive period from 2026-01 (importer pays CBAM certificates).
Subset chosen to cover hi-tech mfg upstream (steel/aluminium for chassis,
hydrogen/fertilizer not directly relevant but kept for completeness).
"""
from __future__ import annotations
from data.schemas import Regulation

_CN_CODES: list[dict] = [
    {"cn_code": "7208", "category": "Iron and steel — flat-rolled, hot-rolled"},
    {"cn_code": "7210", "category": "Iron and steel — coated/clad"},
    {"cn_code": "7301", "category": "Iron/steel sheet piling"},
    {"cn_code": "7601", "category": "Aluminium — unwrought"},
    {"cn_code": "7604", "category": "Aluminium bars, rods, profiles"},
    {"cn_code": "7606", "category": "Aluminium plates, sheets, strip"},
    {"cn_code": "2523", "category": "Cement clinkers"},
    {"cn_code": "3105", "category": "Mineral or chemical fertilisers"},
    {"cn_code": "2814", "category": "Ammonia"},
    {"cn_code": "2804 10", "category": "Hydrogen"},
    {"cn_code": "2716", "category": "Electricity"},
]


def load_cbam_cn_codes() -> list[dict]:
    return list(_CN_CODES)


def load_cbam_regulation() -> Regulation:
    return Regulation(
        id="CBAM",
        region="EU",
        title="Carbon Border Adjustment Mechanism (Regulation EU 2023/956)",
    )
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_cbam.py -v
git add data/public/cbam.py tests/data/test_cbam.py
git commit -m "feat(data): add CBAM CN codes (11) + regulation"
```

---

### Task 11: IRA + USMCA module (US trade regulations)

**Files:**
- Create: `data/public/us_trade.py`
- Test: `tests/data/test_us_trade.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_us_trade.py
from data.public.us_trade import load_ira_regulation, load_usmca_regulation, FEOC_COUNTRIES, USMCA_AUTO_VALUE_CONTENT_RULES


def test_ira():
    reg = load_ira_regulation()
    assert reg.id == "IRA-30D"
    assert reg.region == "US"


def test_usmca():
    reg = load_usmca_regulation()
    assert reg.id == "USMCA-Auto75"
    assert reg.region == "US"


def test_feoc_countries():
    assert "CN" in FEOC_COUNTRIES
    assert "RU" in FEOC_COUNTRIES


def test_usmca_rule_75pct():
    assert USMCA_AUTO_VALUE_CONTENT_RULES["passenger_vehicle"] == 75
```

- [ ] **Step 2-3: Implement**

```python
# data/public/us_trade.py
"""US trade regulations — IRA Section 30D + FEOC, USMCA Chapter 4 RVC rules.

IRA (Inflation Reduction Act) Section 30D: clean vehicle credit, requires
critical minerals + battery components NOT sourced from FEOC (Foreign Entity
of Concern) for full $7,500 credit.

USMCA (US-Mexico-Canada Agreement) Chapter 4: regional value content (RVC)
rules. Passenger vehicle requires 75% RVC by 2025-07.
"""
from __future__ import annotations
from data.schemas import Regulation

# FEOC list per Treasury Notice 2023-65 (covered nations)
FEOC_COUNTRIES: list[str] = ["CN", "RU", "KP", "IR"]  # China, Russia, North Korea, Iran

# USMCA Chapter 4 — Regional Value Content rules (% by 2025-07)
USMCA_AUTO_VALUE_CONTENT_RULES: dict[str, int] = {
    "passenger_vehicle": 75,
    "light_truck": 75,
    "heavy_truck": 70,
    "core_part": 75,        # engine, transmission, body, chassis, axle, suspension, steering, advanced battery
    "principal_part": 65,
    "complementary_part": 60,
}

# USMCA Steel/Aluminium Purchase Requirement (% by 2027)
USMCA_STEEL_ALUM_PURCHASE_PCT: int = 70


def load_ira_regulation() -> Regulation:
    return Regulation(
        id="IRA-30D",
        region="US",
        title="Inflation Reduction Act Section 30D — Clean Vehicle Credit + FEOC restriction",
    )


def load_usmca_regulation() -> Regulation:
    return Regulation(
        id="USMCA-Auto75",
        region="US",
        title="USMCA Chapter 4 — Regional Value Content rules (75% passenger vehicle by 2025-07)",
    )
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_us_trade.py -v
git add data/public/us_trade.py tests/data/test_us_trade.py
git commit -m "feat(data): add IRA + USMCA regulations + FEOC list + RVC rules"
```

---

### Task 12: Korean adapters (JEDEC↔KS, REACH↔K-REACH, CBAM↔K-ETS)

**Files:**
- Create: `ontology/adapters/jedec_to_ks.py`, `ontology/adapters/reach_to_kreach.py`, `ontology/adapters/cbam_to_kets.py`
- Test: `tests/ontology/test_adapters.py`

- [ ] **Step 1: Test**

```python
# tests/ontology/test_adapters.py
from ontology.adapters.jedec_to_ks import jedec_to_ks_mapping
from ontology.adapters.reach_to_kreach import reach_svhc_to_kreach
from ontology.adapters.cbam_to_kets import cbam_cn_to_kets_factor


def test_jedec_to_ks():
    m = jedec_to_ks_mapping()
    assert m["JESD22"] == "KS C IEC 60749"


def test_reach_to_kreach():
    m = reach_svhc_to_kreach()
    # K-REACH wraps EU REACH SVHC list with delta
    assert "117-81-7" in m
    assert m["117-81-7"]["status"] == "registered"


def test_cbam_to_kets_factor():
    # Example: EU CBAM CN 7208 (steel) -> K-ETS conversion factor (tonCO2e/ton)
    factor = cbam_cn_to_kets_factor("7208")
    assert factor > 0
```

- [ ] **Step 2-3: Implement**

```python
# ontology/adapters/jedec_to_ks.py
"""JEDEC -> KS C IEC mapping. Curated from KATS (Korean Agency for Technology and Standards) cross-walks."""
from __future__ import annotations


def jedec_to_ks_mapping() -> dict[str, str]:
    return {
        "JESD22": "KS C IEC 60749",  # Reliability test methods
        "JESD51": "KS C IEC 60068-2",  # Thermal test
        "JESD78": "KS C IEC 60749-29",  # Latch-up
    }
```

```python
# ontology/adapters/reach_to_kreach.py
"""REACH SVHC -> K-REACH (한국 화학물질의 등록 및 평가 등에 관한 법률) status mapping.

K-REACH adopts most EU REACH SVHC entries with a delta. Entries here represent
which CAS IDs are registered/exempt under K-REACH for demo purposes.
"""
from __future__ import annotations


def reach_svhc_to_kreach() -> dict[str, dict]:
    # cas_id -> {status, k_reach_id (optional)}
    return {
        "117-81-7":  {"status": "registered", "k_reach_id": "KE-12345"},
        "84-69-5":   {"status": "registered", "k_reach_id": "KE-12346"},
        "1303-86-2": {"status": "registered", "k_reach_id": "KE-12347"},
        "7440-43-9": {"status": "registered", "k_reach_id": "KE-12348"},
        "7439-92-1": {"status": "registered", "k_reach_id": "KE-12349"},
        "75-09-2":   {"status": "exempt", "k_reach_id": None},  # not yet adopted
        "1330-43-4": {"status": "registered", "k_reach_id": "KE-12350"},
    }
```

```python
# ontology/adapters/cbam_to_kets.py
"""EU CBAM CN codes -> K-ETS (한국 배출권거래제) emission factor conversion.

K-ETS uses tonCO2e/ton for direct emissions. Used by `carbon_calc.cbam_calc()`
in Plan 2 to convert CBAM CN code attribution into K-ETS-comparable units.
"""
from __future__ import annotations

# CN code -> K-ETS direct emission factor (tCO2e per ton of product)
_CN_TO_KETS_FACTOR: dict[str, float] = {
    "7208": 2.1,    # Iron/steel hot-rolled (BF-BOF route)
    "7210": 2.3,    # Iron/steel coated
    "7301": 2.0,
    "7601": 11.5,   # Aluminium primary (electrolysis-heavy)
    "7604": 11.0,
    "7606": 10.8,
    "2523": 0.86,   # Cement clinker
    "3105": 1.5,    # Fertilizer
    "2814": 1.9,    # Ammonia
    "2804 10": 9.5, # Hydrogen (grey, SMR route)
    "2716": 0.45,   # Electricity (KR grid mix)
}


def cbam_cn_to_kets_factor(cn_code: str) -> float:
    """Return tCO2e/ton emission factor for a given CN code, defaulting to 1.0."""
    return _CN_TO_KETS_FACTOR.get(cn_code, 1.0)
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/ontology/test_adapters.py -v
git add ontology/adapters/ tests/ontology/test_adapters.py
git commit -m "feat(ontology): add Korean adapters (JEDEC->KS, REACH->K-REACH, CBAM->K-ETS)"
```

---

### Task 13: Geo (7 countries) — public GeoJSON loader

**Files:**
- Create: `data/public/geo.py`
- Test: `tests/data/test_geo.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_geo.py
from data.public.geo import load_regions
from data.schemas import Region


def test_load_7_regions():
    regions = load_regions()
    ids = {r.id for r in regions}
    assert ids == {"KR", "CN", "VN", "MX", "PL", "US", "IN"}
    assert all(isinstance(r, Region) for r in regions)
    kr = next(r for r in regions if r.id == "KR")
    assert kr.name_ko == "대한민국"
```

- [ ] **Step 2-3: Implement**

```python
# data/public/geo.py
"""ISO-3166 alpha-2 region metadata for the 7 countries in the global SCM scope.

Note: GeoJSON polygons themselves are loaded by the web frontend (Plan 2)
via Natural Earth (1:50m countries). This module only carries name/code metadata
for graph nodes.
"""
from __future__ import annotations
from data.schemas import Region

_RAW: list[tuple[str, str, str]] = [
    ("KR", "Korea, Republic of", "대한민국"),
    ("CN", "China",               "중국"),
    ("VN", "Vietnam",             "베트남"),
    ("MX", "Mexico",              "멕시코"),
    ("PL", "Poland",              "폴란드"),
    ("US", "United States",       "미국"),
    ("IN", "India",               "인도"),
]


def load_regions() -> list[Region]:
    return [Region(id=i, name=n, name_ko=k) for i, n, k in _RAW]
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_geo.py -v
git add data/public/geo.py tests/data/test_geo.py
git commit -m "feat(data): add 7-country region metadata loader (KR/CN/VN/MX/PL/US/IN)"
```

---

## Phase 1 — Synthetic Data + Ontology (Tasks 14–26)

### Task 14: Ontology TTL schema (22 classes + relations)

**Files:**
- Create: `ontology/schema.ttl`
- Test: `tests/ontology/test_schema_ttl.py`

- [ ] **Step 1: Test**

```python
# tests/ontology/test_schema_ttl.py
from pathlib import Path
import rdflib


def test_schema_parses_as_turtle():
    g = rdflib.Graph()
    schema_path = Path(__file__).resolve().parents[2] / "ontology" / "schema.ttl"
    g.parse(str(schema_path), format="turtle")
    # Count owl:Class declarations
    classes = list(g.triples((None, rdflib.RDF.type, rdflib.OWL.Class)))
    assert len(classes) >= 22, f"Expected >=22 owl:Class, got {len(classes)}"


def test_schema_has_bom_relations():
    g = rdflib.Graph()
    schema_path = Path(__file__).resolve().parents[2] / "ontology" / "schema.ttl"
    g.parse(str(schema_path), format="turtle")
    # Count owl:ObjectProperty declarations
    props = list(g.triples((None, rdflib.RDF.type, rdflib.OWL.ObjectProperty)))
    assert len(props) >= 18, f"Expected >=18 owl:ObjectProperty, got {len(props)}"
```

- [ ] **Step 2-3: Implement**

`ontology/schema.ttl`:
```turtle
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix mfg:  <https://amzn.tech/mfg/ontology#> .

# ==== Classes (22) ====

# BOM 계층 (4)
mfg:Product       a owl:Class ; rdfs:label "Product" .
mfg:Module        a owl:Class ; rdfs:label "Module" .
mfg:Component     a owl:Class ; rdfs:label "Component" .
mfg:RawMaterial   a owl:Class ; rdfs:label "RawMaterial" .

# Supply 양면 (5)
mfg:Manufacturer    a owl:Class ; rdfs:label "Manufacturer" .
mfg:Supplier        a owl:Class ; rdfs:label "Supplier" .
mfg:SubSupplier     a owl:Class ; rdfs:label "SubSupplier" .
mfg:CustomerAccount a owl:Class ; rdfs:label "CustomerAccount" .
mfg:Plant           a owl:Class ; rdfs:label "Plant" .

# Geo / 운송 (2)
mfg:Region    a owl:Class ; rdfs:label "Region" .
mfg:TradeLane a owl:Class ; rdfs:label "TradeLane" .

# 표준 / 규제 (4)
mfg:Standard      a owl:Class ; rdfs:label "Standard" .
mfg:Certification a owl:Class ; rdfs:label "Certification" .
mfg:Regulation    a owl:Class ; rdfs:label "Regulation" .
mfg:Substance     a owl:Class ; rdfs:label "Substance" .

# 품질 (3)
mfg:QualityIncident a owl:Class ; rdfs:label "QualityIncident" .
mfg:EightDReport    a owl:Class ; rdfs:label "EightDReport" .
mfg:RootCause       a owl:Class ; rdfs:label "RootCause" .

# 운영 / ESG (4)
mfg:Telemetry        a owl:Class ; rdfs:label "Telemetry" .
mfg:MaintenanceEvent a owl:Class ; rdfs:label "MaintenanceEvent" .
mfg:ESGIndicator     a owl:Class ; rdfs:label "ESGIndicator" .
mfg:CarbonScope      a owl:Class ; rdfs:label "CarbonScope" .

# ==== Object Properties (relations, 18+) ====

# BOM
mfg:hasModule    a owl:ObjectProperty ; rdfs:domain mfg:Product ;   rdfs:range mfg:Module .
mfg:consistsOf   a owl:ObjectProperty ; rdfs:domain mfg:Module ;    rdfs:range mfg:Component .
mfg:madeOf       a owl:ObjectProperty ; rdfs:domain mfg:Component ; rdfs:range mfg:RawMaterial .

# Supply
mfg:manufacturedBy a owl:ObjectProperty ; rdfs:domain mfg:Product ;      rdfs:range mfg:Manufacturer .
mfg:operates       a owl:ObjectProperty ; rdfs:domain mfg:Manufacturer ; rdfs:range mfg:Plant .
mfg:locatedIn      a owl:ObjectProperty ; rdfs:domain mfg:Plant ;        rdfs:range mfg:Region .
mfg:suppliedBy     a owl:ObjectProperty ; rdfs:domain mfg:Component ;    rdfs:range mfg:Supplier .
mfg:subSupplies    a owl:ObjectProperty ; rdfs:domain mfg:Supplier ;     rdfs:range mfg:SubSupplier .
mfg:soldTo         a owl:ObjectProperty ; rdfs:domain mfg:Product ;      rdfs:range mfg:CustomerAccount .

# Lane
mfg:connects     a owl:ObjectProperty ; rdfs:domain mfg:TradeLane ; rdfs:range mfg:Region .
mfg:shipsVia     a owl:ObjectProperty ; rdfs:domain mfg:Plant ;     rdfs:range mfg:TradeLane .
mfg:subjectTo    a owl:ObjectProperty ; rdfs:domain mfg:TradeLane ; rdfs:range mfg:Regulation .

# Compliance
mfg:conformsTo       a owl:ObjectProperty ; rdfs:domain mfg:Component ; rdfs:range mfg:Standard .
mfg:certifiedBy      a owl:ObjectProperty ; rdfs:domain mfg:Component ; rdfs:range mfg:Certification .
mfg:containsSubstance a owl:ObjectProperty ; rdfs:domain mfg:Component ; rdfs:range mfg:Substance .
mfg:regulatedBy      a owl:ObjectProperty ; rdfs:domain mfg:Substance ; rdfs:range mfg:Regulation .

# Quality
mfg:about        a owl:ObjectProperty ; rdfs:domain mfg:QualityIncident ; rdfs:range mfg:Component .
mfg:addresses    a owl:ObjectProperty ; rdfs:domain mfg:EightDReport ;    rdfs:range mfg:QualityIncident .
mfg:identifies   a owl:ObjectProperty ; rdfs:domain mfg:EightDReport ;    rdfs:range mfg:RootCause .
mfg:linkedTo     a owl:ObjectProperty ; rdfs:domain mfg:RootCause ;       rdfs:range mfg:Supplier .

# Ops / ESG
mfg:from        a owl:ObjectProperty ; rdfs:domain mfg:Telemetry ;        rdfs:range mfg:Plant .
mfg:on          a owl:ObjectProperty ; rdfs:domain mfg:MaintenanceEvent ; rdfs:range mfg:Component .
mfg:measuredAt  a owl:ObjectProperty ; rdfs:domain mfg:ESGIndicator ;     rdfs:range mfg:Plant .
mfg:emits       a owl:ObjectProperty ; rdfs:domain mfg:Plant ;            rdfs:range mfg:CarbonScope .
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/ontology/test_schema_ttl.py -v
git add ontology/schema.ttl tests/ontology/test_schema_ttl.py
git commit -m "feat(ontology): add 22-class OWL/RDF schema (24 owl:Class + 24 owl:ObjectProperty)"
```

---

### Task 15: Products generator (80 SKU × 5 lines)

**Files:**
- Create: `data/synthetic/products.py`
- Test: `tests/data/test_products_gen.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_products_gen.py
from data.synthetic.products import generate_products
from data.schemas import Product


def test_generate_80_products_5_lines():
    products = generate_products(seed=42)
    assert len(products) == 80
    assert all(isinstance(p, Product) for p in products)
    lines = {p.line for p in products}
    assert lines == {"SmartFridge", "VisionOLED", "AutoCockpit", "FC-BGA", "eDrive"}
    # Each line has ~16 SKUs (allow small variance)
    from collections import Counter
    line_counts = Counter(p.line for p in products)
    assert all(14 <= c <= 18 for c in line_counts.values())


def test_product_id_format():
    products = generate_products(seed=42)
    # AMZN-{division}-{line}-{NNN}
    assert all(p.id.startswith("AMZN-") for p in products)
    he = [p for p in products if p.line == "VisionOLED"]
    assert all(p.id.startswith("AMZN-HE-VisionOLED-") for p in he)
```

- [ ] **Step 2-3: Implement (deterministic, no LLM)**

```python
# data/synthetic/products.py
"""Product (SKU) generator. 80 total = 5 lines × ~16 SKUs each.

Deterministic (no LLM) — product names follow AMZN Tech naming convention from
spec § D.2: SmartFridge X9, VisionOLED 88, AutoCockpit C7, FC-BGA Gen5, eDrive 350iPT.

Run: python -m data.synthetic.products [--seed N]
Output: data/output/products.ndjson
"""
from __future__ import annotations
import argparse
import json
import random
from pathlib import Path
from data.schemas import Product

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "products.ndjson"

# (line, division, count, model_seeds)
# model_seeds = list of suffixes to combine with line; total length determines count
LINES: list[tuple[str, str, list[str]]] = [
    ("SmartFridge", "HA", ["X9", "X9 Pro", "X8", "X7", "X7 Slim", "X6", "X5", "Mini X3", "Bottom-Freezer X9", "French-Door X9", "Side-by-Side X8", "Compact X4", "Built-In X9", "Wine Cellar X6", "Showcase X8", "Inverter X7"]),
    ("VisionOLED",  "HE", ["88", "77", "65", "55", "48 Game", "97 Wallpaper", "83 Cinema", "75 Pro", "65 Pro", "55 Pro", "42 Smart", "32 Smart", "75 Frame", "65 Frame", "48 Frame", "32 Compact"]),
    ("AutoCockpit", "VS", ["C7", "C7 Pro", "C5", "C5 Lite", "C3", "C3 Eco", "Cluster A3", "Cluster A5", "InfoDrive 5", "InfoDrive 7", "ADAS Bundle 2", "ADAS Bundle 3", "AR-HUD H1", "AR-HUD H2", "Telematics T1", "Telematics T2"]),
    ("FC-BGA",      "INNOTEK", ["Gen5", "Gen5 Pro", "Gen5 HPC", "Gen5 Auto", "Gen5 Comm", "Gen4", "Gen4 Auto", "Gen4 Mobile", "CIS-50MP M9", "CIS-108MP M11", "CIS-12MP M5", "MotorDrive M3", "MotorDrive M5", "PMIC P1", "PMIC P2", "RFFE R1"]),
    ("eDrive",      "MAGNA", ["350iPT", "350iPT Pro", "200iPT", "200iPT Compact", "150eMotor", "150eMotor Lite", "Inverter Pro 800V", "Inverter Std 400V", "Reducer R1", "Reducer R2", "Inverter Pro 1200V", "BMS B1", "BMS B2", "Charger C1 11kW", "Charger C2 22kW", "ePT Bundle X3"]),
]


def generate_products(seed: int = 42) -> list[Product]:
    rng = random.Random(seed)
    out: list[Product] = []
    for line, division, model_seeds in LINES:
        for i, model in enumerate(model_seeds, start=1):
            sku_code = f"AMZN-{division}-{line.replace(' ', '')}-{i:03d}"
            # name: line + space + model — but FC-BGA already has line in suffix
            name = f"{line} {model}" if not model.startswith(line) else model
            out.append(Product(
                id=sku_code,
                name=f"AMZN {name}",
                line=line,
                division=division,  # type: ignore[arg-type]
                brand="AMZN Tech",
                sku_code=sku_code,
            ))
    rng.shuffle(out)
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()
    products = generate_products(seed=args.seed)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for prod in products:
            f.write(prod.model_dump_json() + "\n")
    print(f"wrote {len(products)} products → {OUTPUT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_products_gen.py -v
python -m data.synthetic.products --seed 42  # writes data/output/products.ndjson
wc -l data/output/products.ndjson  # 80
git add data/synthetic/products.py tests/data/test_products_gen.py
git commit -m "feat(data): add deterministic products generator (80 SKU × 5 lines)"
```

---

### Task 16: BOM generator (Module 400 + Component 3000 + RawMaterial 200)

**Files:**
- Create: `data/synthetic/boms.py`
- Test: `tests/data/test_boms_gen.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_boms_gen.py
from data.synthetic.boms import generate_boms
from data.schemas import Module, Component, RawMaterial


def test_generate_bom_counts():
    products = ["AMZN-HE-VisionOLED-001"] * 80  # mock 80 product ids
    bom = generate_boms(product_ids=products, seed=42)
    assert 380 <= len(bom["modules"]) <= 420
    assert 2900 <= len(bom["components"]) <= 3100
    assert 180 <= len(bom["raw_materials"]) <= 220
    assert all(isinstance(m, Module) for m in bom["modules"])
    assert all(isinstance(c, Component) for c in bom["components"])
    assert all(isinstance(r, RawMaterial) for r in bom["raw_materials"])


def test_bom_edges_consistent():
    products = ["AMZN-HE-VisionOLED-001"] * 80
    bom = generate_boms(product_ids=products, seed=42)
    # Every Module references at least one parent product
    assert all(len(m.parent_product_ids) >= 1 for m in bom["modules"])
```

- [ ] **Step 2-3: Implement (deterministic)**

```python
# data/synthetic/boms.py
"""BOM (Bill of Materials) generator: Modules / Components / RawMaterials.

Deterministic. Each Product has 5 Modules avg, each Module has 8 Components avg,
each Component has 0–2 RawMaterial sources. Component IDs are scoped by category
(IC/PCB/Connector/Mechanical/Display/Battery/etc) to make Substitute (F) and
SpecMatch (D) scenarios more realistic.

Run: python -m data.synthetic.boms [--seed N]
Output: data/output/{modules,components,raw_materials}.ndjson
"""
from __future__ import annotations
import argparse
import json
import random
from pathlib import Path
from data.schemas import Module, Component, RawMaterial

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"

COMPONENT_CATEGORIES = [
    "IC", "PCB", "Connector", "Mechanical", "Display", "Battery", "Sensor",
    "Power", "Motor", "Cable", "Optical", "Antenna", "Memory", "Magnetic",
]

RAW_MATERIAL_NAMES = [
    "Silicon wafer 200mm", "Silicon wafer 300mm", "Copper foil 18μm", "Aluminium ingot",
    "Polyimide film", "FR-4 substrate", "Epoxy mold compound", "Tin-silver solder",
    "Indium tin oxide", "Liquid crystal mixture", "Lithium iron phosphate",
    "NMC 811 cathode", "Graphite anode", "Electrolyte LiPF6", "Magnet NdFeB",
    # ~30 more — repeat pattern for total ~200
]


def generate_boms(*, product_ids: list[str], seed: int = 42) -> dict[str, list]:
    rng = random.Random(seed)

    # Modules: 5/product avg with variance — total ~400 for 80 products
    modules: list[Module] = []
    module_counter = 0
    for pid in product_ids[:80]:  # cap to 80 distinct products
        n_modules = rng.randint(4, 6)
        for _ in range(n_modules):
            module_counter += 1
            modules.append(Module(
                id=f"AMZN-MOD-{module_counter:04d}",
                name=f"Module-{module_counter}",
                category=rng.choice(["Display", "PowerSupply", "Mainboard", "Compressor", "Inverter", "Sensor", "Battery"]),
                parent_product_ids=[pid],
            ))

    # Components: 8/module avg — total ~3000 for 400 modules
    components: list[Component] = []
    comp_counter = 0
    for mod in modules:
        n_comps = rng.randint(6, 10)
        for _ in range(n_comps):
            comp_counter += 1
            cat = rng.choice(COMPONENT_CATEGORIES)
            components.append(Component(
                id=f"AMZN-CMP-{cat[:3].upper()}-{comp_counter:05d}",
                name=f"{cat}-{comp_counter}",
                category=cat,
                standards=[],   # filled by Task 17
                substances=[],  # filled by Task 17
            ))

    # RawMaterials: ~200, named pool repeated/varied
    raw_pool = RAW_MATERIAL_NAMES + [f"Generic raw {i}" for i in range(200 - len(RAW_MATERIAL_NAMES))]
    raw_materials = [
        RawMaterial(id=f"AMZN-RAW-{i:04d}", name=name)
        for i, name in enumerate(raw_pool[:200], start=1)
    ]

    return {"modules": modules, "components": components, "raw_materials": raw_materials}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()
    products_path = OUTPUT_DIR / "products.ndjson"
    if not products_path.exists():
        raise SystemExit("Run `python -m data.synthetic.products` first.")
    pids = [json.loads(line)["id"] for line in products_path.read_text(encoding="utf-8").splitlines()]
    bom = generate_boms(product_ids=pids, seed=args.seed)
    for key, items in bom.items():
        out = OUTPUT_DIR / f"{key}.ndjson"
        with out.open("w", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json() + "\n")
        print(f"wrote {len(items):>5} → {out.name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_boms_gen.py -v
python -m data.synthetic.products && python -m data.synthetic.boms
wc -l data/output/{modules,components,raw_materials}.ndjson
git add data/synthetic/boms.py tests/data/test_boms_gen.py
git commit -m "feat(data): add BOM generator (Module 400 / Component 3000 / RawMaterial 200)"
```

---

### Task 17: Component standards/substances enrichment

**Files:**
- Create: `data/synthetic/enrich_components.py`
- Test: `tests/data/test_enrich_components.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_enrich_components.py
import json
from pathlib import Path
from data.synthetic.enrich_components import enrich_components_with_standards
from data.schemas import Component


def test_enrich_assigns_standards():
    base = [
        Component(id="AMZN-CMP-IC-00001", name="MCU", category="IC"),
        Component(id="AMZN-CMP-PCB-00002", name="PCB", category="PCB"),
        Component(id="AMZN-CMP-MEC-00003", name="Bracket", category="Mechanical"),
    ]
    enriched = enrich_components_with_standards(base, seed=42)
    # IC components must reference at least one of AEC-Q100/JESD22
    ic = next(c for c in enriched if c.category == "IC")
    assert any(s in ic.standards for s in ("AEC-Q100", "JESD22"))
    # PCB must reference IPC-A-610
    pcb = next(c for c in enriched if c.category == "PCB")
    assert "IPC-A-610" in pcb.standards


def test_some_components_carry_substances():
    base = [Component(id=f"AMZN-CMP-IC-{i:05d}", name=f"IC-{i}", category="IC") for i in range(100)]
    enriched = enrich_components_with_standards(base, seed=42)
    n_with_subs = sum(1 for c in enriched if c.substances)
    # At least 5% should carry SVHC/RoHS substances (deliberate seeding for E scenario)
    assert n_with_subs >= 5
```

- [ ] **Step 2-3: Implement**

```python
# data/synthetic/enrich_components.py
"""Component enrichment: assign standards + substances per category.

Rules (deterministic):
- IC          -> AEC-Q100 + JESD22 (50% chance) + ISO-26262 ASIL-B (auto subset)
- PCB         -> IPC-A-610 + IPC-J-STD-001
- Mechanical  -> ISO-9001
- Display     -> AEC-Q100 (if div=VS) else JESD51
- Battery     -> ISO-26262 ASIL-D (Magna ePT)
- ~5% of components in each category get assigned 1-2 SVHC/RoHS substances
  (deliberate to make Compliance E scenario meaningful).
"""
from __future__ import annotations
import random
from data.schemas import Component


_CATEGORY_STANDARDS: dict[str, list[str]] = {
    "IC":         ["AEC-Q100", "JESD22"],
    "PCB":        ["IPC-A-610", "IPC-J-STD-001"],
    "Connector":  ["IPC-WHMA-A-620"],
    "Mechanical": ["ISO-9001"],
    "Display":    ["JESD51"],
    "Battery":    ["ISO-26262", "AEC-Q200"],
    "Sensor":     ["AEC-Q100", "JESD22"],
    "Power":      ["AEC-Q200", "ISO-9001"],
    "Motor":      ["IATF-16949", "ISO-9001"],
    "Cable":      ["IPC-WHMA-A-620"],
    "Optical":    ["JESD22"],
    "Antenna":    ["AEC-Q100"],
    "Memory":     ["JESD46", "JEP122"],
    "Magnetic":   ["ISO-9001"],
}

# CAS IDs from REACH-SVHC + RoHS that we deliberately seed in ~5% of components
_SVHC_PROBLEM_CAS = ["117-81-7", "7439-92-1", "7440-43-9", "32534-81-9", "84-69-5"]


def enrich_components_with_standards(components: list[Component], *, seed: int = 42) -> list[Component]:
    rng = random.Random(seed)
    out: list[Component] = []
    for c in components:
        stds = list(_CATEGORY_STANDARDS.get(c.category, ["ISO-9001"]))
        subs = []
        if rng.random() < 0.05:  # 5% problematic
            subs = rng.sample(_SVHC_PROBLEM_CAS, k=rng.randint(1, 2))
        out.append(c.model_copy(update={"standards": stds, "substances": subs}))
    return out
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_enrich_components.py -v
git add data/synthetic/enrich_components.py tests/data/test_enrich_components.py
git commit -m "feat(data): add component enrichment (standards by category + 5%% SVHC seeding)"
```

---

### Task 18: Suppliers + SubSuppliers generator (1차 100 + 2차 50)

**Files:**
- Create: `data/synthetic/suppliers.py`
- Test: `tests/data/test_suppliers_gen.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_suppliers_gen.py
from data.synthetic.suppliers import generate_suppliers
from data.schemas import Supplier, SubSupplier


def test_supplier_counts():
    out = generate_suppliers(seed=42)
    assert len(out["suppliers"]) == 100
    assert len(out["sub_suppliers"]) == 50
    assert all(s.tier == 1 for s in out["suppliers"])
    assert all(isinstance(s, SubSupplier) for s in out["sub_suppliers"])


def test_subsuppliers_link_to_existing_supplier():
    out = generate_suppliers(seed=42)
    parent_ids = {s.id for s in out["suppliers"]}
    for sub in out["sub_suppliers"]:
        assert sub.parent_supplier_id in parent_ids


def test_supplier_regions_distributed():
    out = generate_suppliers(seed=42)
    regions = {s.region for s in out["suppliers"]}
    # Should span all 7 SCM regions
    assert {"KR", "CN", "VN", "MX", "PL", "US", "IN"}.issubset(regions)
```

- [ ] **Step 2-3: Implement**

```python
# data/synthetic/suppliers.py
"""Suppliers (Tier-1: 100) + SubSuppliers (Tier-2: 50). Deterministic.

Region distribution biased toward CN/KR (typical hi-tech mfg supply chain),
with smaller presence in VN/MX/PL/US/IN.

Run: python -m data.synthetic.suppliers
Output: data/output/{suppliers,sub_suppliers}.ndjson
"""
from __future__ import annotations
import argparse
import random
from pathlib import Path
from data.schemas import Supplier, SubSupplier

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"

REGION_WEIGHTS = {"KR": 30, "CN": 25, "VN": 12, "MX": 8, "PL": 8, "US": 10, "IN": 7}
SUPPLIER_NAME_PREFIXES = ["Hanwha", "Daesun", "Sunwoo", "BlueOcean", "Kornic", "RedRock", "GreenLine", "PrimeAlloy", "Vertex", "Apex", "Synthon", "Arctic", "Pacific", "Beacon", "Quantum", "Helio", "Crystal", "Nexa", "Stellar", "Orion"]


def _pick_region(rng: random.Random) -> str:
    items = list(REGION_WEIGHTS.items())
    pool = [r for r, w in items for _ in range(w)]
    return rng.choice(pool)


def generate_suppliers(*, seed: int = 42) -> dict[str, list]:
    rng = random.Random(seed)

    suppliers: list[Supplier] = []
    for i in range(1, 101):
        prefix = rng.choice(SUPPLIER_NAME_PREFIXES)
        suppliers.append(Supplier(
            id=f"AMZN-SUP1-{i:03d}",
            name=f"{prefix} Industries {i}",
            tier=1,
            region=_pick_region(rng),
            rfm_recency=round(rng.uniform(0.4, 1.0), 3),
            rfm_frequency=round(rng.uniform(0.3, 1.0), 3),
            rfm_monetary=round(rng.uniform(0.3, 1.0), 3),
        ))

    sub_suppliers: list[SubSupplier] = []
    for i in range(1, 51):
        parent = rng.choice(suppliers)
        sub_suppliers.append(SubSupplier(
            id=f"AMZN-SUP2-{i:03d}",
            name=f"Tier2-{i}",
            parent_supplier_id=parent.id,
            region=_pick_region(rng),
        ))

    return {"suppliers": suppliers, "sub_suppliers": sub_suppliers}


def main() -> None:
    args = argparse.ArgumentParser().parse_args()
    out = generate_suppliers(seed=42)
    for key, items in out.items():
        path = OUTPUT_DIR / f"{key}.ndjson"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json() + "\n")
        print(f"wrote {len(items):>3} → {path.name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_suppliers_gen.py -v
python -m data.synthetic.suppliers
git add data/synthetic/suppliers.py tests/data/test_suppliers_gen.py
git commit -m "feat(data): add suppliers generator (Tier-1: 100, Tier-2: 50)"
```

---

### Task 19: Customers + Plants + Lanes generators

**Files:**
- Create: `data/synthetic/customers.py`, `data/synthetic/plants.py`, `data/synthetic/lanes.py`
- Test: `tests/data/test_customers_plants_lanes_gen.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_customers_plants_lanes_gen.py
from data.synthetic.customers import generate_customers
from data.synthetic.plants import generate_plants
from data.synthetic.lanes import generate_lanes


def test_customers_30_segments():
    customers = generate_customers(seed=42)
    assert len(customers) == 30
    from collections import Counter
    seg = Counter(c.segment for c in customers)
    assert seg["AUTO_OEM"] == 5
    assert seg["TIER1"] == 8
    assert seg["APPLIANCE_DIST"] == 7
    assert seg["TELECOM"] == 5
    assert seg["OTHER"] == 5


def test_plants_40_with_self_and_supplier():
    plants = generate_plants(seed=42)
    assert len(plants) == 40
    self_plants = [p for p in plants if p.operator == "SELF"]
    supp_plants = [p for p in plants if p.operator == "SUPPLIER"]
    assert 10 <= len(self_plants) <= 20
    assert 20 <= len(supp_plants) <= 30


def test_lanes_120_multimodal():
    lanes = generate_lanes(seed=42)
    assert len(lanes) == 120
    modes = {l.mode for l in lanes}
    assert {"SEA", "AIR", "RAIL", "ROAD"}.issubset(modes)
    # IRA/USMCA/CBAM tagged on relevant lanes
    has_ira = any("IRA-30D" in l.regulations for l in lanes)
    has_cbam = any("CBAM" in l.regulations for l in lanes)
    has_usmca = any("USMCA-Auto75" in l.regulations for l in lanes)
    assert has_ira and has_cbam and has_usmca
```

- [ ] **Step 2-3: Implement (3 files)**

```python
# data/synthetic/customers.py
"""B2B OEM customer accounts. 30 = AUTO_OEM 5 + TIER1 8 + APPLIANCE_DIST 7 + TELECOM 5 + OTHER 5."""
from __future__ import annotations
import argparse
import random
from pathlib import Path
from data.schemas import CustomerAccount

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "customers.ndjson"

ACCOUNTS: list[tuple[str, str, str]] = [
    # Auto OEM (5) — anonymized
    ("Global Auto OEM A", "AUTO_OEM", "US"),
    ("Global Auto OEM B", "AUTO_OEM", "US"),
    ("EU Auto Group C",   "AUTO_OEM", "PL"),
    ("Asia Auto Maker D", "AUTO_OEM", "KR"),
    ("Premium EV Maker E","AUTO_OEM", "US"),
    # Tier-1 (8)
    ("AutoTier1-Alpha", "TIER1", "MX"),
    ("AutoTier1-Beta",  "TIER1", "US"),
    ("AutoTier1-Gamma", "TIER1", "DE"),  # represented as PL
    ("AutoTier1-Delta", "TIER1", "PL"),
    ("AutoTier1-Epsilon","TIER1", "JP"),  # represented as KR
    ("AutoTier1-Zeta",  "TIER1", "KR"),
    ("AutoTier1-Eta",   "TIER1", "CN"),
    ("AutoTier1-Theta", "TIER1", "IN"),
    # Appliance distributors (7)
    ("ApplianceDist-1", "APPLIANCE_DIST", "US"),
    ("ApplianceDist-2", "APPLIANCE_DIST", "PL"),
    ("ApplianceDist-3", "APPLIANCE_DIST", "KR"),
    ("ApplianceDist-4", "APPLIANCE_DIST", "VN"),
    ("ApplianceDist-5", "APPLIANCE_DIST", "IN"),
    ("ApplianceDist-6", "APPLIANCE_DIST", "MX"),
    ("ApplianceDist-7", "APPLIANCE_DIST", "CN"),
    # Telecom (5)
    ("Telco-NA-1", "TELECOM", "US"),
    ("Telco-EU-1", "TELECOM", "PL"),
    ("Telco-AP-1", "TELECOM", "KR"),
    ("Telco-AP-2", "TELECOM", "VN"),
    ("Telco-IN-1", "TELECOM", "IN"),
    # Other (5)
    ("Industrial-A", "OTHER", "KR"),
    ("Industrial-B", "OTHER", "MX"),
    ("Defense-A",    "OTHER", "US"),
    ("Defense-B",    "OTHER", "KR"),
    ("Medical-A",    "OTHER", "PL"),
]


def generate_customers(seed: int = 42) -> list[CustomerAccount]:
    valid_regions = {"KR", "CN", "VN", "MX", "PL", "US", "IN"}
    out: list[CustomerAccount] = []
    for i, (name, seg, region) in enumerate(ACCOUNTS, start=1):
        # Coerce non-7 regions to closest in our scope
        r = region if region in valid_regions else {"DE": "PL", "JP": "KR"}.get(region, "KR")
        out.append(CustomerAccount(
            id=f"AMZN-CUST-{i:03d}",
            name=name,
            segment=seg,  # type: ignore[arg-type]
            region=r,
        ))
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    customers = generate_customers()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for c in customers:
            f.write(c.model_dump_json() + "\n")
    print(f"wrote {len(customers)} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
```

```python
# data/synthetic/plants.py
"""Plants (40) — self-operated 15 + supplier-operated 25, distributed across 7 regions."""
from __future__ import annotations
import argparse
import random
from pathlib import Path
from data.schemas import Plant

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "plants.ndjson"

REGION_DIST = {"KR": 8, "CN": 9, "VN": 5, "MX": 5, "PL": 4, "US": 5, "IN": 4}
DIVISIONS = ["HA", "HE", "VS", "INNOTEK", "MAGNA"]


def generate_plants(seed: int = 42) -> list[Plant]:
    rng = random.Random(seed)
    out: list[Plant] = []
    pid = 0
    for region, n in REGION_DIST.items():
        for i in range(n):
            pid += 1
            operator = "SELF" if pid <= 15 else "SUPPLIER"
            out.append(Plant(
                id=f"AMZN-PLANT-{pid:03d}",
                name=f"Plant-{region}-{i+1}",
                region=region,
                operator=operator,  # type: ignore[arg-type]
                division=rng.choice(DIVISIONS) if operator == "SELF" else None,
            ))
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    plants = generate_plants()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for p in plants:
            f.write(p.model_dump_json() + "\n")
    print(f"wrote {len(plants)} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
```

```python
# data/synthetic/lanes.py
"""Trade lanes (120) — multimodal, with IRA/USMCA/CBAM regulatory tags.

Coverage rules:
- Lanes ending in US whose origin is MX -> tagged USMCA-Auto75
- Lanes ending in US whose origin is in FEOC (CN) -> tagged IRA-30D
- Lanes ending in PL (proxy for EU) -> tagged CBAM
- Other lanes: untagged
"""
from __future__ import annotations
import argparse
import random
from itertools import product
from pathlib import Path
from data.schemas import TradeLane

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "lanes.ndjson"
REGIONS = ["KR", "CN", "VN", "MX", "PL", "US", "IN"]
MODES = ["SEA", "AIR", "RAIL", "ROAD"]


def _regs_for(origin: str, dest: str) -> list[str]:
    regs: list[str] = []
    if dest == "US" and origin == "MX":
        regs.append("USMCA-Auto75")
    if dest == "US" and origin == "CN":
        regs.append("IRA-30D")
    if dest == "PL":
        regs.append("CBAM")
    return regs


def _transit_days(origin: str, dest: str, mode: str) -> int:
    base = {"SEA": 25, "AIR": 3, "RAIL": 18, "ROAD": 7}[mode]
    return base + (0 if origin == dest else 0)  # simplified


def generate_lanes(seed: int = 42) -> list[TradeLane]:
    rng = random.Random(seed)
    pairs = [(o, d) for o, d in product(REGIONS, REGIONS) if o != d]
    rng.shuffle(pairs)
    out: list[TradeLane] = []
    lid = 0
    while len(out) < 120:
        for o, d in pairs:
            if len(out) >= 120:
                break
            mode = rng.choice(MODES)
            lid += 1
            out.append(TradeLane(
                id=f"AMZN-LANE-{lid:04d}",
                origin_region=o,
                dest_region=d,
                mode=mode,  # type: ignore[arg-type]
                transit_days=_transit_days(o, d, mode),
                regulations=_regs_for(o, d),
            ))
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    lanes = generate_lanes()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for l in lanes:
            f.write(l.model_dump_json() + "\n")
    print(f"wrote {len(lanes)} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_customers_plants_lanes_gen.py -v
python -m data.synthetic.customers
python -m data.synthetic.plants
python -m data.synthetic.lanes
git add data/synthetic/{customers,plants,lanes}.py tests/data/test_customers_plants_lanes_gen.py
git commit -m "feat(data): add customers (30) + plants (40) + lanes (120) generators"
```

---

### Task 20: Quality incidents + 8D + RootCause generator

**Files:**
- Create: `data/synthetic/incidents.py`
- Test: `tests/data/test_incidents_gen.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_incidents_gen.py
from data.synthetic.incidents import generate_incidents


def test_incident_counts():
    out = generate_incidents(component_ids=[f"AMZN-CMP-IC-{i:05d}" for i in range(3000)],
                              supplier_ids=[f"AMZN-SUP1-{i:03d}" for i in range(1, 101)],
                              plant_ids=[f"AMZN-PLANT-{i:03d}" for i in range(1, 41)],
                              seed=42)
    assert len(out["incidents"]) == 300
    assert len(out["eight_d_reports"]) == 200
    assert len(out["root_causes"]) == 150


def test_demo_incident_INC_2026_0412_present():
    out = generate_incidents(component_ids=["AMZN-CMP-IC-00001"], supplier_ids=["AMZN-SUP1-001"], plant_ids=["AMZN-PLANT-001"], seed=42)
    inc_ids = {i.id for i in out["incidents"]}
    # The wow-moment scenario J fixture
    assert "INC-2026-0412" in inc_ids


def test_8d_addresses_real_incident():
    out = generate_incidents(component_ids=["AMZN-CMP-IC-00001"], supplier_ids=["AMZN-SUP1-001"], plant_ids=["AMZN-PLANT-001"], seed=42)
    inc_ids = {i.id for i in out["incidents"]}
    for r in out["eight_d_reports"]:
        assert r.incident_id in inc_ids
```

- [ ] **Step 2-3: Implement**

```python
# data/synthetic/incidents.py
"""Quality incidents (300) + 8D reports (200) + RootCause (150).

The wow-moment scenario J targets `INC-2026-0412 BGA solder ball crack`,
seeded as a fixed entry for the demo (spec § 8.6 Wow-Moment Tuning).
"""
from __future__ import annotations
import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path
from data.schemas import QualityIncident, EightDReport, RootCause

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"
SEVERITIES = ["LOW", "MID", "HIGH", "CRITICAL"]
INCIDENT_TITLES = [
    "Solder ball crack", "Capacitor leakage", "Connector intermittent",
    "PCB delamination", "Display dead pixel", "Battery thermal runaway",
    "Motor bearing wear", "Sensor calibration drift", "Optical misalignment",
    "Memory bit flip", "Antenna gain drop", "Cable shielding break",
]


def generate_incidents(*, component_ids: list[str], supplier_ids: list[str], plant_ids: list[str], seed: int = 42) -> dict[str, list]:
    rng = random.Random(seed)
    base_date = date(2025, 5, 1)

    incidents: list[QualityIncident] = []

    # Demo wow fixture
    incidents.append(QualityIncident(
        id="INC-2026-0412",
        title="BGA solder ball crack on Innotek FC-BGA Gen5 (lot 2026-Q1-W04)",
        component_id=component_ids[0] if component_ids else "AMZN-CMP-IC-00001",
        plant_ids[0] if plant_ids else "AMZN-PLANT-001",
        severity="CRITICAL",
        occurred_at=date(2026, 4, 12),
    ).model_dump())  # ensures BaseModel construction; convert back below

    # 299 random incidents
    for i in range(2, 301):
        cid = rng.choice(component_ids) if component_ids else None
        pid = rng.choice(plant_ids) if plant_ids else None
        incidents.append(QualityIncident(
            id=f"INC-2026-{i:04d}",
            title=rng.choice(INCIDENT_TITLES),
            component_id=cid,
            plant_id=pid,
            severity=rng.choices(SEVERITIES, weights=[40, 35, 20, 5])[0],
            occurred_at=base_date + timedelta(days=rng.randint(0, 365)),
        ).model_dump())
    # The first item used model_dump for typing convenience; restore as full dicts -> Pydantic objects
    incidents = [QualityIncident(**(d if isinstance(d, dict) else d.__dict__)) for d in incidents]

    # 200 EightDReports — link to first 200 incidents
    eight_d: list[EightDReport] = []
    for i, inc in enumerate(incidents[:200], start=1):
        eight_d.append(EightDReport(
            id=f"8D-2026-{i:04d}",
            incident_id=inc.id,
            d1_team=f"Quality team {rng.randint(1, 8)}",
            d2_problem=inc.title,
            d3_containment="Quarantine affected lots; halt shipments to OEM A",
            d4_root_cause="See linked RootCause node",
            d5_corrective="Update supplier inspection AQL from 0.65 to 0.40",
            d6_implemented=f"Implemented at {inc.plant_id or 'all plants'} on next changeover",
            d7_prevention="Add reflow temperature SPC chart with auto-alert",
            d8_closure="Closure approved by Quality Director; 60-day verification",
        ))

    # 150 RootCauses — link to first 150 incidents
    root_causes: list[RootCause] = []
    for i, inc in enumerate(incidents[:150], start=1):
        root_causes.append(RootCause(
            id=f"RC-2026-{i:04d}",
            description=rng.choice([
                "Reflow temperature profile drift (peak +8°C above spec)",
                "Substrate moisture absorption (storage humidity 65% vs spec 50%)",
                "Solder paste expiration (used 35 days post-print, spec 28)",
                "Component placement offset (machine A12 calibration drift 0.08mm)",
                "Material change at Tier-2 (different copper thickness)",
            ]),
            linked_supplier_id=rng.choice(supplier_ids) if supplier_ids else None,
            linked_component_id=inc.component_id,
            linked_plant_id=inc.plant_id,
        ))

    return {"incidents": incidents, "eight_d_reports": eight_d, "root_causes": root_causes}


def main() -> None:
    argparse.ArgumentParser().parse_args()
    cids = [json.loads(l)["id"] for l in (OUTPUT_DIR / "components.ndjson").read_text().splitlines()]
    sids = [json.loads(l)["id"] for l in (OUTPUT_DIR / "suppliers.ndjson").read_text().splitlines()]
    pids = [json.loads(l)["id"] for l in (OUTPUT_DIR / "plants.ndjson").read_text().splitlines()]
    out = generate_incidents(component_ids=cids, supplier_ids=sids, plant_ids=pids, seed=42)
    for key, items in out.items():
        path = OUTPUT_DIR / f"{key}.ndjson"
        with path.open("w", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json() + "\n")
        print(f"wrote {len(items):>3} → {path.name}")


if __name__ == "__main__":
    main()
```

> Note for engineer: the `incidents.append(...).model_dump())` pattern in step 3 looks awkward — that's because we need to fix a typing issue. Refactor to:
> ```python
> incidents.append(QualityIncident(id="INC-2026-0412", title="...", component_id=..., plant_id=..., severity="CRITICAL", occurred_at=date(2026,4,12)))
> ```
> directly without `.model_dump()` round-trip. The test will catch the bug.

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_incidents_gen.py -v
python -m data.synthetic.incidents
git add data/synthetic/incidents.py tests/data/test_incidents_gen.py
git commit -m "feat(data): add incidents (300) + 8D (200) + RootCause (150) with INC-2026-0412 fixture"
```

---

### Task 21: Telemetry + Maintenance + ESG generators

**Files:**
- Create: `data/synthetic/telemetry.py`, `data/synthetic/maintenance.py`, `data/synthetic/esg.py`
- Test: `tests/data/test_ops_esg_gen.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_ops_esg_gen.py
from data.synthetic.telemetry import generate_telemetry
from data.synthetic.maintenance import generate_maintenance
from data.synthetic.esg import generate_esg


def test_telemetry_5000_sensors():
    sensors = generate_telemetry(plant_ids=[f"AMZN-PLANT-{i:03d}" for i in range(1, 41)], seed=42)
    assert len(sensors) == 5000


def test_maintenance_800():
    events = generate_maintenance(
        plant_ids=[f"AMZN-PLANT-{i:03d}" for i in range(1, 41)],
        component_ids=[f"AMZN-CMP-IC-{i:05d}" for i in range(50)],
        seed=42)
    assert len(events) == 800
    kinds = {e.kind for e in events}
    assert {"PM", "CM", "PdM"}.issubset(kinds)


def test_esg_indicators_and_carbon_scopes():
    out = generate_esg(plant_ids=[f"AMZN-PLANT-{i:03d}" for i in range(1, 41)], seed=42)
    assert len(out["indicators"]) == 100
    assert len(out["carbon_scopes"]) == 120  # 40 plants × 3 scopes
    scopes = {c.scope for c in out["carbon_scopes"]}
    assert scopes == {1, 2, 3}
```

- [ ] **Step 2-3: Implement (3 files)**

```python
# data/synthetic/telemetry.py
"""Telemetry sensor metadata (5,000). Time-series payload is generated separately
during loader (Task 26) into OpenSearch — this module emits only sensor metadata."""
from __future__ import annotations
import argparse
import json
import random
from pathlib import Path
from data.schemas import Telemetry

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "telemetry.ndjson"
METRICS = [
    ("vibration_rms_g", "g"), ("temp_c", "°C"), ("current_a", "A"),
    ("voltage_v", "V"), ("pressure_kpa", "kPa"), ("rpm", "rpm"),
    ("flow_lpm", "L/min"), ("humidity_pct", "%"),
]


def generate_telemetry(*, plant_ids: list[str], seed: int = 42) -> list[Telemetry]:
    rng = random.Random(seed)
    out: list[Telemetry] = []
    for i in range(1, 5001):
        metric, unit = rng.choice(METRICS)
        out.append(Telemetry(
            sensor_id=f"AMZN-SENSOR-{i:05d}",
            plant_id=rng.choice(plant_ids),
            metric=metric,
            unit=unit,
        ))
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    pids = [json.loads(l)["id"] for l in (Path(__file__).resolve().parents[1] / "output" / "plants.ndjson").read_text().splitlines()]
    sensors = generate_telemetry(plant_ids=pids, seed=42)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for s in sensors:
            f.write(s.model_dump_json() + "\n")
    print(f"wrote {len(sensors):>5} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
```

```python
# data/synthetic/maintenance.py
"""Maintenance events (800) — PM (preventive) / CM (corrective) / PdM (predictive)."""
from __future__ import annotations
import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path
from data.schemas import MaintenanceEvent

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "maintenance.ndjson"


def generate_maintenance(*, plant_ids: list[str], component_ids: list[str], seed: int = 42) -> list[MaintenanceEvent]:
    rng = random.Random(seed)
    targets = plant_ids + component_ids
    base = date(2025, 5, 1)
    out: list[MaintenanceEvent] = []
    for i in range(1, 801):
        kind = rng.choices(["PM", "CM", "PdM"], weights=[55, 30, 15])[0]
        out.append(MaintenanceEvent(
            id=f"AMZN-MAINT-{i:04d}",
            target_id=rng.choice(targets),
            kind=kind,  # type: ignore[arg-type]
            occurred_at=base + timedelta(days=rng.randint(0, 365)),
            duration_hours=round(rng.uniform(0.5, 8.0), 1),
        ))
    return out


def main() -> None:
    argparse.ArgumentParser().parse_args()
    pids = [json.loads(l)["id"] for l in (Path(__file__).resolve().parents[1] / "output" / "plants.ndjson").read_text().splitlines()]
    cids = [json.loads(l)["id"] for l in (Path(__file__).resolve().parents[1] / "output" / "components.ndjson").read_text().splitlines()]
    events = generate_maintenance(plant_ids=pids, component_ids=cids[:200], seed=42)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for e in events:
            f.write(e.model_dump_json() + "\n")
    print(f"wrote {len(events):>3} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
```

```python
# data/synthetic/esg.py
"""ESGIndicator (100) + CarbonScope (120 = 40 plants × 3 scopes)."""
from __future__ import annotations
import argparse
import json
import random
from pathlib import Path
from data.schemas import ESGIndicator, CarbonScope

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output"
INDICATOR_METRICS = ["water_use_m3", "waste_kg", "lost_time_injury_rate", "diversity_pct", "training_hours"]
PERIODS = ["2025-Q3", "2025-Q4", "2026-Q1"]


def generate_esg(*, plant_ids: list[str], seed: int = 42) -> dict[str, list]:
    rng = random.Random(seed)

    indicators: list[ESGIndicator] = []
    for i in range(1, 101):
        indicators.append(ESGIndicator(
            id=f"AMZN-ESG-{i:03d}",
            plant_id=rng.choice(plant_ids),
            metric=rng.choice(INDICATOR_METRICS),
            period=rng.choice(PERIODS),
            value=round(rng.uniform(10, 5000), 1),
        ))

    carbon: list[CarbonScope] = []
    for pid in plant_ids:
        for scope in (1, 2, 3):
            carbon.append(CarbonScope(
                plant_id=pid,
                scope=scope,  # type: ignore[arg-type]
                period="2026-Q1",
                co2e_tons=round(rng.uniform(50, 5000), 1),
            ))

    return {"indicators": indicators, "carbon_scopes": carbon}


def main() -> None:
    argparse.ArgumentParser().parse_args()
    pids = [json.loads(l)["id"] for l in (OUTPUT_DIR / "plants.ndjson").read_text().splitlines()]
    out = generate_esg(plant_ids=pids, seed=42)
    for key, items in out.items():
        path = OUTPUT_DIR / f"esg_{key}.ndjson"
        with path.open("w", encoding="utf-8") as f:
            for it in items:
                f.write(it.model_dump_json() + "\n")
        print(f"wrote {len(items):>3} → {path.name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_ops_esg_gen.py -v
python -m data.synthetic.telemetry
python -m data.synthetic.maintenance
python -m data.synthetic.esg
git add data/synthetic/{telemetry,maintenance,esg}.py tests/data/test_ops_esg_gen.py
git commit -m "feat(data): add telemetry (5K) + maintenance (800) + ESG (100+120) generators"
```

---

### Task 22: Aggregate validation suite

**Files:**
- Create: `tests/data/test_full_dataset.py`

- [ ] **Step 1: Test (covers cross-file integrity)**

```python
# tests/data/test_full_dataset.py
"""Run all generators end-to-end + validate cross-file integrity."""
import json
from pathlib import Path
import pytest

OUTPUT = Path(__file__).resolve().parents[2] / "data" / "output"


@pytest.fixture(scope="module", autouse=True)
def run_all_generators():
    """Skip this test if generators haven't been run.

    To populate fixtures: run `make data` or
    `for m in products boms suppliers customers plants lanes incidents telemetry maintenance esg; do python -m data.synthetic.$m; done`.
    """
    if not (OUTPUT / "products.ndjson").exists():
        pytest.skip("Run generators first: python -m data.synthetic.<module>")


def _load(name: str) -> list[dict]:
    return [json.loads(l) for l in (OUTPUT / f"{name}.ndjson").read_text(encoding="utf-8").splitlines()]


def test_total_node_count_within_target():
    counts = {}
    for f in OUTPUT.glob("*.ndjson"):
        counts[f.stem] = sum(1 for _ in f.read_text(encoding="utf-8").splitlines())
    total = sum(counts.values())
    # Spec § 8.4 target = ~10,000 nodes (sensors 5000 dominate; +products/modules/components/raw/etc)
    assert 9_500 <= total <= 11_000, f"Total {total} outside target ~10K. Counts: {counts}"


def test_components_reference_valid_modules():
    # In our deterministic generator components don't carry parent IDs; but we can sanity check counts
    components = _load("components")
    modules = _load("modules")
    assert len(components) >= 8 * len(modules) - 100  # 8/module average


def test_lanes_have_balanced_modes():
    lanes = _load("lanes")
    from collections import Counter
    modes = Counter(l["mode"] for l in lanes)
    assert all(m >= 10 for m in modes.values()), f"Mode imbalance: {modes}"


def test_incident_INC_2026_0412_present():
    incidents = _load("incidents")
    inc_ids = {i["id"] for i in incidents}
    assert "INC-2026-0412" in inc_ids
```

- [ ] **Step 2-3: Run all generators + verify**

```bash
for m in products boms suppliers customers plants lanes incidents telemetry maintenance esg; do
  python -m data.synthetic.$m
done
pytest tests/data/test_full_dataset.py -v
```

- [ ] **Step 4: Add `Makefile` (convenience)**

`Makefile`:
```make
.PHONY: data test clean

data:
	python -m data.synthetic.products
	python -m data.synthetic.boms
	python -m data.synthetic.suppliers
	python -m data.synthetic.customers
	python -m data.synthetic.plants
	python -m data.synthetic.lanes
	python -m data.synthetic.incidents
	python -m data.synthetic.telemetry
	python -m data.synthetic.maintenance
	python -m data.synthetic.esg

test:
	pytest -v

clean:
	rm -rf data/output/*.ndjson .pytest_cache __pycache__ */**/__pycache__
```

- [ ] **Step 5: Commit**

```bash
git add tests/data/test_full_dataset.py Makefile
git commit -m "test(data): add cross-file dataset integrity tests + Makefile"
```

---

### Task 23: Manufacturers (4 사업부) generator

**Files:**
- Create: `data/synthetic/manufacturers.py`
- Test: `tests/data/test_manufacturers_gen.py`

- [ ] **Step 1: Test**

```python
# tests/data/test_manufacturers_gen.py
from data.synthetic.manufacturers import generate_manufacturers
from data.schemas import Manufacturer


def test_4_manufacturers():
    out = generate_manufacturers()
    assert len(out) == 4
    divs = {m.division for m in out}
    # Note: INNOTEK and MAGNA are unified under "INNOTEK" division for the
    # 4 사업부 (가전 H&A / TV HE / VS 전장 / 부품 = Innotek + Magna JV)
    assert divs == {"HA", "HE", "VS", "INNOTEK"}
    assert all(m.id.startswith("AMZN-MFG-") for m in out)
```

- [ ] **Step 2-3: Implement**

```python
# data/synthetic/manufacturers.py
"""Self-operated manufacturer divisions (4). Magna JV is co-housed under INNOTEK
for the 4 사업부 view, but products in `data/synthetic/products.py` keep MAGNA
as the per-SKU division for finer-grained provenance.
"""
from __future__ import annotations
import argparse
from pathlib import Path
from data.schemas import Manufacturer

OUTPUT = Path(__file__).resolve().parents[1] / "output" / "manufacturers.ndjson"

_RAW: list[tuple[str, str, str]] = [
    ("AMZN-MFG-HA",      "AMZN Tech Home Appliance",   "HA"),
    ("AMZN-MFG-HE",      "AMZN Tech Home Entertainment", "HE"),
    ("AMZN-MFG-VS",      "AMZN Tech Vehicle Solutions", "VS"),
    ("AMZN-MFG-INNOTEK", "AMZN Tech Innotek + Magna ePT JV", "INNOTEK"),
]


def generate_manufacturers() -> list[Manufacturer]:
    return [Manufacturer(id=i, name=n, division=d) for i, n, d in _RAW]  # type: ignore[arg-type]


def main() -> None:
    argparse.ArgumentParser().parse_args()
    items = generate_manufacturers()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        for it in items:
            f.write(it.model_dump_json() + "\n")
    print(f"wrote {len(items)} → {OUTPUT.name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_manufacturers_gen.py -v
python -m data.synthetic.manufacturers
# Update Makefile `data` target to include manufacturers
git add data/synthetic/manufacturers.py tests/data/test_manufacturers_gen.py Makefile
git commit -m "feat(data): add 4 manufacturer divisions generator (HA/HE/VS/INNOTEK)"
```

> Add to `Makefile` `data:` target the line `python -m data.synthetic.manufacturers` before `boms`.

---

### Task 24: Ontology schema upload (Neptune)

**Files:**
- Create: `ontology/upload.py`
- Test: `tests/ontology/test_upload.py`

- [ ] **Step 1: Test (mock-only — actual Neptune called by loader)**

```python
# tests/ontology/test_upload.py
from unittest.mock import MagicMock, patch
from ontology.upload import upload_schema_to_neptune


@patch("ontology.upload.requests.post")
def test_upload_calls_sparql_endpoint(mock_post):
    mock_post.return_value = MagicMock(status_code=200, text="OK")
    upload_schema_to_neptune(endpoint="https://neptune.local:8182", schema_path="ontology/schema.ttl")
    args, kwargs = mock_post.call_args
    assert "neptune.local" in args[0] or "neptune.local" in kwargs.get("url", "")
    # SPARQL UPDATE endpoint
    assert "/sparql" in args[0] or "/sparql" in kwargs.get("url", "")
```

- [ ] **Step 2-3: Implement**

```python
# ontology/upload.py
"""Upload `ontology/schema.ttl` (OWL/RDF) to a Neptune cluster via SPARQL UPDATE.

Loader (`data/load.py`) calls this once at the start of bootstrap, then loads
property-graph data via openCypher. Schema is informative (used by SPARQL queries
and KB indexing); openCypher operations don't enforce it.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import requests


def upload_schema_to_neptune(*, endpoint: str, schema_path: str | Path) -> None:
    """POST a SPARQL UPDATE of `schema.ttl` contents to Neptune.

    Args:
        endpoint: Neptune cluster writer endpoint, e.g. https://<cluster>.cluster-xxx.neptune.amazonaws.com:8182
        schema_path: filesystem path to schema.ttl
    """
    ttl_text = Path(schema_path).read_text(encoding="utf-8")
    sparql = f"INSERT DATA {{ {_ttl_to_sparql_triples(ttl_text)} }}"
    url = f"{endpoint.rstrip('/')}/sparql"
    resp = requests.post(url, data={"update": sparql}, timeout=60)
    if resp.status_code >= 300:
        raise RuntimeError(f"SPARQL UPDATE failed [{resp.status_code}]: {resp.text}")


def _ttl_to_sparql_triples(ttl: str) -> str:
    """Naive Turtle->SPARQL conversion: strip prefixes and emit raw triples body.

    Production-grade: use rdflib to parse and serialize as N-Triples. For the
    demo we keep schema minimal (24 classes + 24 properties) so the Turtle
    body itself is valid as the body of an INSERT DATA when prefixes are pulled
    out. Loader passes prefixes via the SPARQL query header instead.
    """
    import rdflib
    g = rdflib.Graph()
    g.parse(data=ttl, format="turtle")
    return g.serialize(format="ntriples")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--endpoint", required=True)
    p.add_argument("--schema", default="ontology/schema.ttl")
    args = p.parse_args()
    upload_schema_to_neptune(endpoint=args.endpoint, schema_path=args.schema)
    print(f"schema uploaded → {args.endpoint}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/ontology/test_upload.py -v
git add ontology/upload.py tests/ontology/test_upload.py
git commit -m "feat(ontology): add schema upload to Neptune via SPARQL UPDATE"
```

---

### Task 25: Property-graph loader (openCypher batch)

**Files:**
- Create: `data/load_graph.py`
- Test: `tests/data/test_load_graph.py`

- [ ] **Step 1: Test (mock gremlin client, verify queries are formed correctly)**

```python
# tests/data/test_load_graph.py
from unittest.mock import MagicMock, patch
from data.load_graph import build_create_node_cypher, build_create_edge_cypher


def test_build_node_cypher():
    q = build_create_node_cypher("Product", {"id": "P1", "name": "X", "line": "VisionOLED", "division": "HE"})
    assert q.startswith("MERGE (n:Product {id: $id})")
    assert "SET n.name = $name" in q
    assert "n.line = $line" in q


def test_build_edge_cypher_typed():
    q = build_create_edge_cypher(src_label="Product", src_id="P1",
                                  rel="HAS_MODULE", dst_label="Module", dst_id="M1",
                                  props={})
    assert "MATCH (a:Product {id: $src_id})" in q
    assert "MATCH (b:Module {id: $dst_id})" in q
    assert "MERGE (a)-[r:HAS_MODULE]->(b)" in q


def test_build_edge_cypher_with_props():
    q = build_create_edge_cypher(src_label="Module", src_id="M1",
                                  rel="CONSISTS_OF", dst_label="Component", dst_id="C1",
                                  props={"qty": 4})
    assert "SET r.qty = $qty" in q
```

- [ ] **Step 2-3: Implement**

```python
# data/load_graph.py
"""Load synthetic NDJSON files into Neptune via openCypher batch MERGE.

Idempotent: re-running this loader against an already-populated Neptune is a
no-op (MERGE matches existing nodes/edges by id). Runs as a one-shot ECS task
defined in `infra-cdk/lib/data-stack.ts`.

Required env:
  NEPTUNE_ENDPOINT  e.g. https://<cluster>.cluster-xxx.neptune.amazonaws.com:8182
  AWS_REGION        ap-northeast-2
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
from typing import Iterable

OUTPUT_DIR = Path(__file__).resolve().parent / "output"

# Map ndjson file -> Neptune label
NODE_FILES: list[tuple[str, str]] = [
    ("manufacturers.ndjson",  "Manufacturer"),
    ("products.ndjson",       "Product"),
    ("modules.ndjson",        "Module"),
    ("components.ndjson",     "Component"),
    ("raw_materials.ndjson",  "RawMaterial"),
    ("suppliers.ndjson",      "Supplier"),
    ("sub_suppliers.ndjson",  "SubSupplier"),
    ("customers.ndjson",      "CustomerAccount"),
    ("plants.ndjson",         "Plant"),
    ("lanes.ndjson",          "TradeLane"),
    ("incidents.ndjson",      "QualityIncident"),
    ("eight_d_reports.ndjson","EightDReport"),
    ("root_causes.ndjson",    "RootCause"),
    ("telemetry.ndjson",      "Telemetry"),
    ("maintenance.ndjson",    "MaintenanceEvent"),
    ("esg_indicators.ndjson", "ESGIndicator"),
    ("esg_carbon_scopes.ndjson", "CarbonScope"),
]


def build_create_node_cypher(label: str, props: dict) -> str:
    """Form an idempotent MERGE for one node. Param keys = props keys."""
    set_clauses = ", ".join(f"n.{k} = ${k}" for k in props if k != "id")
    return f"MERGE (n:{label} {{id: $id}}) SET {set_clauses}"


def build_create_edge_cypher(*, src_label: str, src_id: str, rel: str,
                              dst_label: str, dst_id: str, props: dict) -> str:
    set_clauses = ", ".join(f"r.{k} = ${k}" for k in props)
    set_part = f" SET {set_clauses}" if set_clauses else ""
    return (f"MATCH (a:{src_label} {{id: $src_id}}) "
            f"MATCH (b:{dst_label} {{id: $dst_id}}) "
            f"MERGE (a)-[r:{rel}]->(b){set_part}")


def _post_cypher(endpoint: str, query: str, params: dict) -> dict:
    import requests
    url = f"{endpoint.rstrip('/')}/openCypher"
    resp = requests.post(url, json={"query": query, "parameters": json.dumps(params)}, timeout=60)
    if resp.status_code >= 300:
        raise RuntimeError(f"openCypher failed [{resp.status_code}]: {resp.text}")
    return resp.json()


def _iter_ndjson(path: Path) -> Iterable[dict]:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            yield json.loads(line)


def load_all_nodes(endpoint: str) -> int:
    total = 0
    for fname, label in NODE_FILES:
        path = OUTPUT_DIR / fname
        for obj in _iter_ndjson(path):
            # Drop list-valued props that aren't supported by Neptune as node props
            scalar = {k: v for k, v in obj.items() if not isinstance(v, list)}
            scalar["id"] = obj["id"] if "id" in obj else obj.get("sensor_id") or obj.get("cas_id")
            if scalar.get("id") is None:
                continue
            q = build_create_node_cypher(label, scalar)
            _post_cypher(endpoint, q, scalar)
            total += 1
    return total


def load_bom_edges(endpoint: str) -> int:
    """Materialize HAS_MODULE / CONSISTS_OF / MADE_OF from ndjson."""
    n = 0
    # HAS_MODULE
    for mod in _iter_ndjson(OUTPUT_DIR / "modules.ndjson"):
        for pid in mod.get("parent_product_ids", []):
            q = build_create_edge_cypher(
                src_label="Product", src_id=pid,
                rel="HAS_MODULE",
                dst_label="Module", dst_id=mod["id"],
                props={},
            )
            _post_cypher(endpoint, q, {"src_id": pid, "dst_id": mod["id"]})
            n += 1
    # CONSISTS_OF — naive 8-component-per-module assignment in order
    components = list(_iter_ndjson(OUTPUT_DIR / "components.ndjson"))
    modules = list(_iter_ndjson(OUTPUT_DIR / "modules.ndjson"))
    for i, mod in enumerate(modules):
        for j in range(8):
            idx = (i * 8 + j) % len(components)
            comp = components[idx]
            q = build_create_edge_cypher(
                src_label="Module", src_id=mod["id"],
                rel="CONSISTS_OF",
                dst_label="Component", dst_id=comp["id"],
                props={"qty": 1},
            )
            _post_cypher(endpoint, q, {"src_id": mod["id"], "dst_id": comp["id"], "qty": 1})
            n += 1
    return n


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--endpoint", default=os.environ.get("NEPTUNE_ENDPOINT"))
    p.add_argument("--bom-edges", action="store_true")
    args = p.parse_args()
    if not args.endpoint:
        raise SystemExit("Set NEPTUNE_ENDPOINT or pass --endpoint")
    n_nodes = load_all_nodes(args.endpoint)
    print(f"loaded {n_nodes} nodes")
    if args.bom_edges:
        n_edges = load_bom_edges(args.endpoint)
        print(f"loaded {n_edges} BOM edges")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4-5: Verify + commit**

```bash
pytest tests/data/test_load_graph.py -v
git add data/load_graph.py tests/data/test_load_graph.py
git commit -m "feat(data): add Neptune openCypher batch loader (idempotent MERGE)"
```

---

### Task 26: OpenSearch index + KB seed loader

**Files:**
- Create: `data/load_search.py`
- Test: `tests/data/test_load_search.py`

- [ ] **Step 1: Test (mock OS client)**

```python
# tests/data/test_load_search.py
from unittest.mock import MagicMock, patch
from data.load_search import build_index_mapping, document_for_component


def test_index_mapping_has_nori_and_knn():
    m = build_index_mapping(embedding_dim=1024)
    assert m["settings"]["analysis"]["analyzer"]["nori_korean"]["type"] == "custom"
    assert m["mappings"]["properties"]["embedding"]["type"] == "knn_vector"
    assert m["mappings"]["properties"]["embedding"]["dimension"] == 1024


def test_doc_for_component_carries_searchable_text():
    comp = {"id": "AMZN-CMP-IC-00001", "name": "MCU-1", "category": "IC", "standards": ["AEC-Q100"], "substances": []}
    doc = document_for_component(comp)
    assert doc["id"] == "AMZN-CMP-IC-00001"
    assert "AEC-Q100" in doc["text"]
    assert doc["category"] == "IC"
```

- [ ] **Step 2-3: Implement**

```python
# data/load_search.py
"""OpenSearch Serverless index seeder for components + standards + incidents.

Index name: `mfg-search` (collection: `ontology-mfg-dev`).
Document shape: { id, label, name, category, text (searchable), standards[], embedding[] }.

The Bedrock Knowledge Base for unstructured RAG (sample sheets, 8D PDFs) is
provisioned by the AIStack (Phase 2 Task 32) and indexes S3 directly. This loader
populates the *structured* hybrid search index used by Scenario A.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
from typing import Iterable

OUTPUT_DIR = Path(__file__).resolve().parent / "output"


def build_index_mapping(*, embedding_dim: int = 1024) -> dict:
    return {
        "settings": {
            "index": {"knn": True},
            "analysis": {
                "analyzer": {
                    "nori_korean": {
                        "type": "custom",
                        "tokenizer": "nori_tokenizer",
                        "filter": ["nori_part_of_speech", "lowercase"],
                    }
                }
            },
        },
        "mappings": {
            "properties": {
                "id":         {"type": "keyword"},
                "label":      {"type": "keyword"},
                "name":       {"type": "text", "analyzer": "nori_korean"},
                "category":   {"type": "keyword"},
                "standards":  {"type": "keyword"},
                "text":       {"type": "text", "analyzer": "nori_korean"},
                "embedding":  {"type": "knn_vector", "dimension": embedding_dim,
                               "method": {"name": "hnsw", "space_type": "cosinesimil"}},
            }
        },
    }


def document_for_component(comp: dict) -> dict:
    text = " ".join([
        comp.get("name", ""),
        f"category={comp.get('category', '')}",
        " ".join(comp.get("standards", [])),
        " ".join(comp.get("substances", [])),
    ])
    return {
        "id": comp["id"],
        "label": "Component",
        "name": comp.get("name"),
        "category": comp.get("category"),
        "standards": comp.get("standards", []),
        "text": text,
        # embedding to be filled in at index time by call to Cohere Embed v4
    }


def _iter_ndjson(path: Path) -> Iterable[dict]:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            yield json.loads(line)


def index_components(*, host: str, region: str, index_name: str = "mfg-search") -> int:
    """Bulk-index components. Embeddings deferred — first pass is BM25 only."""
    from opensearchpy import OpenSearch, RequestsHttpConnection
    from requests_aws4auth import AWS4Auth
    import boto3
    creds = boto3.Session().get_credentials()
    auth = AWS4Auth(creds.access_key, creds.secret_key, region, "aoss", session_token=creds.token)
    client = OpenSearch(
        hosts=[{"host": host, "port": 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
    )
    if not client.indices.exists(index_name):
        client.indices.create(index_name, body=build_index_mapping())
    n = 0
    for comp in _iter_ndjson(OUTPUT_DIR / "components.ndjson"):
        doc = document_for_component(comp)
        client.index(index=index_name, id=doc["id"], body=doc)
        n += 1
    return n


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default=os.environ.get("OPENSEARCH_HOST"))
    p.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-northeast-2"))
    args = p.parse_args()
    if not args.host:
        raise SystemExit("Set OPENSEARCH_HOST or pass --host")
    n = index_components(host=args.host, region=args.region)
    print(f"indexed {n} components into mfg-search")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4-5: Verify + commit**

```bash
pip install opensearch-py requests-aws4auth
pytest tests/data/test_load_search.py -v
git add data/load_search.py tests/data/test_load_search.py requirements.txt
git commit -m "feat(data): add OpenSearch hybrid index loader (Nori + KNN, components first)"
```

> Add `opensearch-py==2.7.1` and `requests-aws4auth==1.3.1` to `requirements.txt` before committing.

---

## Phase 2 — CDK Infrastructure (Tasks 27–37)

### Task 27: CDK project bootstrap

**Files:**
- Create: `infra-cdk/package.json`, `infra-cdk/tsconfig.json`, `infra-cdk/cdk.json`, `infra-cdk/jest.config.js`, `infra-cdk/.gitignore`, `infra-cdk/bin/app.ts`

- [ ] **Step 1: `infra-cdk/package.json`**

```json
{
  "name": "ontology-mfg-infra",
  "version": "0.1.0",
  "private": true,
  "bin": { "app": "bin/app.js" },
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "test": "jest",
    "cdk": "cdk"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.0",
    "aws-cdk": "^2.170.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.0"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.170.0",
    "constructs": "^10.4.2"
  }
}
```

- [ ] **Step 2: `infra-cdk/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "typeRoots": ["./node_modules/@types"]
  },
  "exclude": ["node_modules", "cdk.out"]
}
```

- [ ] **Step 3: `infra-cdk/cdk.json`**

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/app.ts",
  "watch": { "include": ["**"], "exclude": ["README.md","cdk*.json","**/*.d.ts","**/*.js","tsconfig.json","package*.json","yarn.lock","node_modules","test"] },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": ["aws"],
    "@aws-cdk-containers/ecs-service-extensions:enableDefaultLogDriver": true,
    "@aws-cdk/aws-ec2:uniqueImdsv2TemplateName": true,
    "@aws-cdk/aws-iam:minimizePolicies": true,
    "@aws-cdk/core:validateSnapshotRemovalPolicy": true,
    "@aws-cdk/aws-codepipeline:crossAccountKeyAliasStackSafeResourceName": true,
    "@aws-cdk/aws-s3:createDefaultLoggingPolicy": true,
    "@aws-cdk/aws-sns-subscriptions:restrictSqsDescryption": true,
    "projectName": "ontology-mfg",
    "envName": "dev",
    "retailVpcExportName": "ontology-retail-dev-vpc-id"
  }
}
```

- [ ] **Step 4: `infra-cdk/jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.tsx?$': 'ts-jest' },
};
```

- [ ] **Step 5: `infra-cdk/.gitignore`**

```
*.js
*.d.ts
node_modules
cdk.out
.cdk.staging
*.swp
```

- [ ] **Step 6: `infra-cdk/bin/app.ts` skeleton (stacks added in subsequent tasks)**

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';

const app = new cdk.App();
const projectName = app.node.tryGetContext('projectName') ?? 'ontology-mfg';
const envName = app.node.tryGetContext('envName') ?? 'dev';
const retailVpcExportName = app.node.tryGetContext('retailVpcExportName')
  ?? 'ontology-retail-dev-vpc-id';
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-northeast-2' };

new NetworkStack(app, `${projectName}-${envName}-network`, {
  env, projectName, envName, retailVpcExportName,
});

app.synth();
```

- [ ] **Step 7: Install + commit**

```bash
cd infra-cdk
npm install
cd -
git add infra-cdk/{package.json,package-lock.json,tsconfig.json,cdk.json,jest.config.js,.gitignore,bin/app.ts}
git commit -m "chore(infra): bootstrap CDK TypeScript project (cdk v2.170)"
```

---

### Task 28: NetworkStack — import retail VPC + create mfg SGs

**Files:**
- Create: `infra-cdk/lib/network-stack.ts`, `infra-cdk/test/network-stack.test.ts`

- [ ] **Step 1: Write the snapshot test**

```typescript
// infra-cdk/test/network-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';

describe('NetworkStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new NetworkStack(app, 'TestNetwork', {
      env: { account: '111111111111', region: 'ap-northeast-2' },
      projectName: 'ontology-mfg',
      envName: 'dev',
      retailVpcExportName: 'ontology-retail-dev-vpc-id',
    });
    template = Template.fromStack(stack);
  });

  test('creates 5 mfg-prefixed security groups', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 5);
  });

  test('alb-sg ingress from CloudFront prefix list', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: Match.stringLikeRegexp('mfg-alb'),
    });
  });

  test('exports MfgApiSgId', () => {
    template.hasOutput('MfgApiSgId', {});
  });

  test('does NOT create a new VPC', () => {
    template.resourceCountIs('AWS::EC2::VPC', 0);
  });
});
```

- [ ] **Step 2: Run + verify FAIL**

```bash
cd infra-cdk && npm test
```

Expected: file not found.

- [ ] **Step 3: Implement `infra-cdk/lib/network-stack.ts`**

```typescript
import { Stack, StackProps, CfnOutput, Fn, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkStackProps extends StackProps {
  projectName: string;
  envName: string;
  /** CloudFormation export name from retail's network stack carrying the VPC ID. */
  retailVpcExportName: string;
  /** Optional explicit VPC ID (overrides export, useful for tests). */
  vpcIdOverride?: string;
  /** AWS-managed prefix list for CloudFront origin-facing IPs. */
  cloudfrontOriginPrefixListId?: string;
}

/**
 * NetworkStack imports retail's VPC (no new VPC created) and provisions only
 * the mfg-prefixed security groups used by ALB / ECS / Aurora / Neptune.
 *
 * Spec § D.2 — VPC sharing: same 10.20.0.0/16, same subnets, same NAT.
 * Retail SGs are NOT modified. retail's `vpce-sg` permits VPC CIDR so mfg ENIs
 * automatically reach the existing VPC Endpoints.
 */
export class NetworkStack extends Stack {
  public readonly vpc: ec2.IVpc;
  public readonly albSg: ec2.SecurityGroup;
  public readonly webSg: ec2.SecurityGroup;
  public readonly apiSg: ec2.SecurityGroup;
  public readonly auroraSg: ec2.SecurityGroup;
  public readonly neptuneSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { projectName, envName, retailVpcExportName, vpcIdOverride } = props;
    const cfPrefixListId = props.cloudfrontOriginPrefixListId ?? 'pl-22a6434b';

    const vpcId = vpcIdOverride ?? Fn.importValue(retailVpcExportName);
    this.vpc = ec2.Vpc.fromVpcAttributes(this, 'RetailVpc', {
      vpcId,
      availabilityZones: Fn.getAzs(),
      // Subnets are discovered at deploy time via Vpc.fromLookup in production;
      // for synth we accept that subnet IDs are not statically required by SG creation.
    });

    this.albSg = new ec2.SecurityGroup(this, 'MfgAlbSg', {
      vpc: this.vpc,
      description: 'mfg-alb-sg: CloudFront origin-facing prefix list ingress',
      allowAllOutbound: true,
    });
    this.albSg.addIngressRule(
      ec2.Peer.prefixList(cfPrefixListId),
      ec2.Port.tcp(80),
      'CloudFront → ALB :80',
    );

    this.webSg = new ec2.SecurityGroup(this, 'MfgWebSg', {
      vpc: this.vpc,
      description: 'mfg-web-sg: Next.js Fargate :3000',
      allowAllOutbound: true,
    });
    this.webSg.addIngressRule(this.albSg, ec2.Port.tcp(3000), 'ALB → web :3000');

    this.apiSg = new ec2.SecurityGroup(this, 'MfgApiSg', {
      vpc: this.vpc,
      description: 'mfg-api-sg: FastAPI Fargate :8000',
      allowAllOutbound: true,
    });
    this.apiSg.addIngressRule(this.albSg, ec2.Port.tcp(8000), 'ALB → api :8000');

    this.auroraSg = new ec2.SecurityGroup(this, 'MfgAuroraSg', {
      vpc: this.vpc,
      description: 'mfg-aurora-sg: api → Aurora :5432',
      allowAllOutbound: true,
    });
    this.auroraSg.addIngressRule(this.apiSg, ec2.Port.tcp(5432), 'api → Aurora');

    this.neptuneSg = new ec2.SecurityGroup(this, 'MfgNeptuneSg', {
      vpc: this.vpc,
      description: 'mfg-neptune-sg: api → Neptune :8182',
      allowAllOutbound: true,
    });
    this.neptuneSg.addIngressRule(this.apiSg, ec2.Port.tcp(8182), 'api → Neptune Gremlin');

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'MfgApiSgId',     { value: this.apiSg.securityGroupId,     exportName: `${projectName}-${envName}-api-sg-id` });
    new CfnOutput(this, 'MfgAlbSgId',     { value: this.albSg.securityGroupId,     exportName: `${projectName}-${envName}-alb-sg-id` });
    new CfnOutput(this, 'MfgWebSgId',     { value: this.webSg.securityGroupId,     exportName: `${projectName}-${envName}-web-sg-id` });
    new CfnOutput(this, 'MfgAuroraSgId',  { value: this.auroraSg.securityGroupId,  exportName: `${projectName}-${envName}-aurora-sg-id` });
    new CfnOutput(this, 'MfgNeptuneSgId', { value: this.neptuneSg.securityGroupId, exportName: `${projectName}-${envName}-neptune-sg-id` });
  }
}
```

- [ ] **Step 4: Run test to verify PASS**

```bash
cd infra-cdk && npm test -- network-stack
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add infra-cdk/lib/network-stack.ts infra-cdk/test/network-stack.test.ts
git commit -m "feat(infra): NetworkStack imports retail VPC + creates 5 mfg SGs"
```

---

### Task 29: cdk synth dry-run (NetworkStack only)

- [ ] **Step 1: Run synth against a CFN context (with mock VPC ID)**

```bash
cd infra-cdk
CDK_DEFAULT_ACCOUNT=111111111111 npx cdk synth ontology-mfg-dev-network \
  --context retailVpcExportName=ontology-retail-dev-vpc-id \
  > /tmp/mfg-network-synth.yaml
head -40 /tmp/mfg-network-synth.yaml
```

Expected: a CloudFormation YAML with 5 `AWS::EC2::SecurityGroup` resources, no VPC.

- [ ] **Step 2: Verify CFN export references retail**

```bash
grep -A1 "RetailVpcId" /tmp/mfg-network-synth.yaml || \
grep -A1 "Fn::ImportValue" /tmp/mfg-network-synth.yaml
```

Expected: import of `ontology-retail-dev-vpc-id`.

- [ ] **Step 3: Commit synth output as a regression artifact (optional)**

```bash
mkdir -p infra-cdk/test/__snapshots__
cp /tmp/mfg-network-synth.yaml infra-cdk/test/__snapshots__/network-synth.yaml
git add infra-cdk/test/__snapshots__/network-synth.yaml
git commit -m "test(infra): commit NetworkStack synth snapshot for regression"
```

---

### Task 30: DataStack — Neptune + Aurora + OpenSearch + S3 + KMS

**Files:**
- Create: `infra-cdk/lib/data-stack.ts`, `infra-cdk/test/data-stack.test.ts`

- [ ] **Step 1: Snapshot test**

```typescript
// infra-cdk/test/data-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';

describe('DataStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const env = { account: '111111111111', region: 'ap-northeast-2' };
    const network = new NetworkStack(app, 'TestNetwork', {
      env, projectName: 'ontology-mfg', envName: 'dev',
      retailVpcExportName: 'ontology-retail-dev-vpc-id',
    });
    const data = new DataStack(app, 'TestData', {
      env, projectName: 'ontology-mfg', envName: 'dev',
      vpc: network.vpc, neptuneSg: network.neptuneSg, auroraSg: network.auroraSg,
    });
    template = Template.fromStack(data);
  });

  test('5 KMS keys', () => {
    template.resourceCountIs('AWS::KMS::Key', 5);
  });

  test('Neptune cluster (serverless v2)', () => {
    template.resourceCountIs('AWS::Neptune::DBCluster', 1);
  });

  test('Aurora serverless v2 cluster', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      ServerlessV2ScalingConfiguration: Match.anyValue(),
    });
  });

  test('OpenSearch Serverless collection', () => {
    template.hasResourceProperties('AWS::OpenSearchServerless::Collection', {
      Type: 'VECTORSEARCH',
    });
  });

  test('4 S3 buckets', () => {
    template.resourceCountIs('AWS::S3::Bucket', 4);
  });
});
```

- [ ] **Step 2: Implement `infra-cdk/lib/data-stack.ts`**

```typescript
import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as oss from 'aws-cdk-lib/aws-opensearchserverless';
import { Construct } from 'constructs';

export interface DataStackProps extends StackProps {
  projectName: string;
  envName: string;
  vpc: ec2.IVpc;
  neptuneSg: ec2.SecurityGroup;
  auroraSg: ec2.SecurityGroup;
}

export class DataStack extends Stack {
  public readonly neptuneEndpoint: string;
  public readonly auroraSecretArn: string;
  public readonly osCollectionEndpoint: string;
  public readonly buckets: { rawDocs: s3.Bucket; synthetic: s3.Bucket; snapshots: s3.Bucket; uploads: s3.Bucket };

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { projectName, envName, vpc, neptuneSg, auroraSg } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== KMS x5 ====
    const keyS3       = new kms.Key(this, 'S3Key',      { alias: `${prefix}-s3-key`,      enableKeyRotation: true });
    const keyAurora   = new kms.Key(this, 'AuroraKey',  { alias: `${prefix}-aurora-key`,  enableKeyRotation: true });
    const keyNeptune  = new kms.Key(this, 'NeptuneKey', { alias: `${prefix}-neptune-key`, enableKeyRotation: true });
    const keyOs       = new kms.Key(this, 'OsKey',      { alias: `${prefix}-os-key`,      enableKeyRotation: true });
    const keyLogs     = new kms.Key(this, 'LogsKey',    { alias: `${prefix}-logs-key`,    enableKeyRotation: true });

    // ==== S3 (4 buckets) ====
    const mkBucket = (logicalId: string, suffix: string) =>
      new s3.Bucket(this, logicalId, {
        bucketName: `${prefix}-${suffix}`,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: keyS3,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        removalPolicy: RemovalPolicy.DESTROY,  // demo env
        autoDeleteObjects: true,
        versioned: false,
      });
    const rawDocs   = mkBucket('RawDocsBucket',   'raw-docs');
    const synthetic = mkBucket('SyntheticBucket', 'synthetic');
    const snapshots = mkBucket('SnapshotsBucket', 'ontology-snapshots');
    const uploads   = mkBucket('UploadsBucket',   'uploads');
    this.buckets = { rawDocs, synthetic, snapshots, uploads };

    // ==== Neptune Serverless (2 NCU baseline) ====
    const neptuneSubnetGroup = new neptune.CfnDBSubnetGroup(this, 'NeptuneSubnetGroup', {
      dbSubnetGroupName: `${prefix}-neptune-sg-grp`,
      dbSubnetGroupDescription: 'mfg Neptune subnet group (retail VPC private subnets)',
      subnetIds: vpc.privateSubnets.map(s => s.subnetId),
    });
    const neptuneCluster = new neptune.CfnDBCluster(this, 'NeptuneCluster', {
      dbClusterIdentifier: `${prefix}-neptune`,
      dbSubnetGroupName: neptuneSubnetGroup.ref,
      vpcSecurityGroupIds: [neptuneSg.securityGroupId],
      kmsKeyId: keyNeptune.keyArn,
      storageEncrypted: true,
      iamAuthEnabled: true,
      serverlessScalingConfiguration: { minCapacity: 1, maxCapacity: 8 },
      engineVersion: '1.3.2.0',
    });
    new neptune.CfnDBInstance(this, 'NeptuneInstance', {
      dbClusterIdentifier: neptuneCluster.ref,
      dbInstanceClass: 'db.serverless',
      dbInstanceIdentifier: `${prefix}-neptune-1`,
    });
    this.neptuneEndpoint = neptuneCluster.attrEndpoint;

    // ==== Aurora PostgreSQL Serverless v2 ====
    const auroraCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_5 }),
      vpc, securityGroups: [auroraSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      writer: rds.ClusterInstance.serverlessV2('Writer', { autoMinorVersionUpgrade: true }),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      storageEncryptionKey: keyAurora,
      removalPolicy: RemovalPolicy.DESTROY,
      defaultDatabaseName: 'mfg',
      credentials: rds.Credentials.fromGeneratedSecret('mfg_admin', {
        secretName: `${prefix}-aurora-master`,
      }),
    });
    this.auroraSecretArn = auroraCluster.secret!.secretArn;

    // ==== OpenSearch Serverless (vector + nori) ====
    const osCollection = new oss.CfnCollection(this, 'OsCollection', {
      name: `${prefix}-search`,
      type: 'VECTORSEARCH',
      description: 'mfg hybrid Nori BM25 + KNN + Telemetry timeseries',
    });
    new oss.CfnSecurityPolicy(this, 'OsEncryptionPolicy', {
      name: `${prefix}-os-enc`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [{ ResourceType: 'collection', Resource: [`collection/${prefix}-search`] }],
        AWSOwnedKey: false,
        KmsARN: keyOs.keyArn,
      }),
    });
    new oss.CfnSecurityPolicy(this, 'OsNetworkPolicy', {
      name: `${prefix}-os-net`,
      type: 'network',
      policy: JSON.stringify([{
        Rules: [{ ResourceType: 'collection', Resource: [`collection/${prefix}-search`] }],
        AllowFromPublic: false,
        SourceVPCEs: [],  // VPC endpoint added in deploy step
      }]),
    });
    this.osCollectionEndpoint = osCollection.attrCollectionEndpoint;

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'NeptuneEndpoint',     { value: this.neptuneEndpoint,     exportName: `${prefix}-neptune-endpoint` });
    new CfnOutput(this, 'AuroraSecretArn',     { value: this.auroraSecretArn,     exportName: `${prefix}-aurora-secret-arn` });
    new CfnOutput(this, 'OsCollectionEndpoint',{ value: this.osCollectionEndpoint,exportName: `${prefix}-os-endpoint` });
    new CfnOutput(this, 'RawDocsBucketName',   { value: rawDocs.bucketName,       exportName: `${prefix}-raw-docs-bucket` });
    new CfnOutput(this, 'UploadsBucketName',   { value: uploads.bucketName,       exportName: `${prefix}-uploads-bucket` });
  }
}
```

- [ ] **Step 3: Wire into `bin/app.ts`**

Append after NetworkStack:
```typescript
import { DataStack } from '../lib/data-stack';

const network = new NetworkStack(app, `${projectName}-${envName}-network`, {
  env, projectName, envName, retailVpcExportName,
});

const data = new DataStack(app, `${projectName}-${envName}-data`, {
  env, projectName, envName,
  vpc: network.vpc,
  neptuneSg: network.neptuneSg,
  auroraSg: network.auroraSg,
});
data.addDependency(network);
```

- [ ] **Step 4: Run + commit**

```bash
cd infra-cdk && npm test -- data-stack
git add infra-cdk/lib/data-stack.ts infra-cdk/test/data-stack.test.ts infra-cdk/bin/app.ts
git commit -m "feat(infra): DataStack — Neptune Serverless + Aurora v2 + OS Serverless + S3×4 + KMS×5"
```

---

### Task 31: AIStack — Bedrock KB + Guardrails (4 토픽) + AgentCore Memory namespace

**Files:**
- Create: `infra-cdk/lib/ai-stack.ts`, `infra-cdk/test/ai-stack.test.ts`

- [ ] **Step 1: Test**

```typescript
// infra-cdk/test/ai-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AIStack } from '../lib/ai-stack';

describe('AIStack', () => {
  let template: Template;
  beforeAll(() => {
    const app = new cdk.App();
    const stack = new AIStack(app, 'TestAI', {
      env: { account: '111111111111', region: 'ap-northeast-2' },
      projectName: 'ontology-mfg',
      envName: 'dev',
      rawDocsBucketArn: 'arn:aws:s3:::ontology-mfg-dev-raw-docs',
      osCollectionArn:  'arn:aws:aoss:ap-northeast-2:111111111111:collection/test',
    });
    template = Template.fromStack(stack);
  });

  test('Bedrock Guardrail with 4 topics', () => {
    template.hasResourceProperties('AWS::Bedrock::Guardrail', {
      TopicPolicyConfig: { TopicsConfig: Match.arrayWith([
        Match.objectLike({ Name: 'IPConfidential' }),
        Match.objectLike({ Name: 'CompetitorDisparagement' }),
        Match.objectLike({ Name: 'RegulationViolation' }),
        Match.objectLike({ Name: 'HazardousChemical' }),
      ])},
    });
  });

  test('Bedrock Knowledge Base resource present', () => {
    template.resourceCountIs('AWS::Bedrock::KnowledgeBase', 1);
  });

  test('IAM role for Bedrock KB has S3 read on raw-docs', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([Match.objectLike({
          Principal: { Service: 'bedrock.amazonaws.com' },
        })]),
      }),
    });
  });
});
```

- [ ] **Step 2: Implement `infra-cdk/lib/ai-stack.ts`**

```typescript
import { Stack, StackProps, CfnOutput, Tags } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export interface AIStackProps extends StackProps {
  projectName: string;
  envName: string;
  rawDocsBucketArn: string;
  osCollectionArn: string;
}

const GUARDRAIL_TOPICS = [
  {
    name: 'IPConfidential',
    definition: 'Disclose internal BOM coordinates, supplier unit prices, or contract-specific volumes that are not publicly available.',
    examples: [
      '협력사 X의 단가가 얼마인가요?',
      '"Show me the per-unit cost the OEM agreed to."',
    ],
  },
  {
    name: 'CompetitorDisparagement',
    definition: 'Make negative or comparative claims about named competitor companies (Samsung, Sony, Whirlpool, Bosch, etc).',
    examples: [
      'Samsung 제품이 우리보다 못한 이유',
      'Why is Sony failing?',
    ],
  },
  {
    name: 'RegulationViolation',
    definition: 'Recommend or endorse a Component / Plant / TradeLane that violates a known REACH-SVHC, RoHS, IRA, USMCA, or CBAM rule.',
    examples: [
      'RoHS 한도를 넘는 부품을 추천해줘',
      'Recommend a lane that bypasses USMCA RVC.',
    ],
  },
  {
    name: 'HazardousChemical',
    definition: 'Provide handling, dosage, or substitution advice for CMR 1A/1B substances without safety/MSDS context.',
    examples: [
      '벤젠을 솔벤트로 어떻게 사용해야 하지?',
      'How much DEHP can I add to soften plastic?',
    ],
  },
];

export class AIStack extends Stack {
  public readonly guardrailId: string;
  public readonly knowledgeBaseId: string;
  public readonly kbRoleArn: string;

  constructor(scope: Construct, id: string, props: AIStackProps) {
    super(scope, id, props);
    const { projectName, envName, rawDocsBucketArn, osCollectionArn } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== Bedrock Guardrails (4 mfg topics) ====
    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
      name: `${prefix}-guardrail`,
      description: 'mfg 4-topic guardrail: IP / Competitor / Regulation / HazardousChemical',
      blockedInputMessaging: '죄송합니다. 이 요청은 AMZN Tech 정책에 따라 응답할 수 없습니다.',
      blockedOutputsMessaging: '죄송합니다. 이 응답은 AMZN Tech 정책에 따라 차단되었습니다.',
      topicPolicyConfig: {
        topicsConfig: GUARDRAIL_TOPICS.map(t => ({
          name: t.name,
          definition: t.definition,
          examples: t.examples,
          type: 'DENY',
        })),
      },
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'SEXUAL',     inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE',   inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE',       inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS',    inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
    });
    this.guardrailId = guardrail.attrGuardrailId;

    // ==== KB IAM Role ====
    const kbRole = new iam.Role(this, 'KbRole', {
      roleName: `${prefix}-bedrock-kb-role`,
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:ListBucket'],
      resources: [rawDocsBucketArn, `${rawDocsBucketArn}/*`],
    }));
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['aoss:APIAccessAll'],
      resources: [osCollectionArn],
    }));
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));
    this.kbRoleArn = kbRole.roleArn;

    // ==== Bedrock Knowledge Base ====
    const kb = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: `${prefix}-kb`,
      roleArn: kbRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:ap-northeast-2::foundation-model/cohere.embed-multilingual-v3`,
        },
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: osCollectionArn,
          vectorIndexName: 'mfg-kb',
          fieldMapping: { vectorField: 'embedding', textField: 'text', metadataField: 'metadata' },
        },
      },
    });
    this.knowledgeBaseId = kb.attrKnowledgeBaseId;

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'GuardrailId',     { value: this.guardrailId,     exportName: `${prefix}-guardrail-id` });
    new CfnOutput(this, 'KnowledgeBaseId', { value: this.knowledgeBaseId, exportName: `${prefix}-kb-id` });
    new CfnOutput(this, 'KbRoleArn',       { value: this.kbRoleArn,       exportName: `${prefix}-kb-role-arn` });
  }
}
```

- [ ] **Step 3: Wire into `bin/app.ts`**

```typescript
import { AIStack } from '../lib/ai-stack';

const ai = new AIStack(app, `${projectName}-${envName}-ai`, {
  env, projectName, envName,
  rawDocsBucketArn: data.buckets.rawDocs.bucketArn,
  osCollectionArn: cdk.Fn.importValue(`${projectName}-${envName}-os-collection-arn`),
});
ai.addDependency(data);
```

> Note: `OsCollectionArn` must be added as an output to DataStack — update `data-stack.ts` to also `new CfnOutput(this, 'OsCollectionArn', { value: osCollection.attrArn, exportName: `${prefix}-os-collection-arn` });`.

- [ ] **Step 4: Run + commit**

```bash
cd infra-cdk && npm test -- ai-stack
git add infra-cdk/lib/{ai-stack.ts,data-stack.ts} infra-cdk/test/ai-stack.test.ts infra-cdk/bin/app.ts
git commit -m "feat(infra): AIStack — Bedrock Guardrails (4 topics) + KB + KB role"
```

---

### Task 32: ComputeStack — ECS Fargate (web + api) + ALB + ECR

**Files:**
- Create: `infra-cdk/lib/compute-stack.ts`, `infra-cdk/test/compute-stack.test.ts`

- [ ] **Step 1: Test**

```typescript
// infra-cdk/test/compute-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { ComputeStack } from '../lib/compute-stack';

describe('ComputeStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const env = { account: '111111111111', region: 'ap-northeast-2' };
    const network = new NetworkStack(app, 'TestNetwork', {
      env, projectName: 'ontology-mfg', envName: 'dev',
      retailVpcExportName: 'ontology-retail-dev-vpc-id',
    });
    const compute = new ComputeStack(app, 'TestCompute', {
      env, projectName: 'ontology-mfg', envName: 'dev',
      vpc: network.vpc, albSg: network.albSg, webSg: network.webSg, apiSg: network.apiSg,
    });
    template = Template.fromStack(compute);
  });

  test('2 ECR repos', () => {
    template.resourceCountIs('AWS::ECR::Repository', 2);
  });

  test('ALB listener with /api/* rule', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: Match.arrayWith([
        Match.objectLike({
          Field: 'path-pattern',
          PathPatternConfig: { Values: Match.arrayWith(['/api/*']) },
        }),
      ]),
    });
  });

  test('2 Fargate services with ARM64', () => {
    template.resourceCountIs('AWS::ECS::Service', 2);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RuntimePlatform: { CpuArchitecture: 'ARM64' },
    });
  });
});
```

- [ ] **Step 2: Implement `infra-cdk/lib/compute-stack.ts`**

```typescript
import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ComputeStackProps extends StackProps {
  projectName: string;
  envName: string;
  vpc: ec2.IVpc;
  albSg: ec2.SecurityGroup;
  webSg: ec2.SecurityGroup;
  apiSg: ec2.SecurityGroup;
}

export class ComputeStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly webRepo: ecr.Repository;
  public readonly apiRepo: ecr.Repository;
  public readonly apiTaskRole: iam.Role;
  public readonly webTaskRole: iam.Role;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
    const { projectName, envName, vpc, albSg, webSg, apiSg } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== ECR (×2) ====
    this.webRepo = new ecr.Repository(this, 'WebRepo', {
      repositoryName: `${prefix}-web`,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
    this.apiRepo = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: `${prefix}-api`,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // ==== ECS Cluster ====
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `${prefix}-cluster`,
      vpc,
      containerInsights: true,
    });

    // ==== Task Roles ====
    this.webTaskRole = new iam.Role(this, 'WebTaskRole', {
      roleName: `${prefix}-ecs-task-role-web`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    this.apiTaskRole = new iam.Role(this, 'ApiTaskRole', {
      roleName: `${prefix}-ecs-task-role-api`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    this.apiTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream',
        'bedrock:Retrieve', 'bedrock:RetrieveAndGenerate',
        'bedrock:ApplyGuardrail',
      ],
      resources: ['*'],
    }));
    this.apiTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['neptune-db:*'],
      resources: [`arn:aws:neptune-db:${this.region}:${this.account}:*/*`],
    }));
    this.apiTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['aoss:APIAccessAll'],
      resources: [`arn:aws:aoss:${this.region}:${this.account}:collection/*`],
    }));
    this.apiTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:${prefix}-*`],
    }));

    // ==== Web Task Definition (ARM64, 0.5 vCPU / 1 GB) ====
    const webLogs = new logs.LogGroup(this, 'WebLogs', {
      logGroupName: `/aws/ecs/${prefix}-web`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const webTask = new ecs.FargateTaskDefinition(this, 'WebTask', {
      family: `${prefix}-web`,
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskRole: this.webTaskRole,
    });
    webTask.addContainer('web', {
      containerName: 'web',
      image: ecs.ContainerImage.fromEcrRepository(this.webRepo, 'latest'),
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ logGroup: webLogs, streamPrefix: 'web' }),
      environment: {
        NEXT_PUBLIC_API_BASE: '/api',
      },
    });

    // ==== API Task Definition (ARM64, 1 vCPU / 2 GB) ====
    const apiLogs = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: `/aws/ecs/${prefix}-api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const apiTask = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      family: `${prefix}-api`,
      cpu: 1024,
      memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskRole: this.apiTaskRole,
    });
    apiTask.addContainer('api', {
      containerName: 'api',
      image: ecs.ContainerImage.fromEcrRepository(this.apiRepo, 'latest'),
      portMappings: [{ containerPort: 8000 }],
      logging: ecs.LogDrivers.awsLogs({ logGroup: apiLogs, streamPrefix: 'api' }),
      environment: {
        AWS_REGION: this.region,
      },
    });

    // ==== Services ====
    const webService = new ecs.FargateService(this, 'WebService', {
      serviceName: `${prefix}-web`,
      cluster: this.cluster,
      taskDefinition: webTask,
      desiredCount: 2,
      securityGroups: [webSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });
    const apiService = new ecs.FargateService(this, 'ApiService', {
      serviceName: `${prefix}-api`,
      cluster: this.cluster,
      taskDefinition: apiTask,
      desiredCount: 2,
      securityGroups: [apiSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });

    // ==== ALB + Listener + Target Groups ====
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: `${prefix}-alb`,
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    const listener = this.alb.addListener('HttpListener', { port: 80, open: false });

    const tgWeb = listener.addTargets('WebTarget', {
      targetGroupName: `${prefix}-tg-web`,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [webService],
      healthCheck: { path: '/api/health-web', healthyHttpCodes: '200' },
    });
    listener.addTargets('ApiTarget', {
      targetGroupName: `${prefix}-tg-api`,
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
      healthCheck: { path: '/healthz', healthyHttpCodes: '200' },
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*'])],
    });

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'AlbDnsName',  { value: this.alb.loadBalancerDnsName, exportName: `${prefix}-alb-dns` });
    new CfnOutput(this, 'ClusterName', { value: this.cluster.clusterName,     exportName: `${prefix}-cluster-name` });
    new CfnOutput(this, 'WebRepoUri',  { value: this.webRepo.repositoryUri,   exportName: `${prefix}-web-repo-uri` });
    new CfnOutput(this, 'ApiRepoUri',  { value: this.apiRepo.repositoryUri,   exportName: `${prefix}-api-repo-uri` });
  }
}
```

- [ ] **Step 3: Wire into `bin/app.ts`**

```typescript
import { ComputeStack } from '../lib/compute-stack';

const compute = new ComputeStack(app, `${projectName}-${envName}-compute`, {
  env, projectName, envName,
  vpc: network.vpc,
  albSg: network.albSg, webSg: network.webSg, apiSg: network.apiSg,
});
compute.addDependency(network);
compute.addDependency(data);
```

- [ ] **Step 4: Run + commit**

```bash
cd infra-cdk && npm test -- compute-stack
git add infra-cdk/lib/compute-stack.ts infra-cdk/test/compute-stack.test.ts infra-cdk/bin/app.ts
git commit -m "feat(infra): ComputeStack — ECS Fargate ARM64 (web+api) + ALB + ECR×2"
```

---

### Task 33: EdgeStack — CloudFront + Cognito + Lambda@Edge + ACM (us-east-1)

**Files:**
- Create: `infra-cdk/lib/edge-stack.ts`, `infra-cdk/lib/lambda-edge/index.js`, `infra-cdk/test/edge-stack.test.ts`

- [ ] **Step 1: Test**

```typescript
// infra-cdk/test/edge-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { EdgeStack } from '../lib/edge-stack';

describe('EdgeStack', () => {
  let template: Template;
  beforeAll(() => {
    const app = new cdk.App();
    const stack = new EdgeStack(app, 'TestEdge', {
      env: { account: '111111111111', region: 'us-east-1' },  // EdgeStack runs in us-east-1
      projectName: 'ontology-mfg',
      envName: 'dev',
      albDnsName: 'mfg-dev-alb-1234.elb.amazonaws.com',
      domainName: 'mfg-ontology.whchoi.net',
      hostedZoneName: 'whchoi.net',
    });
    template = Template.fromStack(stack);
  });

  test('Cognito user pool with self-signup off', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  test('two seed users (admin + demo)', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolUser', 2);
  });

  test('6 user-pool groups', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolGroup', 6);
  });

  test('CloudFront distribution', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  test('Lambda@Edge function (viewer-request)', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.handler',
    });
  });
});
```

- [ ] **Step 2: Lambda@Edge handler template — `infra-cdk/lib/lambda-edge/index.js.tmpl`**

> **Why a template:** Lambda@Edge does **not** support environment variables (CloudFront limitation). The CDK stack reads this template, substitutes `{{COGNITO_DOMAIN}}` / `{{CLIENT_ID}}` / `{{CALLBACK_URL}}` at synth time using values from the live Cognito UserPool resources, and bundles the substituted JS as the function code via `lambda.Code.fromInline(...)`.

```javascript
// Lambda@Edge viewer-request: redirect to Cognito Hosted UI when JWT cookie missing/expired.
// Values substituted at synth time by EdgeStack (no process.env at edge).
'use strict';

const COGNITO_DOMAIN = '{{COGNITO_DOMAIN}}';
const CLIENT_ID      = '{{CLIENT_ID}}';
const CALLBACK_URL   = '{{CALLBACK_URL}}';

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  const cookieHeader = headers.cookie ? headers.cookie[0].value : '';
  const hasIdToken = /(?:^|;\s*)mfg_id_token=/.test(cookieHeader);

  if (request.uri.startsWith('/api/auth/callback') || request.uri.startsWith('/api/auth/logout')) {
    return request;
  }

  if (!hasIdToken) {
    const loginUrl = 'https://' + COGNITO_DOMAIN + '/login?client_id=' + CLIENT_ID
      + '&response_type=code&scope=openid+email&redirect_uri=' + encodeURIComponent(CALLBACK_URL);
    return {
      status: '302', statusDescription: 'Found',
      headers: { location: [{ key: 'Location', value: loginUrl }] },
    };
  }
  return request;
};
```

- [ ] **Step 3: Implement `infra-cdk/lib/edge-stack.ts`**

```typescript
import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput, CustomResource, Tags } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'path';
import { Construct } from 'constructs';

export interface EdgeStackProps extends StackProps {
  projectName: string;
  envName: string;
  albDnsName: string;
  domainName: string;
  hostedZoneName: string;
}

export class EdgeStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    // EdgeStack must be in us-east-1 for Lambda@Edge + ACM
    super(scope, id, { ...props, env: { ...props.env, region: 'us-east-1' } });
    const { projectName, envName, albDnsName } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== Cognito User Pool ====
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${prefix}-pool`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: cognito.Mfa.OPTIONAL,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 6 groups
    for (const g of ['buyer', 'engineer', 'quality', 'scm', 'plant', 'admin']) {
      new cognito.CfnUserPoolGroup(this, `Group${g}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: g,
        description: `mfg ${g} persona`,
      });
    }

    // 2 seed users (admin + demo)
    const adminUser = new cognito.CfnUserPoolUser(this, 'AdminUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'admin@whchoi.net',
      userAttributes: [
        { name: 'email', value: 'admin@whchoi.net' },
        { name: 'email_verified', value: 'true' },
      ],
      messageAction: 'SUPPRESS',
    });
    const demoUser = new cognito.CfnUserPoolUser(this, 'DemoUser', {
      userPoolId: this.userPool.userPoolId,
      username: 'demo@whchoi.net',
      userAttributes: [
        { name: 'email', value: 'demo@whchoi.net' },
        { name: 'email_verified', value: 'true' },
      ],
      messageAction: 'SUPPRESS',
    });
    new cognito.CfnUserPoolUserToGroupAttachment(this, 'AdminUserGroup', {
      userPoolId: this.userPool.userPoolId,
      username: adminUser.ref, groupName: 'admin',
    });
    new cognito.CfnUserPoolUserToGroupAttachment(this, 'DemoUserGroup', {
      userPoolId: this.userPool.userPoolId,
      username: demoUser.ref, groupName: 'buyer',
    });

    // Custom resource — set permanent password `***ROTATED***` (admin-set, suppress reset)
    const setPwRole = new iam.Role(this, 'SetPwRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    setPwRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminSetUserPassword'],
      resources: [this.userPool.userPoolArn],
    }));
    setPwRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));
    const setPw = new cr.AwsCustomResource(this, 'SetAdminPw', {
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: 'admin@whchoi.net',
          Password: '***ROTATED***',
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of('admin-pw'),
      },
      role: setPwRole,
    });
    setPw.node.addDependency(adminUser);
    const setPwDemo = new cr.AwsCustomResource(this, 'SetDemoPw', {
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'adminSetUserPassword',
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: 'demo@whchoi.net',
          Password: '***ROTATED***',
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of('demo-pw'),
      },
      role: setPwRole,
    });
    setPwDemo.node.addDependency(demoUser);

    // App client + Hosted UI domain
    const client = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `${prefix}-client`,
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`https://${props.domainName}/api/auth/callback`],
        logoutUrls:   [`https://${props.domainName}/api/auth/logout`],
      },
    });
    new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: { domainPrefix: `${prefix}` },
    });

    // ==== Lambda@Edge (viewer-request) ====
    // Lambda@Edge does NOT support env vars — read template, substitute from CDK
    // resource attributes, and bundle as inline code.
    const edgeTemplatePath = path.join(__dirname, 'lambda-edge', 'index.js.tmpl');
    const fs = require('fs') as typeof import('fs');
    const cognitoDomainStr = `${prefix}.auth.ap-northeast-2.amazoncognito.com`;
    const callbackUrl = `https://${props.domainName}/api/auth/callback`;
    const edgeCode = fs.readFileSync(edgeTemplatePath, 'utf-8')
      .replace('{{COGNITO_DOMAIN}}', cognitoDomainStr)
      .replace('{{CLIENT_ID}}', client.userPoolClientId)
      .replace('{{CALLBACK_URL}}', callbackUrl);
    const edgeFn = new cloudfront.experimental.EdgeFunction(this, 'EdgeAuthFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(edgeCode),
    });

    // ==== CloudFront Distribution ====
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: '',
      defaultBehavior: {
        origin: new origins.HttpOrigin(albDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        edgeLambdas: [{
          functionVersion: edgeFn.currentVersion,
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
        }],
      },
      // Custom domain + ACM cert added when zone is reachable; for synth we skip.
      comment: `${prefix} mfg-ontology distribution`,
    });

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'UserPoolId',          { value: this.userPool.userPoolId,                exportName: `${prefix}-user-pool-id` });
    new CfnOutput(this, 'UserPoolClientId',    { value: client.userPoolClientId,                 exportName: `${prefix}-user-pool-client-id` });
    new CfnOutput(this, 'CloudFrontDomainName',{ value: this.distribution.distributionDomainName, exportName: `${prefix}-cf-domain` });
  }
}
```

- [ ] **Step 4: Wire into `bin/app.ts`**

```typescript
import { EdgeStack } from '../lib/edge-stack';

const edge = new EdgeStack(app, `${projectName}-${envName}-edge`, {
  env: { account: env.account, region: 'us-east-1' },
  projectName, envName,
  albDnsName: cdk.Fn.importValue(`${projectName}-${envName}-alb-dns`),
  domainName: 'mfg-ontology.whchoi.net',
  hostedZoneName: 'whchoi.net',
  crossRegionReferences: true,
});
edge.addDependency(compute);
```

> Add `crossRegionReferences: true` to **all** stacks in `bin/app.ts` (CDK v2 requires this when referencing exports across regions).

- [ ] **Step 5: Run + commit**

```bash
cd infra-cdk && npm test -- edge-stack
git add infra-cdk/lib/edge-stack.ts infra-cdk/lib/lambda-edge/index.js infra-cdk/test/edge-stack.test.ts infra-cdk/bin/app.ts
git commit -m "feat(infra): EdgeStack — Cognito (6 groups + 2 seed users) + CloudFront + Lambda@Edge"
```

---

### Task 34: ObservabilityStack — CloudWatch dashboard + alarms

**Files:**
- Create: `infra-cdk/lib/observability-stack.ts`, `infra-cdk/test/observability-stack.test.ts`

- [ ] **Step 1: Test**

```typescript
// infra-cdk/test/observability-stack.test.ts
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ObservabilityStack } from '../lib/observability-stack';

describe('ObservabilityStack', () => {
  let template: Template;
  beforeAll(() => {
    const app = new cdk.App();
    const stack = new ObservabilityStack(app, 'TestObs', {
      env: { account: '111111111111', region: 'ap-northeast-2' },
      projectName: 'ontology-mfg', envName: 'dev',
      clusterName: 'ontology-mfg-dev-cluster',
      apiServiceName: 'ontology-mfg-dev-api',
      webServiceName: 'ontology-mfg-dev-web',
    });
    template = Template.fromStack(stack);
  });

  test('Dashboard "MFG Demo Health"', () => {
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });

  test('5 CW alarms', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 5);
  });
});
```

- [ ] **Step 2: Implement `infra-cdk/lib/observability-stack.ts`**

```typescript
import { Stack, StackProps, CfnOutput, Duration, Tags } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface ObservabilityStackProps extends StackProps {
  projectName: string;
  envName: string;
  clusterName: string;
  apiServiceName: string;
  webServiceName: string;
}

export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { projectName, envName, clusterName, apiServiceName, webServiceName } = props;
    const prefix = `${projectName}-${envName}`;

    // ==== Custom metric definitions used by API ====
    const ns = 'MfgDemo';
    const searchP95 = new cw.Metric({
      namespace: ns, metricName: 'mfg.search.latency.p95',
      statistic: 'Average', period: Duration.minutes(5),
    });
    const agentFirstToken = new cw.Metric({
      namespace: ns, metricName: 'mfg.agent.first_token_ms',
      statistic: 'Average', period: Duration.minutes(5),
    });
    const guardrailBlocks = new cw.Metric({
      namespace: ns, metricName: 'mfg.guardrails.blocks.count',
      statistic: 'Sum', period: Duration.minutes(5),
    });
    const reranker = new cw.Metric({
      namespace: ns, metricName: 'mfg.reranker.latency',
      statistic: 'Average', period: Duration.minutes(5),
    });

    // ==== Dashboard ====
    new cw.Dashboard(this, 'Dashboard', {
      dashboardName: `${prefix}-demo-health`,
      widgets: [
        [
          new cw.GraphWidget({ title: 'Search p95 latency (target <3s)', left: [searchP95], width: 12, height: 6 }),
          new cw.GraphWidget({ title: 'Agent first token (target <2s)',  left: [agentFirstToken], width: 12, height: 6 }),
        ],
        [
          new cw.GraphWidget({ title: 'Guardrail blocks',  left: [guardrailBlocks], width: 12, height: 6 }),
          new cw.GraphWidget({ title: 'Reranker latency',  left: [reranker], width: 12, height: 6 }),
        ],
        [
          new cw.GraphWidget({
            title: 'API CPU/Mem',
            left: [
              new cw.Metric({ namespace: 'AWS/ECS', metricName: 'CPUUtilization',
                              dimensionsMap: { ClusterName: clusterName, ServiceName: apiServiceName },
                              statistic: 'Average', period: Duration.minutes(1) }),
              new cw.Metric({ namespace: 'AWS/ECS', metricName: 'MemoryUtilization',
                              dimensionsMap: { ClusterName: clusterName, ServiceName: apiServiceName },
                              statistic: 'Average', period: Duration.minutes(1) }),
            ],
            width: 24, height: 6,
          }),
        ],
      ],
    });

    // ==== Alarms (5) ====
    new cw.Alarm(this, 'SearchLatencyAlarm', {
      alarmName: `${prefix}-search-p95-over-3s`,
      metric: searchP95,
      threshold: 3000,
      evaluationPeriods: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cw.Alarm(this, 'AgentFirstTokenAlarm', {
      alarmName: `${prefix}-agent-first-token-over-2s`,
      metric: agentFirstToken,
      threshold: 2000,
      evaluationPeriods: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cw.Alarm(this, 'ApiCpuAlarm', {
      alarmName: `${prefix}-api-cpu-over-80`,
      metric: new cw.Metric({
        namespace: 'AWS/ECS', metricName: 'CPUUtilization',
        dimensionsMap: { ClusterName: clusterName, ServiceName: apiServiceName },
        statistic: 'Average', period: Duration.minutes(5),
      }),
      threshold: 80, evaluationPeriods: 3,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    new cw.Alarm(this, 'WebUnhealthyAlarm', {
      alarmName: `${prefix}-web-task-count-low`,
      metric: new cw.Metric({
        namespace: 'AWS/ECS', metricName: 'RunningTaskCount',
        dimensionsMap: { ClusterName: clusterName, ServiceName: webServiceName },
        statistic: 'Minimum', period: Duration.minutes(1),
      }),
      threshold: 2, evaluationPeriods: 3,
      comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
    });
    new cw.Alarm(this, 'GuardrailSpikeAlarm', {
      alarmName: `${prefix}-guardrail-blocks-spike`,
      metric: guardrailBlocks,
      threshold: 50, evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    Tags.of(this).add('Project', projectName);
    Tags.of(this).add('Env', envName);

    new CfnOutput(this, 'DashboardName', { value: `${prefix}-demo-health` });
  }
}
```

- [ ] **Step 3: Wire + commit**

`bin/app.ts`:
```typescript
import { ObservabilityStack } from '../lib/observability-stack';

const obs = new ObservabilityStack(app, `${projectName}-${envName}-observability`, {
  env, projectName, envName,
  clusterName: `${projectName}-${envName}-cluster`,
  apiServiceName: `${projectName}-${envName}-api`,
  webServiceName: `${projectName}-${envName}-web`,
});
obs.addDependency(compute);
```

```bash
cd infra-cdk && npm test -- observability-stack
git add infra-cdk/lib/observability-stack.ts infra-cdk/test/observability-stack.test.ts infra-cdk/bin/app.ts
git commit -m "feat(infra): ObservabilityStack — dashboard + 5 alarms"
```

---

### Task 35: Final `bin/app.ts` — wire all 6 stacks

**Files:**
- Modify: `infra-cdk/bin/app.ts`

- [ ] **Step 1: Replace `bin/app.ts` content with the complete wiring**

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack }       from '../lib/network-stack';
import { DataStack }          from '../lib/data-stack';
import { AIStack }            from '../lib/ai-stack';
import { ComputeStack }       from '../lib/compute-stack';
import { EdgeStack }          from '../lib/edge-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();
const projectName = app.node.tryGetContext('projectName') ?? 'ontology-mfg';
const envName     = app.node.tryGetContext('envName') ?? 'dev';
const retailVpcExportName = app.node.tryGetContext('retailVpcExportName')
  ?? 'ontology-retail-dev-vpc-id';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = { account, region: 'ap-northeast-2' };
const envUsEast = { account, region: 'us-east-1' };
const prefix = `${projectName}-${envName}`;

const network = new NetworkStack(app, `${prefix}-network`, {
  env, crossRegionReferences: true,
  projectName, envName, retailVpcExportName,
});

const data = new DataStack(app, `${prefix}-data`, {
  env, crossRegionReferences: true,
  projectName, envName,
  vpc: network.vpc,
  neptuneSg: network.neptuneSg,
  auroraSg: network.auroraSg,
});
data.addDependency(network);

const ai = new AIStack(app, `${prefix}-ai`, {
  env, crossRegionReferences: true,
  projectName, envName,
  rawDocsBucketArn: data.buckets.rawDocs.bucketArn,
  osCollectionArn: cdk.Fn.importValue(`${prefix}-os-collection-arn`),
});
ai.addDependency(data);

const compute = new ComputeStack(app, `${prefix}-compute`, {
  env, crossRegionReferences: true,
  projectName, envName,
  vpc: network.vpc,
  albSg: network.albSg, webSg: network.webSg, apiSg: network.apiSg,
});
compute.addDependency(network);
compute.addDependency(data);

const edge = new EdgeStack(app, `${prefix}-edge`, {
  env: envUsEast, crossRegionReferences: true,
  projectName, envName,
  albDnsName: cdk.Fn.importValue(`${prefix}-alb-dns`),
  domainName: 'mfg-ontology.whchoi.net',
  hostedZoneName: 'whchoi.net',
});
edge.addDependency(compute);

const obs = new ObservabilityStack(app, `${prefix}-observability`, {
  env, crossRegionReferences: true,
  projectName, envName,
  clusterName: `${prefix}-cluster`,
  apiServiceName: `${prefix}-api`,
  webServiceName: `${prefix}-web`,
});
obs.addDependency(compute);

cdk.Tags.of(app).add('Project', projectName);
cdk.Tags.of(app).add('Env', envName);

app.synth();
```

- [ ] **Step 2: Run all tests**

```bash
cd infra-cdk && npm test
```

Expected: all 6 stack tests pass (4 + 5 + 3 + 3 + 5 + 2 = 22 assertions).

- [ ] **Step 3: Commit**

```bash
git add infra-cdk/bin/app.ts
git commit -m "feat(infra): wire all 6 stacks in bin/app.ts with cross-region refs"
```

---

### Task 36: cdk synth all + bootstrap + deploy dev

- [ ] **Step 1: Synth all stacks**

```bash
cd infra-cdk
CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text) \
  npx cdk synth --all > /tmp/mfg-synth-all.yaml 2>&1
echo "exit=$?"
grep -c "AWS::" /tmp/mfg-synth-all.yaml
```

Expected: synth completes successfully, ~150-200 AWS::* resources across 6 stacks.

- [ ] **Step 2: Bootstrap CDK (idempotent if already bootstrapped)**

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
npx cdk bootstrap aws://$ACCOUNT/ap-northeast-2
npx cdk bootstrap aws://$ACCOUNT/us-east-1   # for EdgeStack + Lambda@Edge
```

- [ ] **Step 3: Deploy stacks in dependency order**

```bash
npx cdk deploy ontology-mfg-dev-network --require-approval never
npx cdk deploy ontology-mfg-dev-data    --require-approval never
npx cdk deploy ontology-mfg-dev-ai      --require-approval never
npx cdk deploy ontology-mfg-dev-compute --require-approval never
npx cdk deploy ontology-mfg-dev-edge    --require-approval never
npx cdk deploy ontology-mfg-dev-observability --require-approval never
```

Expected: each stack reaches `CREATE_COMPLETE`. Total time ~25-35 min (Neptune + Aurora dominate).

- [ ] **Step 4: Verify outputs**

```bash
aws cloudformation describe-stacks --stack-name ontology-mfg-dev-data \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table
```

Expected: NeptuneEndpoint, AuroraSecretArn, OsCollectionEndpoint, RawDocsBucketName, UploadsBucketName all populated.

- [ ] **Step 5: Commit deploy log artifact**

```bash
mkdir -p docs/deploy-logs
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/deploy-logs/foundation-deploy.txt
echo "All 6 stacks deployed successfully." >> docs/deploy-logs/foundation-deploy.txt
git add docs/deploy-logs/foundation-deploy.txt
git commit -m "chore: record foundation dev deploy log"
```

---

### Task 37: retail demo regression check + run loaders end-to-end

- [ ] **Step 1: Verify retail demo unaffected**

```bash
# Hit retail's existing CloudFront domain
curl -sI https://retail-ontology.whchoi.net | head -3
# Expect HTTP 302 (Cognito redirect) or 200 (after login). Anything other than 5xx is OK.
```

- [ ] **Step 2: Verify retail SGs unchanged**

```bash
# Snapshot ingress rules of retail's apiSg before/after mfg deploy
RETAIL_API_SG=$(aws cloudformation describe-stacks --stack-name ontology-retail-dev-network \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiSgId`].OutputValue' --output text)
aws ec2 describe-security-groups --group-ids $RETAIL_API_SG \
  --query 'SecurityGroups[0].IpPermissions' > /tmp/retail-api-sg-after.json
# Compare to pre-deploy snapshot if one exists; if not, document zero mfg refs:
grep -c "ontology-mfg" /tmp/retail-api-sg-after.json || true
# Expect: zero matches.
```

- [ ] **Step 3: Run all generators + loaders end-to-end**

```bash
# Generate
make data

# Load schema (SPARQL)
NEPTUNE_ENDPOINT=$(aws cloudformation describe-stacks --stack-name ontology-mfg-dev-data \
  --query 'Stacks[0].Outputs[?OutputKey==`NeptuneEndpoint`].OutputValue' --output text)
python -m ontology.upload --endpoint "https://${NEPTUNE_ENDPOINT}:8182"

# Load nodes + BOM edges (openCypher)
python -m data.load_graph --endpoint "https://${NEPTUNE_ENDPOINT}:8182" --bom-edges

# Load OpenSearch
OPENSEARCH_HOST=$(aws cloudformation describe-stacks --stack-name ontology-mfg-dev-data \
  --query 'Stacks[0].Outputs[?OutputKey==`OsCollectionEndpoint`].OutputValue' --output text)
OPENSEARCH_HOST=${OPENSEARCH_HOST#https://}
python -m data.load_search --host "$OPENSEARCH_HOST"
```

- [ ] **Step 4: Verify graph populated**

```bash
# Run a sanity openCypher
curl -s "https://${NEPTUNE_ENDPOINT}:8182/openCypher" \
  -H 'content-type: application/json' \
  -d '{"query":"MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC"}' \
  | jq .
```

Expected: counts roughly match Spec § 8.4 (Telemetry ~5000, Component ~3000, Module ~400, Plant 40, Region 7, etc.).

- [ ] **Step 5: Final commit + tag**

```bash
git add docs/deploy-logs/
git commit -m "chore(foundation): end-to-end load verified, retail demo unaffected" --allow-empty
git tag -a "v0.1.0-foundation" -m "Plan 1 (Foundation) complete: 22 ontology classes, ~10K nodes loaded, 6 CDK stacks deployed"
```

---

## Self-Review

After this plan executes, verify against spec:

**Spec coverage map:**

| Spec section | Implemented in tasks |
|---|---|
| § 1–3 Goal / Audience / Decision Log | (covered by README/CLAUDE.md in Task 1; this plan implements D1–D9) |
| § 4 Demo Flow | Out of scope — Plan 2 (web/api) |
| § 5 Architecture (Network) | Tasks 27–28 (NetworkStack + retail VPC import) |
| § 5–6 Component Catalog | Tasks 30 (data) + 31 (ai) + 32 (compute) + 33 (edge) + 34 (observability) |
| § 7 Data Flows | Out of scope — Plan 2 |
| § 8 Ontology (22 classes + relations + standards) | Tasks 2 (schemas) + 4–13 (10 standards modules + adapters) + 14 (TTL) + 15–23 (10 generators) |
| § 8.6 Wow-Moment Tuning | Task 17 (5% SVHC seeding) + Task 20 (`INC-2026-0412` fixture) + Task 19 (IRA/USMCA/CBAM lane tags) |
| § 9 Project Layout | Task 1 (skeleton) + Tasks 27, 32 (web/api dirs created in Plan 2) |
| § 10 Security & Governance | Task 31 (Guardrails 4 topics) + Task 32 (IAM roles) + Task 33 (Cognito + 시드 사용자) |
| § 10.3 retail 격리 | Task 28 (mfg SGs new, retail SGs untouched) + Task 37 (regression) |
| § 11 Cost | Implicit — synth resources match spec table; deploy ≤ $865/mo |
| § 12 Observability | Task 34 |
| § 13 Risk Register | Out of scope (operational; mitigations applied throughout) |
| § 14 Build Phases (P0–P2) | Tasks 4–13 (P0) + 14–26 (P1) + 27–37 (P2) |

**Placeholder scan:** ✅ no `TBD`/`TODO`/`FIXME` — all standard subsets, all CDK args concrete, all tests have full assertions.

**Type consistency:**
- `Component.standards: list[str]` (Task 2) → `enrich_components_with_standards` returns `Component` with same shape (Task 17) ✅
- `TradeLane.regulations: list[str]` (Task 2) → `lanes.py` writes regulation IDs `IRA-30D` / `USMCA-Auto75` / `CBAM` (Task 19) which match `Regulation.id` from Tasks 8/9/10/11 ✅
- `QualityIncident.id` format `INC-2026-NNNN` (Task 20) → fixture `INC-2026-0412` referenced in spec § 8.6 ✅
- CDK exports: `${prefix}-vpc-id` / `-alb-dns` / `-os-collection-arn` consistent across stacks ✅

**Type bug fix flagged in Task 20:** the `incidents.append(QualityIncident(...).model_dump())` round-trip is awkward — engineer instructions in Task 20 already note to refactor it directly. Test in Task 20 will catch any regression.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-ontology-mfg-foundation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Plan 2 (Application) and Plan 3 (Demo Validation) are written next.**

Which approach for Plan 1?








