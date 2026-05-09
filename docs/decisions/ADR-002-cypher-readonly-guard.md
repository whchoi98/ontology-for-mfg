# ADR-002 — Read-only Cypher gateway via deterministic deny-list

- **Status**: Accepted
- **Date**: 2026-05-09
- **Related commit**: `49a7a9c`
- **Triggered by**: Kiro review-gate (Stop hook) flagging Cypher injection

## Context

The chat agent (`api/routers/chat.py:_tool_neptune`) exposes
`neptune_query(cypher, params)` as a tool to the Bedrock LLM. The LLM is
instructed to emit read-only Cypher in the system prompt, but
prompt-injection in user input can subvert that — e.g. a malicious user
message could instruct the model to emit `MATCH (n) DETACH DELETE n`
against the live demo graph.

Bedrock Guardrails (4 mfg topics) and the system prompt are
**probabilistic** defenses; they reduce risk but don't eliminate it.
Kiro's review-gate flagged this as **high severity** because no
deterministic guard existed.

## Decision

Add a **deterministic read-only Cypher gateway** at
`api/routers/chat.py:_tool_neptune` that runs a regex deny-list on the
LLM-emitted query before forwarding to `Neptune.run_cypher()`.

```python
_CYPHER_WRITE_PATTERN = re.compile(
    r"\b(CREATE|DELETE|DETACH\s+DELETE|SET|REMOVE|MERGE|DROP|FOREACH|"
    r"LOAD\s+CSV|USING\s+PERIODIC\s+COMMIT|"
    r"CALL\s+db\.|CALL\s+dbms\.|CALL\s+apoc\.(?!coll|convert|map|meta|text|util))\b",
    re.IGNORECASE,
)
```

On match, the tool returns a structured error
(`{"error": "read-only mode...", "blocked_clause": ...}`) so the agent
can course-correct without touching the graph. System prompt also
strengthened to say "READ-ONLY ONLY".

## Alternatives Considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Stronger system prompt only | Simple | Probabilistic — model can still emit bad Cypher | Insufficient |
| Bedrock Guardrails topic for Cypher | Native | Topic config is brittle, doesn't compose with deny-list confidence | Not deterministic |
| Cypher AST parser + write-clause check | Bulletproof | Adds runtime dependency, parse cost | Overkill for PoC |
| Read-only Neptune database role | Belt-and-braces best | Requires task-role refactor + IaC change | Worth doing as belt; deny-list ships first |

## Consequences

- **Positive**:
  - 8 destructive samples blocked by tests (DETACH DELETE, CREATE,
    MERGE …on create set, LOAD CSV, SET, REMOVE, CALL db.constraints,
    DELETE)
  - 3 read-only samples pass (MATCH, OPTIONAL MATCH, UNWIND)
  - Independent of Bedrock model rotation / prompt tweaks
- **Trade-offs**:
  - Regex won't catch obfuscated / case-mixed-with-comments attacks
    (e.g. `/* */ DEL/* */ETE`) — `\b` boundaries help but aren't perfect
  - Forbidden APOC procedures whitelisted (read-only set:
    coll/convert/map/meta/text/util)
- **Follow-ups**:
  - Add Neptune IAM read-only role for the API task (defense-in-depth at
    AWS layer)
  - Consider GitHub Action that runs the deny-list against a corpus of
    LLM samples on every PR to detect regressions

## References

- Code: `api/routers/chat.py:32-50` (`_tool_neptune`),
  `api/routers/chat.py:33-48` (`_CYPHER_WRITE_PATTERN`)
- Stop hook: `[node "${CLAUDE_PLUGIN_ROOT}/scripts/stop-review-gate-hook.mjs"]`
- CHANGELOG: `0.3.0 — 2026-05-09 § Fixes — fix(security)`
