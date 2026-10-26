"""Document embeddings for the `mfg-search` index (loader side).

Same model contract as the API's query-side helper (`api/services/embedding.py`):
`MFG_EMBED_MODEL_ID` (default Titan Text Embeddings v2), 1024 dimensions,
normalised — matching the index's `knn_vector` mapping and the API's KNN query.
It lives in `data/` because the loader image ships only `data/` + `ontology/`
(no `api/` package), and documents are embedded with Cohere's
`input_type="search_document"` where the API embeds queries with
`"search_query"`.

`build_request()` / `parse_response()` are pure (unit-tested offline);
`embed_documents()` is the only function that calls Bedrock.
"""

from __future__ import annotations

import json
import os
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

DEFAULT_MODEL_ID = "amazon.titan-embed-text-v2:0"
EMBED_DIM = 1024

EmbedFn = Callable[[str], list[float]]


def model_id_from_env() -> str:
    return os.environ.get("MFG_EMBED_MODEL_ID", DEFAULT_MODEL_ID)


def build_request(
    model_id: str, text: str, *, input_type: str = "search_document", dim: int = EMBED_DIM
) -> str:
    if "titan" in model_id:
        return json.dumps({"inputText": text, "dimensions": dim, "normalize": True})
    if "cohere" in model_id:
        body: dict = {"texts": [text], "input_type": input_type}
        if "v4" in model_id:
            body["output_dimension"] = dim
        return json.dumps(body)
    return json.dumps({"inputText": text})


def parse_response(payload: dict) -> list[float]:
    if "embedding" in payload:  # Titan
        return list(payload["embedding"])
    emb = payload.get("embeddings")
    if isinstance(emb, dict):  # Cohere v4 {"float": [[...]]}
        return list((emb.get("float") or [[]])[0])
    if isinstance(emb, list) and emb:  # Cohere v3 [[...]]
        return list(emb[0])
    raise ValueError(f"unrecognised embedding response keys: {sorted(payload)}")


def make_embedder(
    *, model_id: str | None = None, region: str | None = None, client=None, dim: int = EMBED_DIM
) -> EmbedFn:
    """Return `text -> vector` bound to one Bedrock runtime client."""
    model_id = model_id or model_id_from_env()
    if client is None:
        import boto3
        from botocore.config import Config

        client = boto3.client(
            "bedrock-runtime",
            region_name=region or os.environ.get("AWS_REGION", "ap-northeast-2"),
            config=Config(retries={"max_attempts": 10, "mode": "adaptive"}),
        )

    def embed(text: str) -> list[float]:
        resp = client.invoke_model(modelId=model_id, body=build_request(model_id, text, dim=dim))
        vec = parse_response(json.loads(resp["body"].read()))
        if len(vec) != dim:
            raise ValueError(f"{model_id} returned {len(vec)} dims, index expects {dim}")
        return vec

    return embed


def embed_documents(texts: list[str], embed: EmbedFn, *, workers: int = 8) -> list[list[float]]:
    """Embed in parallel, preserving order (boto3 clients are thread-safe)."""
    if workers <= 1:
        return [embed(t) for t in texts]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(embed, texts))
