# tests/ontology/test_schema_ttl.py
from pathlib import Path
import rdflib


def test_schema_parses_as_turtle():
    g = rdflib.Graph()
    schema_path = Path(__file__).resolve().parents[2] / "ontology" / "schema.ttl"
    g.parse(str(schema_path), format="turtle")
    # Count owl:Class declarations
    classes = list(g.triples((None, rdflib.RDF.type, rdflib.OWL.Class)))
    assert len(classes) >= 22, f"Expected >=22 owl:Class, got {len(classes)}"


def test_schema_has_bom_relations():
    g = rdflib.Graph()
    schema_path = Path(__file__).resolve().parents[2] / "ontology" / "schema.ttl"
    g.parse(str(schema_path), format="turtle")
    # Count owl:ObjectProperty declarations
    props = list(g.triples((None, rdflib.RDF.type, rdflib.OWL.ObjectProperty)))
    assert len(props) >= 18, f"Expected >=18 owl:ObjectProperty, got {len(props)}"
