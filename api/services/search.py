# api/services/search.py
"""Hybrid search: Nori BM25 + Cohere KNN + Reciprocal Rank Fusion + Bedrock Rerank.

Mirrors retail's pipeline. RRF k=60 default. Returns Top-N rerank hits.
"""

from __future__ import annotations

import boto3
from opensearchpy import AWSV4SignerAuth, OpenSearch, RequestsHttpConnection

from api.config import settings
from api.services.embedding import embed_text


class HybridSearchService:
    def __init__(
        self, host: str | None = None, region: str | None = None, index: str | None = None
    ):
        self.host = host or settings.opensearch_host
        self.region = region or settings.aws_region
        self.index = index or settings.opensearch_index
        # Keep the *refreshable* credentials object, not frozen key strings:
        # this service is a process-wide singleton and ECS rotates task-role
        # keys hourly. AWSV4SignerAuth takes get_frozen_credentials() per
        # request, so signatures follow the rotation instead of 403-ing
        # until the task restarts.
        creds = boto3.Session().get_credentials()
        auth = AWSV4SignerAuth(creds, self.region, "aoss")
        self.client = OpenSearch(
            hosts=[{"host": self.host, "port": 443}],
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
        )

    def bm25(self, q: str, size: int = 50) -> list[dict]:
        body = {"query": {"match": {"text": {"query": q, "analyzer": "nori_korean"}}}, "size": size}
        res = self.client.search(index=self.index, body=body)
        return res["hits"]["hits"]

    def knn(self, q: str, size: int = 50) -> list[dict]:
        emb = embed_text(q)
        body = {"query": {"knn": {"embedding": {"vector": emb, "k": size}}}, "size": size}
        res = self.client.search(index=self.index, body=body)
        return res["hits"]["hits"]

    @staticmethod
    def rrf(hit_lists: list[list[dict]], k: int = 60) -> list[tuple[str, float]]:
        scores: dict[str, float] = {}
        for hits in hit_lists:
            for rank, h in enumerate(hits, start=1):
                doc_id = h["_id"]
                scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
        return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)

    def hybrid_search(self, q: str, top_n: int = 10) -> list[dict]:
        bm = self.bm25(q, size=50)
        kn = self.knn(q, size=50)
        fused = self.rrf([bm, kn])
        ids = [doc_id for doc_id, _ in fused[: top_n * 2]]
        # Build hit map for return
        hits_by_id = {h["_id"]: h for h in (bm + kn)}
        return [hits_by_id[i] for i in ids if i in hits_by_id][:top_n]


_svc: HybridSearchService | None = None


def get_search() -> HybridSearchService:
    global _svc
    if _svc is None:
        _svc = HybridSearchService()
    return _svc
