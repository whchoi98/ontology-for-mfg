# tests/api/services/test_lane_router.py
from unittest.mock import patch
from api.services.lane_router import simulate_reroute


@patch("api.services.lane_router.get_neptune")
def test_reroute_excludes_violating_lanes(mock_neptune):
    mock_client = mock_neptune.return_value
    mock_client.run_cypher.side_effect = [
        # affected lanes: 2 lanes ending in US from CN with IRA-30D tag
        [{"id": "L1", "origin_region": "CN", "dest_region": "US", "transit_days": 30, "regulations": ["IRA-30D"]},
         {"id": "L2", "origin_region": "CN", "dest_region": "US", "transit_days": 28, "regulations": ["IRA-30D"]}],
        # candidates: 1 lane MX->US, USMCA-Auto75
        [{"id": "L3", "origin_region": "MX", "dest_region": "US", "transit_days": 5, "regulations": ["USMCA-Auto75"]}],
    ]
    out = simulate_reroute(event="IRA_2026")
    assert any(lane["id"] == "L3" for lane in out["new_lanes"])
    assert all(lane["id"] != "L1" for lane in out["new_lanes"])
