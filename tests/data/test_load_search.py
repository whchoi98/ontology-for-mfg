import io
import json

import pytest

from data import embedding as emb
from data import load_search as ls
from data.load_search import build_index_mapping, document_for_component
from data.synthetic.pipeline import generate_dataset


def test_index_mapping_has_nori_and_knn():
    m = build_index_mapping(embedding_dim=1024)
    assert m["settings"]["analysis"]["analyzer"]["nori_korean"]["type"] == "custom"
    assert m["mappings"]["properties"]["embedding"]["type"] == "knn_vector"
    assert m["mappings"]["properties"]["embedding"]["dimension"] == 1024


def test_doc_for_component_carries_searchable_text():
    comp = {
        "id": "AMZN-CMP-IC-00001",
        "name": "MCU-1",
        "category": "IC",
        "standards": ["AEC-Q100"],
        "substances": [],
    }
    doc = document_for_component(comp)
    assert doc["id"] == "AMZN-CMP-IC-00001"
    assert "AEC-Q100" in doc["text"]
    assert doc["category"] == "IC"


# ───────────── full-load behaviour (fake AOSS client, no AWS) ─────────────


class _FakeIndices:
    def __init__(self, log):
        self.log = log

    def delete(self, index):
        self.log.append(("delete", index))

    def create(self, index, body):
        self.log.append(("create", index, body))


class _FakeAOSS:
    def __init__(self):
        self.log: list = []
        self.indices = _FakeIndices(self.log)
        self.docs: list[dict] = []

    def bulk(self, body):
        lines = [json.loads(x) for x in body.splitlines() if x]
        items = []
        for action, doc in zip(lines[::2], lines[1::2], strict=False):
            assert "_id" not in action["index"], "AOSS VECTORSEARCH rejects custom _id"
            self.docs.append(doc)
            items.append({"index": {"status": 201}})
        self.log.append(("bulk", len(items)))
        return {"errors": False, "items": items}


@pytest.fixture(scope="module")
def dataset_dir(tmp_path_factory):
    out = tmp_path_factory.mktemp("synthetic-search")
    generate_dataset(out)
    return out


def _fake_embed(text: str) -> list[float]:
    return [float(len(text) % 7)] * emb.EMBED_DIM


def test_full_load_recreates_index_and_is_idempotent(dataset_dir):
    client = _FakeAOSS()
    n1 = ls.index_components(
        index_name="mfg-search",
        output_dir=dataset_dir,
        client=client,
        embed_fn=_fake_embed,
        workers=1,
    )
    n2 = ls.index_components(
        index_name="mfg-search",
        output_dir=dataset_dir,
        client=client,
        embed_fn=_fake_embed,
        workers=1,
    )
    assert n1 == n2 == 2958
    ops = [e[0] for e in client.log]
    # delete → create precede each load's bulk calls: the second run replaces the first
    assert ops[0:2] == ["delete", "create"]
    second = ops.index("delete", 1)
    assert ops[second : second + 2] == ["delete", "create"]
    assert "embedding" in client.log[1][2]["mappings"]["properties"]


def test_documents_carry_app_id_and_embedding(dataset_dir):
    client = _FakeAOSS()
    ls.index_components(output_dir=dataset_dir, client=client, embed_fn=_fake_embed, workers=2)
    doc = client.docs[0]
    assert doc["id"].startswith("AMZN-CMP-")  # app id in _source (search router reads it)
    assert doc["label"] == "Component"
    assert len(doc["embedding"]) == emb.EMBED_DIM
    assert doc["standards"] and doc["substances"]
    assert any(t in doc["text"] for t in ("Thermal", "Reliability", "Quality", "Acceptab"))


def test_no_embed_mode_skips_bedrock(dataset_dir):
    client = _FakeAOSS()

    def _forbidden(_):
        raise AssertionError("embedding called with embed=False")

    ls.index_components(output_dir=dataset_dir, client=client, embed=False, embed_fn=_forbidden)
    assert "embedding" not in client.docs[0]


def test_keep_index_appends_without_recreate(dataset_dir):
    client = _FakeAOSS()
    ls.index_components(output_dir=dataset_dir, client=client, embed=False, recreate=False)
    assert [e[0] for e in client.log if e[0] != "bulk"] == []


def test_bulk_failures_raise():
    class _Failing(_FakeAOSS):
        def bulk(self, body):
            return {"errors": True, "items": [{"index": {"status": 400, "error": "bad"}}]}

    with pytest.raises(RuntimeError, match="bulk failures"):
        ls.bulk_index(_Failing(), "mfg-search", [{"id": "x"}])


def test_bulk_body_has_no_doc_ids():
    body = ls.bulk_body("mfg-search", [{"id": "A"}, {"id": "B"}])
    lines = [json.loads(x) for x in body.splitlines()]
    assert lines[0] == {"index": {"_index": "mfg-search"}} == lines[2]
    assert lines[1]["id"] == "A"


# ───────────────────────────── embedding helper ────────────────────────────


def test_titan_request_matches_index_dimension():
    body = json.loads(emb.build_request("amazon.titan-embed-text-v2:0", "hello"))
    assert body == {"inputText": "hello", "dimensions": 1024, "normalize": True}


def test_cohere_request_uses_document_input_type():
    body = json.loads(emb.build_request("global.cohere.embed-v4:0", "hello"))
    assert body["input_type"] == "search_document" and body["output_dimension"] == 1024


@pytest.mark.parametrize(
    "payload",
    [
        {"embedding": [0.1, 0.2]},
        {"embeddings": {"float": [[0.1, 0.2]]}},
        {"embeddings": [[0.1, 0.2]]},
    ],
)
def test_parse_response_shapes(payload):
    assert emb.parse_response(payload) == [0.1, 0.2]


def test_make_embedder_validates_dimension():
    class _Client:
        def invoke_model(self, modelId, body):
            return {"body": io.BytesIO(json.dumps({"embedding": [0.0] * 3}).encode())}

    embed = emb.make_embedder(model_id="amazon.titan-embed-text-v2:0", client=_Client())
    with pytest.raises(ValueError, match="dims"):
        embed("x")


def test_embed_documents_preserves_order():
    out = emb.embed_documents(["a", "bb", "ccc"], lambda t: [float(len(t))], workers=3)
    assert out == [[1.0], [2.0], [3.0]]
