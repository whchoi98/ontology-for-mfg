# ADR-013 — Chat progress streaming: a note before each tool call, rendered as live steps

- **Status**: Accepted
- **Date**: 2026-10-26
- **Related**: ADR-009 (token streaming), ADR-012 (history replays the turn text)

## Context

After v0.7.0 users reported the chatbot "not responding": the UI showed a
tool name and then nothing until the whole answer appeared. Every layer was
measured before changing anything (2026-10-26):

| Layer | Result |
|---|---|
| Bedrock `converse_stream`, no tools (dev host and in-VPC) | text deltas spread evenly, ~150 chars/s for 13–16 s |
| API stack (`api.main` incl. `CognitoBearerAuth` + CORS, uvicorn, local) | 500 deltas arrive from 1.6 s to 18.3 s — no buffering |
| CloudFront | `Compress: false`, viewer-request Lambda@Edge only (ADR-007) |
| Real question with tools, in-VPC (one-off ECS task, real Neptune) | **first visible text at 17.1 s**; four tool rounds stream no text at all |

Two causes:

1. **Sonnet 5.5 says nothing between tool calls unless asked.** Its progress
   notes come back as thinking blocks, which are empty under the default
   `thinking.display: "omitted"`; with no instruction it wrote no `text`
   before any tool call. The Manny UI showed only `…` and a one-line
   `tool: a · b` footer.
2. **The final round after tool results is held server-side.** On every
   variant, `converse_stream()` returned ~8 s after the call and the first
   second delivered 1,400–1,750 chars; `metadata.latencyMs` (11 s for
   ~1,700 output tokens) shows the model was generating throughout. Without
   tool results in the context the same length streamed evenly. Changing
   `thinking` (adaptive / `between_tools`, display `omitted` / `summarized`
   / `updates` with beta `thinking-display-updates-2026-08-18`) did not
   change it.

In-VPC comparison, same buyer question:

| Variant | First visible text | Total |
|---|---|---|
| adaptive `low` (v0.7.0) | 17.1 s | 18.7 s |
| adaptive `low` + note prompt | **2.1 s** (notes at 2.1 / 6.1 / 9.8 s) | 21.7 s |
| `between_tools` + note prompt | 2.8 s | 26.6 s (5 rounds) |
| `between_tools`, no prompt | 1.7 s | 28.3 s (5 rounds) |
| display `summarized` + note prompt | 3.3 s — reasoning summaries arrive in English | 20.6 s |

## Decision

1. **Ask for the note.** The chat system prompt says: before each tool call,
   one short Korean sentence on what is being looked up; after the last tool
   result, a full answer that stands on its own. One sentence keeps the note
   a `text` block (longer notes would move into omitted thinking blocks), so
   it streams through the existing `delta` event — no new SSE event, no beta
   field, `thinking` stays adaptive at `low` effort.
2. **Render the turn as steps.** `web/lib/agent-steps.ts` folds the stream
   into ordered steps — text, tool (running → done / error with a row-count
   hint), text … — and `components/AgentSteps.tsx` renders them on `/chat`
   and Manny: text before a tool is a muted progress note, the text after the
   last tool is the answer, a tool card shows a spinner while it runs and the
   Cypher on click, and a "결과를 정리하고 있습니다…" line covers the wait
   for the held final round. A `stop` closes any still-running card as
   "중단됨".
3. **History and export keep all text.** The message text is every text step
   joined by blank lines; notes are short, and the prompt makes the answer
   self-contained, so ADR-012 replay is unaffected.

## Consequences

- The user sees what the agent is doing within ~2 s and at every tool step
  instead of ~17 s of silence; the turn is ~3 s longer because the model
  writes the notes.
- The ~8 s hold before the final answer remains — it is outside the request
  shape we control. A comparison with `InvokeModelWithResponseStream` (raw
  Messages API on Bedrock) is the next experiment if it needs to go.
- The output guardrail and follow-up generator see the notes as part of the
  answer text, as they already did for any text the model wrote.
- If a future prompt or model change moves notes back into thinking blocks,
  the fix is `display: "updates"` (beta) plus forwarding non-empty reasoning
  text as its own event; the in-VPC probe above is the way to check.
