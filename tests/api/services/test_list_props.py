"""Neptune openCypher has no list properties — the loader stores lists comma-joined
(ontology/registry.py `serialized_lists`). Every reader must split them back."""

from unittest.mock import MagicMock, patch

from api.routers.scm_lane import _normalise_lane
from api.services.neptune import list_prop


def test_list_prop_splits_comma_joined_strings():
    assert list_prop("AEC-Q100,JESD22") == ["AEC-Q100", "JESD22"]
    assert list_prop(" IRA , USMCA ,") == ["IRA", "USMCA"]
    assert list_prop(["a", 1]) == ["a", "1"]
    assert list_prop(None) == [] and list_prop("", ["x"]) == ["x"]


def test_lane_regulations_are_split():
    assert _normalise_lane({"id": "L1", "regulations": "IRA,USMCA"})["regulations"] == [
        "IRA",
        "USMCA",
    ]


@patch("api.routers.substitute.get_neptune")
def test_substitute_reads_each_standard_of_the_original(mock_nep):
    from fastapi.testclient import TestClient

    from api.main import app

    mock_nep.return_value = MagicMock(
        run_cypher=MagicMock(
            return_value=[
                {
                    "id": "AMZN-CMP-IC-00001",
                    "name": "IC",
                    "category": "IC",
                    "standards": "AEC-Q100,JESD22",
                }
            ]
        )
    )
    r = TestClient(app).post("/api/substitute", json={"component_id": "AMZN-CMP-IC-00001"})
    assert r.status_code == 200
    assert r.json()["original"]["standards"] == ["AEC-Q100", "JESD22"]
