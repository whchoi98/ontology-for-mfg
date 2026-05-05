# api/services/neptune.py
"""Neptune openCypher client.

Provides:
- run_cypher(query, params) -> list of result dicts
- build_subgraph_query(node_ids, hops=1) -> Cypher string
- subgraph_to_cytoscape(rows) -> Cytoscape.js JSON {nodes, edges}
"""
from __future__ import annotations
import json
import requests
from typing import Any
from api.config import settings


class NeptuneClient:
    def __init__(self, endpoint: str | None = None):
        self.endpoint = endpoint or settings.neptune_endpoint
        if not self.endpoint:
            raise RuntimeError("NEPTUNE_ENDPOINT not configured")

    def run_cypher(self, query: str, params: dict[str, Any] | None = None) -> list[dict]:
        url = f"{self.endpoint.rstrip('/')}/openCypher"
        body = {"query": query, "parameters": json.dumps(params or {})}
        resp = requests.post(url, json=body, timeout=30, verify=True)
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
