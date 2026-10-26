import json
from collections import Counter

import pytest

from data import load_graph as lg
from data.load_graph import build_create_edge_cypher, build_create_node_cypher
from data.schemas import carbon_scope_id
from data.synthetic.pipeline import generate_dataset
from ontology import registry as reg


def test_build_node_cypher():
    q = build_create_node_cypher(
        "Product", {"id": "P1", "name": "X", "line": "VisionOLED", "division": "HE"}
    )
    assert q.startswith("MERGE (n:Product {id: $id})")
    assert "SET n.name = $name" in q
    assert "n.line = $line" in q


def test_build_edge_cypher_typed():
    q = build_create_edge_cypher(
        src_label="Product",
        src_id="P1",
        rel="HAS_MODULE",
        dst_label="Module",
        dst_id="M1",
        props={},
    )
    assert "MATCH (a:Product {id: $src_id})" in q
    assert "MATCH (b:Module {id: $dst_id})" in q
    assert "MERGE (a)-[r:HAS_MODULE]->(b)" in q


def test_build_edge_cypher_with_props():
    q = build_create_edge_cypher(
        src_label="Module",
        src_id="M1",
        rel="CONSISTS_OF",
        dst_label="Component",
        dst_id="C1",
        props={"qty": 4},
    )
    assert "SET r.qty = $qty" in q


# ─────────────── registry-driven build layer (pure, no AWS) ───────────────


@pytest.fixture(scope="module")
def dataset_dir(tmp_path_factory):
    out = tmp_path_factory.mktemp("synthetic")
    generate_dataset(out)
    return out


@pytest.fixture(scope="module")
def graph(dataset_dir):
    return lg.build_graph(dataset_dir)


def _ndjson(dataset_dir, stem):
    return [json.loads(x) for x in (dataset_dir / f"{stem}.ndjson").read_text().splitlines() if x]


def test_all_22_labels_loaded_including_reference_nodes(graph):
    counts = graph.node_counts()
    assert set(counts) == set(reg.labels()) and len(counts) == 22
    assert all(c > 0 for c in counts.values()), counts
    assert counts["Region"] == 7
    assert counts["Regulation"] == 5
    assert counts["Standard"] >= 20
    assert counts["Substance"] >= 50
    assert counts["Certification"] > 0


def test_carbon_scope_rows_get_deterministic_unique_ids(graph, dataset_dir):
    rows = graph.nodes["CarbonScope"]
    assert len(rows) == 120  # 40 plants × 3 scopes — none skipped any more
    assert len({r["id"] for r in rows}) == 120
    raw = _ndjson(dataset_dir, "esg_carbon_scopes")[0]
    assert raw["id"] == carbon_scope_id(raw["plant_id"], raw["scope"], raw["period"])


def test_legacy_carbon_scope_rows_without_id_still_load():
    spec = reg.node_spec("CarbonScope")
    rec = {"plant_id": "AMZN-PLANT-001", "scope": 2, "period": "2026-Q1", "co2e_tons": 1.0}
    assert lg.node_properties(spec, rec)["id"] == "CS-AMZN-PLANT-001-S2-2026-Q1"


def test_special_id_fields(graph):
    sub = graph.nodes["Substance"][0]
    assert sub["id"] == sub["cas_id"]
    tel = graph.nodes["Telemetry"][0]
    assert tel["id"] == tel["sensor_id"]


def test_node_props_are_neptune_scalars_and_lists_serialized(graph):
    for label, rows in graph.nodes.items():
        for r in rows:
            for k, v in r.items():
                assert isinstance(v, str | int | float | bool), (label, k, v)
    comp = next(r for r in graph.nodes["Component"] if reg.LIST_SEPARATOR in r["substances"])
    assert all(cas for cas in comp["substances"].split(reg.LIST_SEPARATOR))
    # list fields that are only edges are not node props
    assert "module_ids" not in comp and "supply" not in comp and "raw_material_ids" not in comp
    lane = next(r for r in graph.nodes["TradeLane"] if r["regulations"])
    assert lane["regulations"] in {"CBAM", "IRA-30D", "USMCA-Auto75"}
    assert all("regulations" in r for r in graph.nodes["TradeLane"])  # "" when untagged


def test_every_registry_rel_type_materialised_without_dangling(graph):
    counts = graph.edge_counts()
    assert set(counts) == set(reg.rel_types()), set(reg.rel_types()) ^ set(counts)
    assert all(c > 0 for c in counts.values()), counts
    assert graph.dangling == []


def test_edge_counts_follow_the_source_records(graph, dataset_dir):
    comps = _ndjson(dataset_dir, "components")
    lanes = _ndjson(dataset_dir, "lanes")
    counts = graph.edge_counts()
    assert counts["CONSISTS_OF"] == sum(len(c["module_ids"]) for c in comps)
    assert counts["SUPPLIED_BY"] == sum(len(c["supply"]) for c in comps)
    assert counts["CONTAINS_SUBSTANCE"] == sum(len(c["substances"]) for c in comps)
    assert counts["CONFORMS_TO"] == sum(len(c["standards"]) for c in comps)
    assert counts["SUBJECT_TO"] == sum(len(la["regulations"]) for la in lanes) > 0
    assert counts["CONNECTS"] == 2 * len(lanes)
    assert counts["EMITS"] == 120
    assert counts["FROM"] == 5000
    assert counts["HAS_MODULE"] == len(_ndjson(dataset_dir, "modules"))


def test_consists_of_matches_generator_bom_not_round_robin(graph, dataset_dir):
    """Each component hangs off the module the generator created it under."""
    comps = {c["id"]: c["module_ids"] for c in _ndjson(dataset_dir, "components")}
    for e in graph.edges[("CONSISTS_OF", "Module", "Component")]:
        assert comps[e["dst"]] == [e["src"]]
        assert e["props"] == {"qty": 1}


def test_supplied_by_edges_carry_offer_props(graph):
    e = graph.edges[("SUPPLIED_BY", "Component", "Supplier")][0]
    assert set(e["props"]) == {"leadtime", "otd", "unit_price_usd", "moq"}
    assert isinstance(e["props"]["leadtime"], int)


def test_reverse_and_polymorphic_rules(graph, dataset_dir):
    # reverse FK: CarbonScope.plant_id → (Plant)-[:EMITS]->(CarbonScope)
    emits = graph.edges[("EMITS", "Plant", "CarbonScope")][0]
    assert emits["src"].startswith("AMZN-PLANT-") and emits["dst"].startswith("CS-")
    # polymorphic MaintenanceEvent.target_id → AT_PLANT or PERFORMED_ON, never both
    maint = _ndjson(dataset_dir, "maintenance")
    at = {e["src"] for e in graph.edges[("AT_PLANT", "MaintenanceEvent", "Plant")]}
    on = {e["src"] for e in graph.edges[("PERFORMED_ON", "MaintenanceEvent", "Component")]}
    assert not at & on and len(at | on) == len(maint)
    # join: every 8D whose incident has a RootCause identifies it
    assert len(graph.edges[("IDENTIFIES", "EightDReport", "RootCause")]) == 150


def test_dangling_fk_is_reported_not_silently_dropped(dataset_dir):
    records = lg.load_records(dataset_dir)
    records["TradeLane"] = [dict(records["TradeLane"][0], regulations=["NOT-A-REG"])]
    g = lg.build_graph(records=records)
    assert any(d.field == "regulations" and d.value == "NOT-A-REG" for d in g.dangling)


def test_batch_cypher_shapes():
    q = lg.node_batch_cypher("Plant")
    assert q == "UNWIND $rows AS row MERGE (n:`Plant` {id: row.id}) SET n += row"
    q = lg.edge_batch_cypher("FROM", "Telemetry", "Plant")
    assert "MATCH (a:`Telemetry` {id: row.src})" in q
    assert "MATCH (b:`Plant` {id: row.dst})" in q
    assert "MERGE (a)-[r:`FROM`]->(b) SET r += row.props" in q


def test_iter_statements_nodes_before_edges_and_batched(graph):
    stmts = list(lg.iter_statements(graph, batch_size=500))
    kinds = ["edge" if "MERGE (a)-" in q else "node" for q, _ in stmts]
    assert kinds == sorted(kinds, key=lambda k: k == "edge")  # all nodes first
    assert all(len(p["rows"]) <= 500 for _, p in stmts)
    n_rows = sum(len(p["rows"]) for q, p in stmts if "MERGE (n:" in q)
    assert n_rows == sum(graph.node_counts().values())
    assert not any("MERGE (a)-" in q for q, _ in lg.iter_statements(graph, include_edges=False))


def test_dry_run_never_touches_neptune(monkeypatch, dataset_dir, capsys):
    def boom(*a, **k):
        raise AssertionError("network call during --dry-run")

    monkeypatch.setattr(lg, "_post_cypher", boom)
    lg.main(["--dry-run", "--output-dir", str(dataset_dir)])
    out = capsys.readouterr().out
    assert "across 22 labels" in out and "EMITS" in out


def test_load_with_reset_sends_deletes_then_merges(monkeypatch, dataset_dir):
    calls: list[str] = []
    remaining = Counter({lbl: 1 for lbl in reg.labels()})

    def fake_post(endpoint, query, params):
        calls.append(query)
        if query.startswith("MATCH (n:") and "count(n)" in query:
            lbl = query.split("`")[1]
            c = remaining[lbl]
            remaining[lbl] = 0
            return {"results": [{"c": c}]}
        return {"results": []}

    monkeypatch.setattr(lg, "_post_cypher", fake_post)
    lg.main(
        [
            "--endpoint",
            "https://neptune.local:8182",
            "--reset",
            "--output-dir",
            str(dataset_dir),
            "--batch-size",
            "1000",
        ]
    )
    first_merge = next(i for i, q in enumerate(calls) if "MERGE" in q)
    deletes = [q for q in calls if "DETACH DELETE" in q]
    assert len(deletes) == 22
    assert all(i < first_merge for i, q in enumerate(calls) if "DETACH DELETE" in q)
    assert any("[r:`SUPPLIED_BY`]" in q for q in calls)


def test_main_refuses_dangling_without_flag(monkeypatch, tmp_path):
    generate_dataset(tmp_path)
    lanes = tmp_path / "lanes.ndjson"
    rows = [json.loads(x) for x in lanes.read_text().splitlines()]
    rows[0]["regulations"] = ["NOT-A-REG"]
    lanes.write_text("".join(json.dumps(r) + "\n" for r in rows))
    with pytest.raises(SystemExit, match="dangling"):
        lg.main(["--dry-run", "--output-dir", str(tmp_path)])
    lg.main(["--dry-run", "--allow-dangling", "--output-dir", str(tmp_path)])
