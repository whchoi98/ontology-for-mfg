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
