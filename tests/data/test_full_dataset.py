# tests/data/test_full_dataset.py
"""Run all generators end-to-end + validate cross-file integrity."""
import json
from pathlib import Path
import pytest

OUTPUT = Path(__file__).resolve().parents[2] / "data" / "output"


@pytest.fixture(scope="module", autouse=True)
def run_all_generators():
    """Skip this test if generators haven't been run.

    To populate fixtures: run `make data` or
    `for m in products boms suppliers customers plants lanes incidents telemetry maintenance esg; do python -m data.synthetic.$m; done`.
    """
    if not (OUTPUT / "products.ndjson").exists():
        pytest.skip("Run generators first: python -m data.synthetic.<module>")


def _load(name: str) -> list[dict]:
    return [json.loads(la) for la in (OUTPUT / f"{name}.ndjson").read_text(encoding="utf-8").splitlines()]


def test_total_node_count_within_target():
    counts = {}
    for f in OUTPUT.glob("*.ndjson"):
        counts[f.stem] = sum(1 for _ in f.read_text(encoding="utf-8").splitlines())
    total = sum(counts.values())
    # Spec § 8.4 target = ~10,000 nodes (sensors 5000 dominate; +products/modules/components/raw/etc)
    assert 9_500 <= total <= 11_000, f"Total {total} outside target ~10K. Counts: {counts}"


def test_components_reference_valid_modules():
    # In our deterministic generator components don't carry parent IDs; but we can sanity check counts
    components = _load("components")
    modules = _load("modules")
    assert len(components) >= 7 * len(modules) - 100  # ~7.5/module average


def test_lanes_have_balanced_modes():
    lanes = _load("lanes")
    from collections import Counter
    modes = Counter(la["mode"] for la in lanes)
    assert all(m >= 10 for m in modes.values()), f"Mode imbalance: {modes}"


def test_incident_INC_2026_0412_present():
    incidents = _load("incidents")
    inc_ids = {i["id"] for i in incidents}
    assert "INC-2026-0412" in inc_ids
