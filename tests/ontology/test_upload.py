from unittest.mock import MagicMock, patch

import pytest

from ontology.upload import upload_schema_to_neptune


@patch("ontology.upload.requests.post")
def test_upload_calls_sparql_endpoint(mock_post):
    mock_post.return_value = MagicMock(status_code=200, text="OK")
    upload_schema_to_neptune(
        endpoint="https://neptune.local:8182", schema_path="ontology/schema.ttl"
    )
    args, kwargs = mock_post.call_args
    assert "neptune.local" in args[0] or "neptune.local" in kwargs.get("url", "")
    # SPARQL UPDATE endpoint
    assert "/sparql" in args[0] or "/sparql" in kwargs.get("url", "")


@pytest.mark.filterwarnings("ignore::DeprecationWarning")  # rdflib's SPARQL parser → pyparsing
def test_schema_update_replaces_instead_of_appending():
    """Re-uploading must not leave stale triples (old domains) behind."""
    from pathlib import Path

    import rdflib
    from rdflib.plugins.sparql.parser import parseUpdate

    from ontology.registry import SCHEMA_GRAPH
    from ontology.upload import build_schema_update

    ttl = (Path(__file__).resolve().parents[2] / "ontology" / "schema.ttl").read_text()
    update = build_schema_update(ttl)
    parseUpdate(update)  # valid SPARQL 1.1 Update
    assert f"DROP SILENT GRAPH <{SCHEMA_GRAPH}>" in update

    ds = rdflib.Dataset(default_union=True)
    legacy = (
        "INSERT DATA { <https://amzn.tech/mfg/ontology#locatedIn> "
        "<http://www.w3.org/2000/01/rdf-schema#domain> <https://amzn.tech/mfg/ontology#Plant> }"
    )
    ds.update(legacy)
    ds.update(update)
    ds.update(update)
    named = ds.graph(rdflib.URIRef(SCHEMA_GRAPH))
    expected = rdflib.Graph().parse(data=ttl, format="turtle")
    assert len(named) == len(expected)
    assert len(ds.default_context) == 0  # legacy default-graph triple purged
