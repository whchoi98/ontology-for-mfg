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
