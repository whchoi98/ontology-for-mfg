from data.load_graph import build_create_node_cypher, build_create_edge_cypher


def test_build_node_cypher():
    q = build_create_node_cypher("Product", {"id": "P1", "name": "X", "line": "VisionOLED", "division": "HE"})
    assert q.startswith("MERGE (n:Product {id: $id})")
    assert "SET n.name = $name" in q
    assert "n.line = $line" in q


def test_build_edge_cypher_typed():
    q = build_create_edge_cypher(src_label="Product", src_id="P1",
                                  rel="HAS_MODULE", dst_label="Module", dst_id="M1",
                                  props={})
    assert "MATCH (a:Product {id: $src_id})" in q
    assert "MATCH (b:Module {id: $dst_id})" in q
    assert "MERGE (a)-[r:HAS_MODULE]->(b)" in q


def test_build_edge_cypher_with_props():
    q = build_create_edge_cypher(src_label="Module", src_id="M1",
                                  rel="CONSISTS_OF", dst_label="Component", dst_id="C1",
                                  props={"qty": 4})
    assert "SET r.qty = $qty" in q
