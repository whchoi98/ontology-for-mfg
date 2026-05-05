from data.load_search import build_index_mapping, document_for_component


def test_index_mapping_has_nori_and_knn():
    m = build_index_mapping(embedding_dim=1024)
    assert m["settings"]["analysis"]["analyzer"]["nori_korean"]["type"] == "custom"
    assert m["mappings"]["properties"]["embedding"]["type"] == "knn_vector"
    assert m["mappings"]["properties"]["embedding"]["dimension"] == 1024


def test_doc_for_component_carries_searchable_text():
    comp = {"id": "AMZN-CMP-IC-00001", "name": "MCU-1", "category": "IC", "standards": ["AEC-Q100"], "substances": []}
    doc = document_for_component(comp)
    assert doc["id"] == "AMZN-CMP-IC-00001"
    assert "AEC-Q100" in doc["text"]
    assert doc["category"] == "IC"
