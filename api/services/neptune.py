# api/services/neptune.py
"""Neptune openCypher client with SigV4 request signing.

Provides:
- run_cypher(query, params) -> list of result dicts
- build_subgraph_query(node_ids, hops=1) -> Cypher string
- subgraph_to_cytoscape(rows) -> Cytoscape.js JSON {nodes, edges}

Neptune with IAM auth requires every request to be signed with SigV4.
requests_aws4auth uses RefreshableCredentials which breaks on ECS task roles.
We use botocore.auth.SigV4Auth + get_frozen_credentials() instead.

Per client we keep ONE refreshable credential provider (taking a frozen
snapshot per request so ECS key rotation is picked up) and ONE pooled
`requests.Session` (keep-alive TLS instead of a handshake per query).
"""

from __future__ import annotations

import json
import logging
import threading
import urllib.parse
from typing import Any

import boto3
import requests
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from requests.adapters import HTTPAdapter

from api.config import settings

log = logging.getLogger("mfg.neptune")


def flatten_node(raw: Any) -> dict:
    """Flatten a Neptune openCypher node into a flat dict.

    Neptune openCypher result formats vary depending on driver and request shape.
    Common shapes:
      A) {"~id": "x", "~labels": ["L"], "~properties": {...}}
      B) {"~entityType": "node", "~id": "x", "~labels": ["L"], "~properties": {...}}
      C) flat: {"id": "x", "name": "..."} (when query uses `RETURN n.id, n.name` aliases)
    """
    if not isinstance(raw, dict):
        return {"id": str(raw), "name": str(raw)}

    # Shape A/B: extract ~properties
    if "~properties" in raw or "~id" in raw:
        props = dict(raw.get("~properties") or {})
        if "id" not in props and "~id" in raw:
            props["id"] = raw["~id"]
        if "name" not in props:
            props["name"] = props.get("id", "?")
        return props

    # Shape C: already flat
    return dict(raw)


def app_id_of(node: dict, flat: dict | None = None) -> str:
    """Application-level id for a node (what the UI and `{id: ...}` use)."""
    flat = flat if flat is not None else flatten_node(node)
    return str(flat.get("id") or flat.get("cas_id") or node.get("~id") or "?")


def list_prop(value: Any, default: list[str] | None = None) -> list[str]:
    """Read a list-valued node property.

    Neptune openCypher has no list properties, so the graph loader stores list
    fields comma-joined ("AEC-Q100,JESD22" — ontology/registry.py
    `serialized_lists`); split those back out. Lists and scalars are tolerated.
    """
    default = [] if default is None else default
    if value is None:
        return default
    if isinstance(value, list):
        return [str(x) for x in value]
    if isinstance(value, str):
        items = [x.strip() for x in value.split(",") if x.strip()]
        return items or default
    return [str(value)] if value else default


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
        # Shared across the FastAPI threadpool: urllib3's pool is thread-safe
        # and we never rely on session cookies/state.
        self._http = requests.Session()
        self._http.mount("https://", HTTPAdapter(pool_connections=1, pool_maxsize=16))
        self._creds_lock = threading.Lock()
        self._creds: Any = None

    def _credentials(self) -> Any:
        """Refreshable provider, resolved once (botocore refreshes it in place)."""
        if self._creds is None:
            with self._creds_lock:
                if self._creds is None:
                    creds = boto3.Session().get_credentials()
                    if creds is None:
                        raise RuntimeError("no AWS credentials for Neptune SigV4")
                    self._creds = creds
        return self._creds

    def _signed_post(self, path: str, form_body: str) -> requests.Response:
        """POST to Neptune with SigV4 signing. Uses form-encoded body as required."""
        url = f"{self.endpoint}{path}"
        creds = self._credentials().get_frozen_credentials()
        req = AWSRequest(
            method="POST",
            url=url,
            data=form_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        SigV4Auth(creds, "neptune-db", self._region).add_auth(req)
        return self._http.post(
            url,
            data=form_body,
            headers=dict(req.headers),
            timeout=30,
            verify=True,
        )

    def run_cypher(self, query: str, params: dict[str, Any] | None = None) -> list[dict]:
        # Neptune openCypher requires form-encoded body: query=<cypher>&parameters=<json>
        form_body = urllib.parse.urlencode(
            {
                "query": query,
                "parameters": json.dumps(params or {}),
            }
        )
        resp = self._signed_post("/openCypher", form_body)
        if not resp.ok:
            log.error("Neptune %s: %s — %s", resp.status_code, query[:80], resp.text[:200])
            resp.raise_for_status()
        return resp.json().get("results", [])

    def build_subgraph_query(self, node_ids: list[str], hops: int = 1) -> str:
        return "MATCH (n)-[r*1.." f"{hops}" "]-(m) WHERE n.id IN $ids " "RETURN n, r, m LIMIT 500"

    def subgraph_for(self, node_ids: list[str], hops: int = 1) -> dict:
        rows = self.run_cypher(self.build_subgraph_query(node_ids, hops), {"ids": node_ids})
        return self._rows_to_cytoscape(rows)

    @staticmethod
    def _rows_to_cytoscape(rows: list[dict]) -> dict:
        """Neptune `n, r, m` rows → Cytoscape JSON keyed by *application* ids.

        Node props live under `~properties` and relationship `~start`/`~end`
        are Neptune-internal ids, so nodes are flattened via `flatten_node`
        and edge endpoints are remapped through a ~id → app-id table (same
        pattern as `routers/objects._build_subgraph_for_id`, ADR-006). Edges
        whose endpoints weren't returned (intermediate hops) are dropped
        rather than left dangling.
        """
        nodes: dict[str, dict] = {}
        nep_to_app: dict[str, str] = {}
        pending: list[tuple[str, str, str, str]] = []
        for row in rows:
            for key in ("n", "m"):
                node = row.get(key)
                if not isinstance(node, dict):
                    continue
                flat = flatten_node(node)
                app_id = app_id_of(node, flat)
                if node.get("~id"):
                    nep_to_app[str(node["~id"])] = app_id
                if app_id not in nodes:
                    label = (node.get("~labels") or ["Node"])[0]
                    nodes[app_id] = {"data": {**flat, "id": app_id, "label": label}}
            rel_list = row.get("r")
            if isinstance(rel_list, dict):
                rel_list = [rel_list]
            if isinstance(rel_list, list):
                for rel in rel_list:
                    if not isinstance(rel, dict):
                        continue
                    rid, src, dst = rel.get("~id"), rel.get("~start"), rel.get("~end")
                    if rid and src and dst:
                        pending.append((str(rid), str(src), str(dst), rel.get("~type", "REL")))
        edges: dict[str, dict] = {}
        for rid, src_nep, dst_nep, rtype in pending:
            src = nep_to_app.get(src_nep)
            dst = nep_to_app.get(dst_nep)
            if src in nodes and dst in nodes and rid not in edges:
                edges[rid] = {"data": {"id": rid, "source": src, "target": dst, "type": rtype}}
        return {"nodes": list(nodes.values()), "edges": list(edges.values())}


_client: NeptuneClient | None = None


def get_neptune() -> NeptuneClient:
    global _client
    if _client is None:
        _client = NeptuneClient()
    return _client
