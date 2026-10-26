"""Generator-side FK fields the graph loader turns into edges + pipeline ≡ `make data`."""

from __future__ import annotations

import sys

import pytest

from data.schemas import CarbonScope, carbon_scope_id
from data.synthetic import (
    boms,
    customers,
    esg,
    incidents,
    lanes,
    maintenance,
    manufacturers,
    plants,
    products,
    suppliers,
    telemetry,
)
from data.synthetic.pipeline import generate_dataset, generate_dataset_records

# Makefile `data` order: (module, [(attr to patch, file name or None for dir)])
_MAKE_ORDER = [
    (products, [("OUTPUT", "products.ndjson")]),
    (manufacturers, [("OUTPUT", "manufacturers.ndjson")]),
    (boms, [("OUTPUT_DIR", None)]),
    (suppliers, [("OUTPUT_DIR", None)]),
    (customers, [("OUTPUT", "customers.ndjson")]),
    (plants, [("OUTPUT", "plants.ndjson"), ("CERT_OUTPUT", "certifications.ndjson")]),
    (lanes, [("OUTPUT", "lanes.ndjson")]),
    (incidents, [("OUTPUT_DIR", None)]),
    (telemetry, [("OUTPUT", "telemetry.ndjson")]),
    (maintenance, [("OUTPUT", "maintenance.ndjson")]),
    (esg, [("OUTPUT_DIR", None)]),
]


def test_pipeline_output_is_byte_identical_to_make_data(tmp_path, monkeypatch):
    make_dir, pipe_dir = tmp_path / "make", tmp_path / "pipe"
    make_dir.mkdir()
    monkeypatch.setattr(sys, "argv", ["generator"])
    for mod, patches in _MAKE_ORDER:
        for attr, fname in patches:
            monkeypatch.setattr(mod, attr, make_dir / fname if fname else make_dir)
        mod.main()
    generate_dataset(pipe_dir)
    made = sorted(p.name for p in make_dir.glob("*.ndjson"))
    piped = sorted(p.name for p in pipe_dir.glob("*.ndjson"))
    assert made == piped
    for name in made:
        assert (make_dir / name).read_bytes() == (pipe_dir / name).read_bytes(), name


@pytest.fixture(scope="module")
def recs():
    return generate_dataset_records()


def test_components_carry_bom_sourcing_and_compliance_fks(recs):
    comps = recs["components"]
    module_ids = {m.id for m in recs["modules"]}
    supplier_ids = {s.id for s in recs["suppliers"]}
    raw_ids = {r.id for r in recs["raw_materials"]}
    assert all(len(c.module_ids) == 1 and c.module_ids[0] in module_ids for c in comps)
    assert all(1 <= len(c.supply) <= 3 for c in comps)
    assert all(o.supplier_id in supplier_ids for c in comps for o in c.supply)
    assert all(set(c.raw_material_ids) <= raw_ids for c in comps)
    assert all(c.standards for c in comps)  # enrichment wired into make data
    assert all(c.substances for c in comps)  # every part declares constituents
    problematic = {"117-81-7", "7439-92-1", "7440-43-9", "32534-81-9", "84-69-5"}
    share = sum(1 for c in comps if problematic & set(c.substances)) / len(comps)
    assert 0.04 <= share <= 0.10, share


def test_new_fk_draws_do_not_perturb_existing_streams(recs):
    """Sourcing / customers / RFM / monitors use their own RNGs, so values that
    existed before (BOM ids, incident targets, sensor plants) are unchanged."""
    base = boms.generate_boms(product_ids=[p.id for p in recs["products"]], seed=42)
    assert [c.id for c in base["components"]] == [c.id for c in recs["components"]]
    assert recs["incidents"][1].component_id == "AMZN-CMP-MAG-02620"
    assert recs["telemetry"][0].plant_id == "AMZN-PLANT-002"
    assert recs["sub_suppliers"][0].parent_supplier_id == "AMZN-SUP1-034"


def test_products_and_plants_reference_manufacturers(recs):
    mfg_ids = {m.id for m in recs["manufacturers"]}
    assert all(p.manufacturer_id in mfg_ids for p in recs["products"])
    magna = next(p for p in recs["products"] if p.division == "MAGNA")
    assert magna.manufacturer_id == "AMZN-MFG-INNOTEK"
    self_plants = [p for p in recs["plants"] if p.operator == "SELF"]
    assert all(p.manufacturer_id in mfg_ids for p in self_plants)
    assert all(p.manufacturer_id is None for p in recs["plants"] if p.operator == "SUPPLIER")
    cust_ids = {c.id for c in recs["customers"]}
    assert all(p.customer_ids and set(p.customer_ids) <= cust_ids for p in recs["products"])


def test_certifications_target_plants_and_known_standards(recs):
    from data.reference import standards

    std_ids = {s["id"] for s in standards()}
    plant_ids = {p.id for p in recs["plants"]}
    certs = recs["certifications"]
    assert certs and len({c.id for c in certs}) == len(certs)
    assert all(c.target_id in plant_ids and c.standard_id in std_ids for c in certs)
    assert {c.target_id for c in certs if c.standard_id == "ISO-9001"} == plant_ids


def test_sub_suppliers_have_rfm_and_root_causes_link_incidents(recs):
    assert all(0 < s.rfm_recency <= 1 for s in recs["sub_suppliers"])
    inc_ids = {i.id for i in recs["incidents"]}
    assert all(rc.incident_id in inc_ids for rc in recs["root_causes"])


def test_carbon_scope_id_is_deterministic():
    cs = CarbonScope(plant_id="AMZN-PLANT-007", scope=3, period="2026-Q1", co2e_tons=1.0)
    assert (
        cs.id == carbon_scope_id("AMZN-PLANT-007", 3, "2026-Q1") == "CS-AMZN-PLANT-007-S3-2026-Q1"
    )
    assert CarbonScope(id="X", plant_id="P", scope=1, period="p", co2e_tons=0).id == "X"


def test_reference_substances_cover_component_declarations(recs):
    from data.reference import substances

    cas = {s["cas_id"] for s in substances()}
    declared = {s for c in recs["components"] for s in c.substances}
    assert declared <= cas, declared - cas
    lead = next(s for s in substances() if s["cas_id"] == "7439-92-1")
    assert lead["regulation_ids"] == ["REACH-SVHC", "RoHS"]
    tin = next(s for s in substances() if s["cas_id"] == "7440-31-5")
    assert tin["regulation_ids"] == [] and not tin["reach_svhc"] and not tin["rohs_restricted"]
