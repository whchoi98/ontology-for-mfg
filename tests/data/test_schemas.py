"""Validate that all 22 ontology classes have pydantic schemas with required fields."""
import pytest
from data import schemas


@pytest.mark.parametrize("cls_name", [
    # BOM 계층 (4)
    "Product", "Module", "Component", "RawMaterial",
    # Supply 양면 (5)
    "Manufacturer", "Supplier", "SubSupplier", "CustomerAccount", "Plant",
    # Geo / 운송 (2)
    "Region", "TradeLane",
    # 표준 / 규제 (4)
    "Standard", "Certification", "Regulation", "Substance",
    # 품질 (3)
    "QualityIncident", "EightDReport", "RootCause",
    # 운영 / ESG (4)
    "Telemetry", "MaintenanceEvent", "ESGIndicator", "CarbonScope",
])
def test_class_exists(cls_name):
    assert hasattr(schemas, cls_name), f"Missing schema: {cls_name}"


def test_class_count_22():
    classes = [c for c in dir(schemas) if c[0].isupper() and not c.startswith("_")]
    pydantic_classes = [c for c in classes if hasattr(getattr(schemas, c), "model_validate")]
    assert len(pydantic_classes) >= 22, f"Expected >=22 pydantic classes, got {len(pydantic_classes)}"


def test_product_has_required_fields():
    p = schemas.Product(id="AMZN-HE-OLED88-001", name="VisionOLED 88", line="VisionOLED",
                        division="HE", brand="AMZN Tech")
    assert p.id == "AMZN-HE-OLED88-001"


def test_component_conforms_to_standard_relation():
    c = schemas.Component(id="AMZN-CMP-IC-0001", name="MCU", category="IC",
                          standards=["AEC-Q100", "JESD22"])
    assert "AEC-Q100" in c.standards
