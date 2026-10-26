"""Graph contract: every label / relationship type / property the API's Cypher
reads must be produced by the loader (`data/load_graph.py`) as declared in
`ontology/registry.py`.

The API is the consumer contract. This test statically extracts the Cypher
from `api/**/*.py` (no imports of the routers, no AWS):

* every `run_cypher(...)` first argument, with string concatenation,
  conditional expressions and f-string placeholders expanded into variants
  (placeholders bound to local string constants are resolved, e.g.
  `label = "Supplier" if ... else "SubSupplier"`)
* every other string literal that looks like Cypher (`MATCH (`)

and checks it against a graph built from the synthetic generator output.
If a router starts querying `[:NEW_REL]` or `x.new_prop` that the loader
doesn't write, this fails instead of the scenario silently falling back to
synthetic data in production.
"""

from __future__ import annotations

import ast
import itertools
import re
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from data.load_graph import build_graph
from data.synthetic.pipeline import generate_dataset
from ontology import registry as reg

ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / "api"
PLACEHOLDER = "\x00"
MAX_VARIANTS = 64


# ─────────────────────────── string-expression expansion ────────────────────


class _Scope:
    """Name -> assigned expression nodes, for one function (or module)."""

    def __init__(self, parent: _Scope | None = None):
        self.parent = parent
        self.names: dict[str, list[ast.AST]] = {}

    def lookup(self, name: str) -> list[ast.AST]:
        s: _Scope | None = self
        while s is not None:
            if name in s.names:
                return s.names[name]
            s = s.parent
        return []


def _variants(node: ast.AST, scope: _Scope, depth: int = 0) -> list[str]:
    """All string values an expression can take (unknown parts → PLACEHOLDER)."""
    if depth > 8:
        return [PLACEHOLDER]
    if isinstance(node, ast.Constant):
        return [node.value] if isinstance(node.value, str) else [PLACEHOLDER]
    if isinstance(node, ast.JoinedStr):
        parts: list[list[str]] = []
        for v in node.values:
            if isinstance(v, ast.Constant):
                parts.append([str(v.value)])
            elif isinstance(v, ast.FormattedValue):
                parts.append(_variants(v.value, scope, depth + 1))
            else:
                parts.append([PLACEHOLDER])
        return _product(parts)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return _product(
            [_variants(node.left, scope, depth + 1), _variants(node.right, scope, depth + 1)]
        )
    if isinstance(node, ast.IfExp):
        return (_variants(node.body, scope, depth + 1) + _variants(node.orelse, scope, depth + 1))[
            :MAX_VARIANTS
        ]
    if isinstance(node, ast.Name):
        assigned = scope.lookup(node.id)
        out: list[str] = []
        for a in assigned:
            out.extend(_variants(a, scope, depth + 1))
        return out[:MAX_VARIANTS] or [PLACEHOLDER]
    return [PLACEHOLDER]


def _product(parts: list[list[str]]) -> list[str]:
    out = ["".join(p) for p in itertools.islice(itertools.product(*parts), MAX_VARIANTS)]
    return out or [""]


@dataclass
class _Query:
    file: str
    line: int
    text: str


class _Collector(ast.NodeVisitor):
    def __init__(self, file: str):
        self.file = file
        self.scope = _Scope()
        self.queries: list[_Query] = []
        self._in_call_arg: set[int] = set()

    def _with_scope(self, node: ast.AST) -> None:
        self.scope = _Scope(self.scope)
        # pre-collect assignments so uses before the textual assignment resolve too
        for n in ast.walk(node):
            if isinstance(n, ast.Assign):
                for t in n.targets:
                    if isinstance(t, ast.Name):
                        self.scope.names.setdefault(t.id, []).append(n.value)
        self.generic_visit(node)
        self.scope = self.scope.parent  # type: ignore[assignment]

    visit_FunctionDef = _with_scope
    visit_AsyncFunctionDef = _with_scope

    def visit_Module(self, node: ast.Module) -> None:
        for n in node.body:
            if isinstance(n, ast.Assign):
                for t in n.targets:
                    if isinstance(t, ast.Name):
                        self.scope.names.setdefault(t.id, []).append(n.value)
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        fn = node.func
        name = fn.attr if isinstance(fn, ast.Attribute) else getattr(fn, "id", "")
        if name == "run_cypher":
            arg = (
                node.args[0]
                if node.args
                else next((k.value for k in node.keywords if k.arg in ("query", "cypher")), None)
            )
            if arg is not None:
                for text in _variants(arg, self.scope):
                    self.queries.append(_Query(self.file, node.lineno, text))
                for n in ast.walk(arg):
                    self._in_call_arg.add(id(n))
        self.generic_visit(node)

    def _literal(self, node: ast.AST) -> None:
        if id(node) in self._in_call_arg:
            return
        for text in _variants(node, self.scope):
            if re.search(r"\bMATCH\s*\(", text):
                self.queries.append(_Query(self.file, getattr(node, "lineno", 0), text))

    def visit_JoinedStr(self, node: ast.JoinedStr) -> None:
        self._literal(node)  # don't descend: parts are covered by the expansion

    def visit_Constant(self, node: ast.Constant) -> None:
        if isinstance(node.value, str):
            self._literal(node)


def collect_api_cypher() -> list[_Query]:
    out: list[_Query] = []
    for path in sorted(API_DIR.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        c = _Collector(str(path.relative_to(ROOT)))
        c.visit(tree)
        out.extend(c.queries)
    return out


# ───────────────────────────────── Cypher parsing ───────────────────────────

_IDENT = r"[A-Za-z_]\w*"
_MAP = r"\{[^{}]*\}"


def _node(p: str) -> str:
    """`(var:Label:Other {k: v})` with named groups <p>v / <p>l / <p>m."""
    return (
        r"\(\s*(?P<" + p + r"v>" + _IDENT + r")?\s*"
        r"(?P<" + p + r"l>(?::\s*`?" + _IDENT + r"`?\s*)*)"
        r"(?P<" + p + r"m>" + _MAP + r")?\s*\)"
    )


_REL = (
    r"(?P<lt><)?-\[\s*(?P<rv>" + _IDENT + r")?\s*"
    r"(?::\s*(?P<rt>`?" + _IDENT + r"`?(?:\s*\|\s*:?`?" + _IDENT + r"`?)*))?"
    r"(?P<rm>" + _MAP + r")?[^\]]*\]-(?P<gt>>)?"
)
NODE_RE = re.compile(_node("a"))
REL_RE = re.compile(_REL)
TRIPLE_RE = re.compile(r"(?=" + _node("a") + r"\s*" + _REL + r"\s*" + _node("b") + r")")
MAP_KEY_RE = re.compile(r"(" + _IDENT + r")\s*:")


def _labels(group: str | None) -> list[str]:
    return re.findall(_IDENT, (group or "").replace("`", ""))


@dataclass
class ParsedQuery:
    q: _Query
    labels: set[str] = field(default_factory=set)
    rels: set[str] = field(default_factory=set)
    var_label: dict[str, set[str]] = field(default_factory=dict)
    var_rel: dict[str, set[str]] = field(default_factory=dict)
    triples: set[tuple[str, str, str]] = field(default_factory=set)
    node_props: set[tuple[str, str]] = field(default_factory=set)  # (label, prop)
    rel_props: set[tuple[str, str]] = field(default_factory=set)  # (rel, prop)


def parse_cypher(q: _Query) -> ParsedQuery:
    text = q.text
    pq = ParsedQuery(q)
    for m in NODE_RE.finditer(text):
        lbls = _labels(m.group("al"))
        pq.labels.update(lbls)
        if m.group("av") and lbls:
            pq.var_label.setdefault(m.group("av"), set()).update(lbls)
        for key in MAP_KEY_RE.findall(m.group("am") or ""):
            for lbl in lbls:
                pq.node_props.add((lbl, key))
    for m in REL_RE.finditer(text):
        types = _labels(m.group("rt"))
        pq.rels.update(types)
        if m.group("rv") and types:
            pq.var_rel.setdefault(m.group("rv"), set()).update(types)
        for key in MAP_KEY_RE.findall(m.group("rm") or ""):
            for t in types:
                pq.rel_props.add((t, key))
    for m in TRIPLE_RE.finditer(text):
        a_lbls = _labels(m.group("al")) or sorted(pq.var_label.get(m.group("av") or "", ()))
        b_lbls = _labels(m.group("bl")) or sorted(pq.var_label.get(m.group("bv") or "", ()))
        types = _labels(m.group("rt"))
        if not (a_lbls and b_lbls and types) or bool(m.group("lt")) == bool(m.group("gt")):
            continue  # unlabeled end, untyped or undirected: nothing to check
        if m.group("lt"):
            a_lbls, b_lbls = b_lbls, a_lbls
        for a, t, b in itertools.product(a_lbls, types, b_lbls):
            pq.triples.add((a, t, b))
    for m in re.finditer(rf"(?<![\w$.])({_IDENT})\.({_IDENT})\b", text):
        var, prop = m.groups()
        for lbl in pq.var_label.get(var, ()):
            pq.node_props.add((lbl, prop))
        for rel in pq.var_rel.get(var, ()):
            pq.rel_props.add((rel, prop))
    return pq


# ─────────────────────────────────── fixtures ───────────────────────────────


@pytest.fixture(scope="module")
def parsed() -> list[ParsedQuery]:
    queries = collect_api_cypher()
    assert queries, "no Cypher found under api/ — extractor broken?"
    return [parse_cypher(q) for q in queries]


@pytest.fixture(scope="module")
def graph(tmp_path_factory):
    out = tmp_path_factory.mktemp("synthetic")
    generate_dataset(out)
    return build_graph(out)


def _where(pq: ParsedQuery) -> str:
    return f"{pq.q.file}:{pq.q.line}"


# ──────────────────────────────────── tests ─────────────────────────────────


def test_extractor_sees_the_known_consumer_queries(parsed):
    """Guard the extractor itself: these patterns are known to exist in api/."""
    rels = set().union(*(p.rels for p in parsed))
    labels = set().union(*(p.labels for p in parsed))
    assert {"SUPPLIED_BY", "EMITS", "FROM", "SUBJECT_TO"} <= rels, rels
    assert {
        "Component",
        "Supplier",
        "Plant",
        "CarbonScope",
        "TradeLane",
        "Telemetry",
        "Regulation",
        "QualityIncident",
    } <= labels, labels
    # f-string label resolved through a local assignment (supplier_rfm)
    assert "SubSupplier" in labels


def test_registry_is_valid():
    assert reg.validate() == []


def test_cypher_labels_are_registered_and_loaded(parsed, graph):
    counts = graph.node_counts()
    bad = sorted({(lbl, _where(p)) for p in parsed for lbl in p.labels if counts.get(lbl, 0) == 0})
    assert not bad, f"API queries labels the loader produces no nodes for: {bad}"


def test_cypher_relationship_types_are_registered_and_loaded(parsed, graph):
    counts = graph.edge_counts()
    bad = sorted({(rel, _where(p)) for p in parsed for rel in p.rels if counts.get(rel, 0) == 0})
    assert not bad, f"API queries relationship types the loader produces no edges for: {bad}"


def test_cypher_patterns_match_registry_direction(parsed, graph):
    loaded = {(s, r, d) for (r, s, d), rows in graph.edges.items() if rows}
    bad = sorted({(t, _where(p)) for p in parsed for t in p.triples if t not in loaded})
    assert not bad, f"(src)-[:REL]->(dst) patterns not produced by the loader: {bad}"


def test_cypher_node_properties_are_produced(parsed, graph):
    produced: dict[str, set[str]] = {
        lbl: set().union(*(r.keys() for r in rows)) if rows else set()
        for lbl, rows in graph.nodes.items()
    }
    bad = sorted(
        {
            (lbl, prop, _where(p))
            for p in parsed
            for lbl, prop in p.node_props
            if prop not in produced.get(lbl, set())
        }
    )
    assert not bad, f"API reads node properties the loader never writes: {bad}"


def test_cypher_node_properties_are_neptune_scalars(parsed, graph):
    """Neptune openCypher can't store lists — anything the API reads must be scalar."""
    read = {(lbl, prop) for p in parsed for lbl, prop in p.node_props}
    bad = sorted(
        {
            (lbl, k, type(v).__name__)
            for lbl, rows in graph.nodes.items()
            for r in rows
            for k, v in r.items()
            if (lbl, k) in read and not isinstance(v, str | int | float | bool)
        }
    )
    assert not bad, bad


def test_cypher_relationship_properties_are_produced(parsed, graph):
    produced: dict[str, set[str]] = {}
    for (rel, _s, _d), rows in graph.edges.items():
        produced.setdefault(rel, set()).update(*(r["props"].keys() for r in rows))
    bad = sorted(
        {
            (rel, prop, _where(p))
            for p in parsed
            for rel, prop in p.rel_props
            if prop not in produced.get(rel, set())
        }
    )
    assert not bad, f"API reads relationship properties the loader never writes: {bad}"


def test_every_node_has_an_app_id(graph):
    """objects.py / neptune.subgraph_for match on `n.id` for every label."""
    missing = [lbl for lbl, rows in graph.nodes.items() if any(not r.get("id") for r in rows)]
    assert not missing, missing


def test_objects_allowlist_equals_registry_labels():
    """`api/routers/objects.py::_ALLOWED_LABELS` (22-class explorer) ≡ registry NODES."""
    tree = ast.parse((API_DIR / "routers" / "objects.py").read_text(encoding="utf-8"))
    allowed: set[str] | None = None
    for n in ast.walk(tree):
        targets = []
        if isinstance(n, ast.Assign):
            targets, value = n.targets, n.value
        elif isinstance(n, ast.AnnAssign) and n.value is not None:
            targets, value = [n.target], n.value
        if any(isinstance(t, ast.Name) and t.id == "_ALLOWED_LABELS" for t in targets):
            allowed = {
                c.value
                for c in ast.walk(value)
                if isinstance(c, ast.Constant) and isinstance(c.value, str)
            }
    assert allowed is not None, "_ALLOWED_LABELS not found in api/routers/objects.py"
    assert allowed == set(reg.labels())


def test_every_registry_label_and_relationship_has_data(graph):
    """No dead declarations: every class and every relationship type is materialised."""
    empty_labels = [lbl for lbl, c in graph.node_counts().items() if c == 0]
    empty_rels = [r for r in reg.rel_types() if graph.edge_counts().get(r, 0) == 0]
    assert not empty_labels and not empty_rels, (empty_labels, empty_rels)
    assert graph.dangling == []


def test_declared_edge_properties_match_loader_output(graph):
    """reg.edge_props() feeds the chat schema hint; it must equal what the loader writes
    (the agent once concluded SUPPLIED_BY had no price because the hint didn't list it)."""
    for (rel, *_), rows in graph.edges.items():
        written = set().union(*(set(r["props"]) for r in rows)) if rows else set()
        assert set(reg.edge_props(rel)) == written, rel
