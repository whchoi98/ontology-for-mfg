# tests/api/routers/test_price_lane_rfm.py
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.main import app


@patch("api.routers.price.get_neptune")
def test_price(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {
            "supplier_id": "S1",
            "supplier_name": "X",
            "region": "KR",
            "leadtime_days": 14,
            "otd": 0.95,
            "unit_price_usd": 1.50,
        }
    ]
    r = TestClient(app).post("/api/price", json={"component_id": "C1"})
    assert r.status_code == 200 and len(r.json()["offers"]) == 1


@patch("api.routers.price.get_neptune")
def test_price_real_rows_without_unit_price(mock_n):
    """Real SUPPLIED_BY edges carry leadtime/otd but no unit price (and may
    have nulls) — scoring must not KeyError/TypeError into a 500."""
    mock_n.return_value.run_cypher.return_value = [
        {
            "supplier_id": "S1",
            "supplier_name": "X",
            "region": "KR",
            "leadtime_days": 14,
            "otd": 0.95,
        },
        {
            "supplier_id": "S2",
            "supplier_name": "Y",
            "region": "CN",
            "leadtime_days": None,
            "otd": None,
        },
        {
            "supplier_id": "S3",
            "supplier_name": None,
            "region": None,
            "leadtime_days": 21.0,
            "otd": "0.9",
        },
    ]
    r = TestClient(app).post("/api/price", json={"component_id": "C1"})
    assert r.status_code == 200
    body = r.json()
    assert body["_synthetic"] is False
    assert len(body["offers"]) == 3
    assert all("composite_score" in o for o in body["offers"])
    assert body["summary"]["best_supplier_id"] in {"S1", "S2", "S3"}
    assert body["original"]["current_unit_price_usd"] is None


@patch("api.routers.scm_lane.get_neptune")
def test_lane_list(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {
            "id": "L1",
            "origin": "MX",
            "dest": "US",
            "mode": "ROAD",
            "days": 5,
            "regulations": ["USMCA-Auto75"],
        }
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
        {
            "id": "S1",
            "name": "X",
            "region": "KR",
            "otd_pct": 0.95,
            "quality": 0.9,
            "responsiveness": 0.85,
        }
    ]
    r = TestClient(app).post("/api/supplier-rfm", json={"tier": 1, "top_n": 5})
    assert r.status_code == 200 and r.json()["ranked"]
    assert r.json()["_synthetic"] is False


@patch("api.routers.supplier_rfm.get_neptune")
def test_rfm_tier2_without_rfm_properties_is_flagged(mock_n):
    """SubSupplier nodes have no rfm_* properties — the old code defaulted
    every metric to 0.9 and returned 50 identical scores as real data."""
    mock_n.return_value.run_cypher.return_value = [
        {
            "id": f"AMZN-SUP2-{i:03d}",
            "name": f"Tier2-{i}",
            "region": "CN",
            "otd_pct": None,
            "quality": None,
            "responsiveness": None,
        }
        for i in range(1, 11)
    ]
    r = TestClient(app).post("/api/supplier-rfm", json={"tier": 2, "top_n": 10})
    assert r.status_code == 200
    body = r.json()
    assert body["_synthetic"] is True
    assert len({row["composite"] for row in body["ranked"]}) > 1
    # Real identities are kept, metrics are marked as synthesized.
    assert {row["id"] for row in body["ranked"]} <= {f"AMZN-SUP2-{i:03d}" for i in range(1, 11)}
    assert all(row["_synthetic_metrics"] for row in body["ranked"])


@patch("api.routers.supplier_rfm.get_neptune")
def test_rfm_neptune_unconfigured_falls_back(mock_n):
    mock_n.side_effect = RuntimeError("NEPTUNE_ENDPOINT not configured")
    r = TestClient(app).post("/api/supplier-rfm", json={"tier": 1})
    assert r.status_code == 200
    assert r.json()["_synthetic"] is True


@patch("api.routers.price.get_neptune")
def test_price_real_rows_with_edge_prices_are_scored(mock_n):
    mock_n.return_value.run_cypher.return_value = [
        {
            "supplier_id": "S1",
            "supplier_name": "X",
            "region": "KR",
            "leadtime_days": 14,
            "otd": 0.95,
            "unit_price_usd": 2.0,
            "moq": 500,
        },
        {
            "supplier_id": "S2",
            "supplier_name": "Y",
            "region": "CN",
            "leadtime_days": 30,
            "otd": 0.80,
            "unit_price_usd": 3.0,
            "moq": 1000,
        },
    ]
    body = TestClient(app).post("/api/price", json={"component_id": "C1"}).json()
    assert body["summary"]["best_supplier_id"] == "S1"
    assert body["summary"]["price_available"] is True
    assert body["summary"]["min_unit_price_usd"] == 2.0
    q = mock_n.return_value.run_cypher.call_args[0][0]
    assert "unit_price_usd" in q
