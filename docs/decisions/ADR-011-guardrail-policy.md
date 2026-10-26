# ADR-011 — Guardrail policy: real input/output checks, STANDARD tier, block vs detect-only topics

- **Status**: Accepted
- **Date**: 2026-10-24
- **Related**: ADR-002 (deterministic Cypher guard — guardrails are the
  probabilistic layer), ADR-009 (token streaming the output check must not
  break)

## Context

Through v0.5.6 the chat agent emitted
`guardrail · input_check · passed` on every turn, but nothing was checked —
the event was hard-coded in `AgentRunner.run_stream`. The Bedrock
guardrail resource (`356xcbgyqcpq`, `infra-cdk/lib/ai-stack.ts`) existed
with 4 DENY topics, all in BLOCK mode, CLASSIC tier, MISCONDUCT filter at
HIGH on input.

Turning that configuration on as-is was not an option:

- **CLASSIC tier only understands English / French / Spanish.** On Korean
  prompts it blocked 5 of the 31 demo sample questions and passed one of
  its own topic examples.
- **Topic definitions named regulations and chemicals**
  ("…violates a known REACH-SVHC, RoHS, IRA, USMCA, or CBAM rule",
  "…CMR 1A/1B substances"). Checking REACH / RoHS / CBAM status is the
  product's core use case (scenarios E / H / K), so in BLOCK mode
  RegulationViolation + HazardousChemical stopped 7 of 12 ordinary
  compliance questions — including "납 함유 솔더 대체 가능한 무연 솔더 추천".
  MISCONDUCT on input at MEDIUM / HIGH did the same to "위반 위험 부품" queries.
- **Converse `guardrailConfig` screens tool results too.** A Neptune row
  listing the SVHC substances of a component would trip HazardousChemical
  on a perfectly ordinary question.
- Output screening must not undo token-level streaming (ADR-009).

## Decision

Enforce the guardrail with direct `ApplyGuardrail` calls from the agent,
on the Korean-capable STANDARD tier, and block only the topics whose false
positives we measured to be near zero.

1. **Where it runs** (`api/services/agent.py`, `api/services/guardrails.py`)
   - **Input** — `check(user_msg, "INPUT")` on the user's question only,
     before the first model call. Blocked → the guardrail's message as a
     `delta`, `stop: guardrail_intervened`; Bedrock is never invoked.
   - **Output** — `check(answer, "OUTPUT")` on the full answer *after* it
     has streamed. Blocked → appended warning `delta`,
     `stop: guardrail_intervened`.
   - **Detect-mode hits** → `guardrail · passed · 탐지(모니터링): <topics>`
     plus a `guardrail detected (monitor)` log line that `/ops/guardrail`
     picks up.
   - **ApplyGuardrail failure** → fail open with a `log` event
     ("가드레일 검사 실패 — 미적용"); never a fake "passed".
2. **Tier** — STANDARD for topics and content filters, through the
   `apac.guardrail.v1:0` cross-Region guardrail profile.
3. **Topic modes** (`GUARDRAIL_TOPICS[].mode`)

   | Topic | Mode | Rationale |
   |-------|------|-----------|
   | IPConfidential | block | Redefined as *leaking* BOM / contract terms outside the company — comparing unit prices (scenario G) is allowed |
   | CompetitorDisparagement | block | No legitimate demo question needs it |
   | RegulationViolation | detect (action NONE) | Redefined around *circumventing* rules (fake certificates, misdeclared origin / emissions); still too close to ordinary compliance questions to block |
   | HazardousChemical | detect (action NONE) | Redefined around *using / dosing* CMR substances; same reason |

   Content filters: MISCONDUCT input **LOW** / output **HIGH**; others HIGH
   (PROMPT_ATTACK input only). Falsification requests ("성적서 꾸미기") are
   declined by the model itself and the answer is screened by MISCONDUCT
   HIGH.
4. **Acceptance gate** — `scripts/guardrail_probe.py` must report **0
   blocked benign prompts** (all demo samples from `/chat` + `/manny` and 12
   ordinary compliance questions). Measured 2026-10-24: **0 / 43**.

## Alternatives Considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Converse `guardrailConfig` (inline) | One call, native | Re-screens tool results (SVHC rows trip HazardousChemical); interacts with streaming | False positives on core scenarios |
| Keep CLASSIC tier | No cross-Region profile | Wrong verdicts on Korean (5/31 demo samples blocked) | Unfit for a Korean UI |
| All four topics in BLOCK | Strictest | 7/12 ordinary compliance questions blocked | Breaks scenarios E / H / K |
| Output check per token / chunk | Blocks before text is shown | Kills token streaming (ADR-009), many billable calls | UX + cost |
| Leave the guardrail unwired | Zero latency | The UI claimed checks that never ran | Misleading |

## Consequences

- **Positive**:
  - The guardrail chip in the UI now reflects a real verdict
  - Korean prompts are judged correctly; the probe makes the false-positive
    rate a measured number instead of a guess
  - Detect-only topics still produce signal (`/ops/guardrail`) for tuning
- **Negative / trade-offs**:
  - Output is screened after streaming: a blocked answer has already been
    shown token by token; the block is signalled by the appended warning
    and the stop reason, not by retracting text
  - Two extra `ApplyGuardrail` calls per turn (one before the first token,
    one after the last); billed per 1k-character text unit, input capped at
    20,000 characters
  - Fail-open favours availability: during a guardrail outage turns run
    unscreened (visible as a `log` event)
  - RegulationViolation / HazardousChemical rely on the model's own
    refusals plus MISCONDUCT output HIGH rather than a hard block
  - The cross-Region profile processes guardrail requests across APAC
    Regions
- **Follow-ups**:
  - Re-run the probe after every topic / filter change and whenever demo
    sample prompts change; CI can't run it (no AWS credentials)
  - Promote a detect-only topic to BLOCK only with a probe run showing
    0 benign blocks
  - Consider pinning a published guardrail version
    (`BEDROCK_GUARDRAIL_VERSION`, currently `DRAFT`) so console edits can't
    change production behaviour silently

## References

- Code: `api/services/guardrails.py` (`check`, `GuardrailVerdict`),
  `api/services/agent.py` (`_run_guardrail`, `AgentRunner._finish`),
  `infra-cdk/lib/ai-stack.ts` (`GUARDRAIL_TOPICS`, tier / profile config),
  `scripts/guardrail_probe.py`
- Tests: `infra-cdk/test/ai-stack.test.ts` (tier, topic modes, MISCONDUCT
  strengths), `tests/api/services/test_agent_service.py` (input block never
  calls the model, output block, outage fails open),
  `tests/api/services/test_bedrock_services.py` (`check()` verdicts)
- CHANGELOG: `0.6.0 — 2026-10-24 § Guardrails`
