# ADR-012 — Chat conversation context: client-held history, replayed as text, guardrail-screened

- **Status**: Accepted
- **Date**: 2026-10-26
- **Related**: ADR-009 (token streaming), ADR-011 (guardrail policy — the
  invariant this ADR must keep)

## Context

Through v0.6.0 `/api/chat` answered every question in isolation:
`AgentRunner.run_stream` built `messages = [current question]`. The UI looks
like a conversation, and the follow-up chips (`suggested_followups`)
invite questions such as "그 부품의 대체품은?" or "두 번째 협력사는?",
which the agent could not resolve.

Constraints:

- The API runs as **two ECS tasks behind the ALB without stickiness**, so
  an in-process session store loses the conversation whenever the next
  request lands on the other task.
- A shared store (DynamoDB / ElastiCache) means a new resource plus a new
  IAM grant for the API role, which the project only adds with an explicit
  review. The existing `memory_save` tool writes to a DynamoDB table
  (`ontology-mfg-dev-memory`) that does not exist, and the API role has no
  DynamoDB permission — so that tool fails today.
- Claude Sonnet 5.5 binds a thinking block to the exact prefix that produced
  it. Replaying an earlier turn's reasoning after the system prompt changed
  (e.g. a persona switch) is rejected (400 `bound to a different
  conversation`).
- ADR-011 promises that **a question the input guardrail blocks never
  reaches the model.**

## Decision

1. **The client holds the conversation.** `ChatRequest.history` carries the
   earlier turns (`{role: user|assistant, content}`, oldest first), as the
   Messages API does. The web keeps only answers whose stream stopped with
   `end_turn` (`web/lib/chat-history.ts`) — blocked, failed, cancelled or
   truncated turns never become context — and sends at most 6 pairs.
2. **The server re-normalises.** `agent.history_messages` keeps complete
   user→assistant pairs only (Converse needs strict alternation starting
   with `user`), clips each side (4,000 / 6,000 chars) and keeps the newest
   6 pairs within 24,000 chars. The request model caps the list at 50 items
   and each item at 100,000 chars purely to reject abuse.
3. **Text only.** Earlier turns are replayed as their final answer text —
   no reasoning blocks and no tool calls. Inside the current turn's tool loop
   reasoning is still replayed unchanged (ADR-009 / v0.6.0).
4. **The system prompt says why the facts are there.** Without tool results
   in context, Sonnet 5.5 read its own earlier answer as ungrounded and
   disowned it ("앞서 드린 답변은 근거 없이 만든 내용이라…"); with one
   sentence stating that earlier answers came from tool results that are not
   repeated, it resolved "두 번째 협력사" from them (verified live,
   2026-10-26).
5. **The replayed questions are guardrail-checked.** The history is
   client-supplied, so a forged turn could otherwise carry a blocked question
   into the model's context. `_screen_history` runs one `ApplyGuardrail`
   (INPUT) over the replayed questions, concurrently with the current
   question's check. A genuine history already passed those checks; if it
   fails now, the history is dropped with a `log` event and the current
   question — whose own verdict stays separate, keeping the ADR-011
   calibration — is answered without context. Replayed *answers* are not
   re-checked; the output guardrail screens every new answer.

## Consequences

- Multi-turn questions work on both `/chat` and `/manny` with no new AWS
  resources, IAM or per-task state. A persona switch or "새 대화" starts a
  clean context.
- Request size grows with the conversation, bounded at ~24K chars of
  history (≈ 8–10K tokens) per turn. No prompt caching is used yet.
- Detail that lived only in tool results (rows not quoted in an answer) is
  gone next turn; the agent re-queries for it.
- A client can still forge *assistant* turns. This lets a user shape the
  model's context, which they can do by typing anyway; it cannot bypass the
  input check on questions or the output check on answers.
- Moving to a server-side transcript (full tool results, reasoning replayed
  append-only) remains possible later behind the same request shape; it
  needs a shared store and an IAM change.
