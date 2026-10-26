"""Even the synthetic fallback subgraph must only show relationships the ontology has —
same names and directions as ontology/registry.py (what the loader writes to Neptune)."""

import pytest

from api.routers.objects import _synthesize_subgraph
from ontology import registry


@pytest.mark.parametrize("label", registry.labels())
def test_synthetic_neighbourhood_uses_real_relationships(label):
    nodes, edges, _ = _synthesize_subgraph(label, "X-1")
    by_id = {n["data"]["id"]: n["data"]["label"] for n in nodes}
    assert edges, label
    for e in edges:
        d = e["data"]
        src, dst = by_id[d["source"]], by_id[d["target"]]
        dom, rng = registry.endpoints(d["type"])  # raises/empty for unknown rel types
        assert src in dom and dst in rng, (label, d["type"], src, dst)
    assert len({e["data"]["id"] for e in edges}) == len(edges)
