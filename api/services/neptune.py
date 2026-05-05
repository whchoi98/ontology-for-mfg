# api/services/neptune.py
"""Neptune openCypher client with SigV4 request signing.

Provides:
- run_cypher(query, params) -> list of result dicts
- build_subgraph_query(node_ids, hops=1) -> Cypher string
- subgraph_to_cytoscape(rows) -> Cytoscape.js JSON {nodes, edges}

Neptune with IAM auth requires every request to be signed with SigV4.
requests_aws4auth uses RefreshableCredentials which breaks on ECS task roles.
We use botocore.auth.SigV4Auth + get_frozen_credentials() instead.
"""
from __future__ import annotations
import json
import logging
import urllib.parse
import boto3
import requests
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from typing import Any
from api.config import settings

log = logging.getLogger("mfg.neptune")


class NeptuneClient:
    def __init__(self, endpoint: str | None = None):
        raw = endpoint or settings.neptune_endpoint
        if not raw:
            raise RuntimeError("NEPTUNE_ENDPOINT not configured")
        # Normalise: strip trailing slash, ensure https:// prefix, strip port suffix
        # NEPTUNE_ENDPOINT may be "https://host:8182" or just "host:8182"
        if not raw.startswith("http"):
            raw = f"https://{raw}"
        self.endpoint = raw.rstrip("/")
        # Extract host (without path) for SigV4 host header
        from urllib.parse import urlparse
        parsed = urlparse(self.endpoint)
        self._host = parsed.netloc  # e.g. "host.neptune.amazonaws.com:8182"
        self._region = settings.aws_region

    def _signed_post(self, path: str, form_body: str) -> requests.Response:
        """POST to Neptune with SigV4 signing. Uses form-encoded body as required."""
        url = f"{self.endpoint}{path}"
        creds = boto3.Session().get_credentials().get_frozen_credentials()
        req = AWSRequest(
            method="POST",
            url=url,
            data=form_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        SigV4Auth(creds, "neptune-db", self._region).add_auth(req)
        return requests.post(
            url,
            data=form_body,
            headers=dict(req.headers),
            timeout=30,
            verify=True,
        )

    def run_cypher(self, query: str, params: dict[str, Any] | None = None) -> list[dict]:
        # Neptune openCypher requires form-encoded body: query=<cypher>&parameters=<json>
        form_body = urllib.parse.urlencode({
            "query": query,
            "parameters": json.dumps(params or {}),
        })
        resp = self._signed_post("/openCypher", form_body)
        if not resp.ok:
            log.error("Neptune %s: %s — %s", resp.status_code, query[:80], resp.text[:200])
            resp.raise_for_status()
        return resp.json().get("results", [])

    def build_subgraph_query(self, node_ids: list[str], hops: int = 1) -> str:
        return (
            "MATCH (n)-[r*1.."
            f"{hops}"
            "]-(m) WHERE n.id IN $ids "
            "RETURN n, r, m LIMIT 500"
        )

    def subgraph_for(self, node_ids: list[str], hops: int = 1) -> dict:
        rows = self.run_cypher(self.build_subgraph_query(node_ids, hops), {"ids": node_ids})
        return self._rows_to_cytoscape(rows)

    @staticmethod
    def _rows_to_cytoscape(rows: list[dict]) -> dict:
        nodes: dict[str, dict] = {}
        edges: dict[str, dict] = {}
        for row in rows:
            for key in ("n", "m"):
                node = row.get(key)
                if not node:
                    continue
                nid = node.get("~id") or (node.get("properties") or {}).get("id")
                if nid and nid not in nodes:
                    label = (node.get("~labels") or ["Node"])[0]
                    nodes[nid] = {"data": {"id": nid, "label": label, **(node.get("properties") or {})}}
            rel_list = row.get("r")
            if isinstance(rel_list, list):
                for rel in rel_list:
                    rid = rel.get("~id")
                    src = rel.get("~start")
                    dst = rel.get("~end")
                    if rid and src and dst and rid not in edges:
                        edges[rid] = {"data": {"id": rid, "source": src, "target": dst,
                                                "type": rel.get("~type", "REL")}}
        return {"nodes": list(nodes.values()), "edges": list(edges.values())}


_client: NeptuneClient | None = None


def get_neptune() -> NeptuneClient:
    global _client
    if _client is None:
        _client = NeptuneClient()
    return _client
