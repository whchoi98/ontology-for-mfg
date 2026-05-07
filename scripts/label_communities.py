"""Label graphify communities with intuitive Korean+English names via Bedrock.

Reads `graphify-out/graph.json`, groups nodes by community, asks Claude Haiku
4.5 (CRIP profile) to name each community, and patches three artefacts in
`web/public/codegraph/`:

  1. graph.json   — adds top-level `community_labels: {id: name}` (additive,
                    keeps the original schema untouched).
  2. graph.html   — replaces every `"community_name": "Community N"` with
                    the human label so the visualization tooltip shows it.
  3. GRAPH_REPORT.md — replaces `### Community N - "Community N"` headings.

Run from repo root:
    python3 scripts/label_communities.py
"""
from __future__ import annotations

import concurrent.futures
import json
import logging
import re
import sys
from collections import defaultdict
from pathlib import Path

import boto3

LOG = logging.getLogger("label_communities")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parents[1]
GRAPH_JSON = ROOT / "graphify-out" / "graph.json"
PUBLIC_DIR = ROOT / "web" / "public" / "codegraph"
PUBLIC_GRAPH_JSON = PUBLIC_DIR / "graph.json"
PUBLIC_GRAPH_HTML = PUBLIC_DIR / "graph.html"
PUBLIC_REPORT_MD = PUBLIC_DIR / "GRAPH_REPORT.md"

MODEL_ID = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
REGION = "ap-northeast-2"

# Cap representative-node count per community to keep prompts small.
MAX_NODES_PER_COMMUNITY = 12
MAX_FILES_PER_COMMUNITY = 6

PROMPT = (
    "다음은 한 코드 모듈(community)에 모인 함수/클래스/파일 목록입니다. "
    "이 모듈을 한국어 2~5단어로 직관적으로 명명하세요. "
    "예: '인사이트 라우터', '8D 파이프라인', '대화 UI 컴포넌트', "
    "'합성 데이터 생성기', 'Cytoscape 그래프 뷰', 'PdM 텔레메트리 라우터'. "
    "코드 도메인을 그대로 반영하고, 모르겠으면 가장 두드러진 파일 경로를 그대로 쓰세요. "
    "오로지 이름만 한 줄로 답하세요. 따옴표/접두사/설명/이모지 금지."
)


def gather_communities(graph: dict) -> dict[int, dict]:
    """Group nodes by community → representative payload for naming."""
    by_comm: dict[int, list[dict]] = defaultdict(list)
    for n in graph.get("nodes", []):
        c = n.get("community")
        if c is None:
            continue
        by_comm[int(c)].append(n)

    summaries: dict[int, dict] = {}
    for cid, nodes in by_comm.items():
        # Pick top-N nodes by degree if degree available, else first-N.
        nodes_sorted = sorted(nodes, key=lambda x: -float(x.get("degree", 0)))
        labels = [n.get("label") or n.get("norm_label") or n.get("id") or "?"
                  for n in nodes_sorted[:MAX_NODES_PER_COMMUNITY]]
        files = sorted({n.get("source_file") for n in nodes if n.get("source_file")})
        summaries[cid] = {
            "node_count": len(nodes),
            "labels": labels,
            "files": files[:MAX_FILES_PER_COMMUNITY],
        }
    return summaries


def call_bedrock(client, payload: dict) -> str:
    user_text = (
        f"노드 라벨 ({payload['node_count']}개 중 일부): "
        f"{', '.join(payload['labels'])}\n"
        f"관련 파일: {', '.join(payload['files']) or '(없음)'}\n\n"
        f"{PROMPT}"
    )
    resp = client.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [{"text": user_text}]}],
        inferenceConfig={"maxTokens": 60, "temperature": 0.1},
    )
    out = resp.get("output", {}).get("message", {}).get("content", [])
    text = next((b.get("text", "") for b in out if "text" in b), "").strip()
    # Strip surrounding quotes / trailing punctuation if model added them.
    text = text.strip("\"'`.").splitlines()[0].strip() if text else ""
    return text or f"Community {payload.get('cid', '?')}"


def label_all(summaries: dict[int, dict]) -> dict[int, str]:
    client = boto3.client("bedrock-runtime", region_name=REGION)
    labels: dict[int, str] = {}

    def _one(cid: int) -> tuple[int, str]:
        payload = dict(summaries[cid], cid=cid)
        try:
            return cid, call_bedrock(client, payload)
        except Exception as e:
            LOG.warning("community %d failed: %s", cid, e)
            return cid, f"Community {cid}"

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for i, (cid, name) in enumerate(ex.map(_one, sorted(summaries))):
            labels[cid] = name
            if (i + 1) % 20 == 0:
                LOG.info("labeled %d/%d communities", i + 1, len(summaries))
    LOG.info("labeled %d communities total", len(labels))
    return labels


def patch_graph_json(labels: dict[int, str]) -> None:
    src = json.loads(GRAPH_JSON.read_text())
    src["community_labels"] = {str(k): v for k, v in sorted(labels.items())}
    PUBLIC_GRAPH_JSON.write_text(json.dumps(src, ensure_ascii=False, indent=None))
    LOG.info("patched %s", PUBLIC_GRAPH_JSON.relative_to(ROOT))


def patch_graph_html(labels: dict[int, str]) -> None:
    text = PUBLIC_GRAPH_HTML.read_text()
    # Each node has `"community_name": "Community N"` — replace using a lookup.
    pat = re.compile(r'"community_name": "Community (\d+)"')
    replaced = 0

    def _sub(m: re.Match[str]) -> str:
        nonlocal replaced
        cid = int(m.group(1))
        name = labels.get(cid)
        if not name:
            return m.group(0)
        replaced += 1
        # JSON-escape the replacement.
        return f'"community_name": {json.dumps(name, ensure_ascii=False)}'

    new = pat.sub(_sub, text)
    PUBLIC_GRAPH_HTML.write_text(new)
    LOG.info("patched %s — %d replacements", PUBLIC_GRAPH_HTML.relative_to(ROOT), replaced)


def patch_report_md(labels: dict[int, str]) -> None:
    text = PUBLIC_REPORT_MD.read_text()
    # Two patterns to fix:
    #   ### Community 0 - "Community 0"
    #   - [[_COMMUNITY_Community 0|Community 0]]
    pat_h = re.compile(r'^### Community (\d+) - "Community \1"', re.M)
    pat_li = re.compile(r'\[\[_COMMUNITY_Community (\d+)\|Community \1\]\]')

    def _h(m: re.Match[str]) -> str:
        cid = int(m.group(1))
        name = labels.get(cid, f"Community {cid}")
        return f'### Community {cid} - "{name}"'

    def _li(m: re.Match[str]) -> str:
        cid = int(m.group(1))
        name = labels.get(cid, f"Community {cid}")
        return f'[[_COMMUNITY_Community {cid}|{name}]]'

    new = pat_h.sub(_h, text)
    new = pat_li.sub(_li, new)
    PUBLIC_REPORT_MD.write_text(new)
    LOG.info("patched %s", PUBLIC_REPORT_MD.relative_to(ROOT))


def main() -> int:
    if not GRAPH_JSON.exists():
        LOG.error("missing %s — run `graphify update .` first", GRAPH_JSON)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    LOG.info("reading %s", GRAPH_JSON.relative_to(ROOT))
    graph = json.loads(GRAPH_JSON.read_text())
    summaries = gather_communities(graph)
    LOG.info("found %d communities", len(summaries))

    labels = label_all(summaries)

    # Persist a flat label map alongside the artefacts for inspection.
    (PUBLIC_DIR / "community_labels.json").write_text(
        json.dumps({str(k): v for k, v in sorted(labels.items())},
                    ensure_ascii=False, indent=2)
    )
    LOG.info("wrote %s", (PUBLIC_DIR / "community_labels.json").relative_to(ROOT))

    # Make sure the public copies of graph.html / GRAPH_REPORT.md exist; if not,
    # seed them from graphify-out.
    for src, dst in [
        (ROOT / "graphify-out" / "graph.html", PUBLIC_GRAPH_HTML),
        (ROOT / "graphify-out" / "GRAPH_REPORT.md", PUBLIC_REPORT_MD),
    ]:
        if not dst.exists() and src.exists():
            dst.write_bytes(src.read_bytes())

    patch_graph_json(labels)
    patch_graph_html(labels)
    patch_report_md(labels)

    LOG.info("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
