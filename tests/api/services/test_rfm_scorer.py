# tests/api/services/test_rfm_scorer.py
from api.services.rfm_scorer import score_supplier, rank_suppliers


def test_score_returns_0_to_1():
    s = score_supplier(otd_pct=0.92, defect_ppm=120, response_hours=18)
    assert 0.0 <= s["composite"] <= 1.0


def test_rank_orders_by_composite():
    suppliers = [
        {"id": "S1", "otd_pct": 0.99, "defect_ppm": 50, "response_hours": 4},
        {"id": "S2", "otd_pct": 0.80, "defect_ppm": 500, "response_hours": 48},
    ]
    ranked = rank_suppliers(suppliers)
    assert ranked[0]["id"] == "S1"
