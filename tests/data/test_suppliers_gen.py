# tests/data/test_suppliers_gen.py
from data.synthetic.suppliers import generate_suppliers
from data.schemas import SubSupplier


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
