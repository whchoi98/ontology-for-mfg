# tests/api/routers/test_price_lane_rfm.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app


@patch("api.routers.price.get_neptune")
def test_price(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {"supplier_id": "S1", "supplier_name": "X", "region": "KR",
         "leadtime_days": 14, "otd": 0.95, "unit_price_usd": 1.50}
    ]
    r = TestClient(app).post("/api/price", json={"component_id": "C1"})
    assert r.status_code == 200 and len(r.json()["offers"]) == 1


@patch("api.routers.scm_lane.get_neptune")
def test_lane_list(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {"id": "L1", "origin": "MX", "dest": "US", "mode": "ROAD", "days": 5, "regulations": ["USMCA-Auto75"]}
    ]
    r = TestClient(app).get("/api/lane")
    assert r.status_code == 200 and len(r.json()["lanes"]) == 1


@patch("api.routers.scm_lane.simulate_reroute")
def test_lane_reroute(mock_sim):
    mock_sim.return_value = {"event": "IRA_2026", "lanes_to_drop": [], "new_lanes": [{"id": "L3"}]}
    r = TestClient(app).post("/api/lane/reroute", json={"event": "IRA_2026"})
    assert r.status_code == 200 and "new_lanes" in r.json()


@patch("api.routers.supplier_rfm.get_neptune")
def test_rfm(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {"id": "S1", "name": "X", "region": "KR", "otd_pct": 0.95, "quality": 0.9, "responsiveness": 0.85}
    ]
    r = TestClient(app).post("/api/supplier-rfm", json={"tier": 1, "top_n": 5})
    assert r.status_code == 200 and r.json()["ranked"]
