# tests/api/services/test_compliance_engine.py
from data.schemas import Component  # noqa: F401
from api.services.compliance_engine import check_component


def test_rohs_lead_violation():
    comp = Component(id="C1", name="X", category="IC", substances=["7439-92-1"])  # Lead
    result = check_component(comp)
    assert result["compliant"] is False
    assert any("RoHS" in v["regulation"] for v in result["violations"])


def test_clean_component():
    comp = Component(id="C2", name="Y", category="IC", substances=[])
    result = check_component(comp)
    assert result["compliant"] is True
    assert result["violations"] == []
