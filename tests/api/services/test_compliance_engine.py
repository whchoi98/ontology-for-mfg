# tests/api/services/test_compliance_engine.py
from api.services.compliance_engine import check_component
from data.schemas import Component  # noqa: F401


def test_rohs_lead_violation():
    comp = Component(id="C1", name="X", category="IC", substances=["7439-92-1"])  # Lead
    result = check_component(comp)
    assert result["compliant"] is False
    assert result["status"] == "non_compliant"
    assert any("RoHS" in v["regulation"] for v in result["violations"])


def test_clean_component():
    """Declared substances, none restricted → compliant."""
    comp = Component(
        id="C2", name="Y", category="IC", substances=["7440-31-5", "7429-90-5"]
    )  # tin, aluminium
    result = check_component(comp)
    assert result["compliant"] is True
    assert result["status"] == "compliant"
    assert result["violations"] == []


def test_missing_substance_data_is_not_compliant():
    """No substance declaration ≠ compliant — the engine must say it cannot
    decide instead of reporting a clean bill of health."""
    comp = Component(id="C3", name="Z", category="IC", substances=[])
    result = check_component(comp)
    assert result["compliant"] is None
    assert result["status"] == "insufficient_data"
    assert result["violations"] == []
