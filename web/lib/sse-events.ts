// web/lib/sse-events.ts
//
// Hand-mirrored from api/schemas/sse.py — the 9-event SSE vocabulary
// shared by /chat, /eight-d, /insights and the AgentRunner tool-use
// loop. When the Python source moves, update this file too — they're
// the same contract.
//
// All events carry a discriminator `type` and may carry extra fields
// the rubric doesn't enumerate (forward-compat). Use `SseEvent` as
// the discriminated union when narrowing in event handlers.

export interface PhaseEvent {
  type: "phase";
  phase: string;
  label?: string;
  /** Set on the bedrock phase event so the UI chip shows the runtime model. */
  model_id?: string;
  model_label?: string;
  [k: string]: unknown;
}

export interface PhaseDoneEvent {
  type: "phase_done";
  phase: string;
  duration_s?: number;
  detail?: string;
  [k: string]: unknown;
}

export interface DeltaEvent {
  type: "delta";
  text: string;
  [k: string]: unknown;
}

export interface ToolCallEvent {
  type: "tool_call";
  name: string;
  args: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ToolResultEvent {
  type: "tool_result";
  name: string;
  result: unknown;
  [k: string]: unknown;
}

export interface GuardrailEvent {
  type: "guardrail";
  name: string;
  result: string;
  content?: string;
  [k: string]: unknown;
}

export interface LogEvent {
  type: "log";
  level?: string;
  message: string;
  [k: string]: unknown;
}

export interface ErrorEvent {
  type: "error";
  name?: string;
  result?: Record<string, unknown>;
  content?: string;
  [k: string]: unknown;
}

export interface ResultEvent {
  type: "result";
  markdown?: string;
  sections?: Array<Record<string, unknown>>;
  incident?: Record<string, unknown>;
  similar_count?: number;
  fallback?: boolean;
  synthetic?: boolean;
  total_s?: number;
  [k: string]: unknown;
}

export interface StopEvent {
  type: "stop";
  reason?: string;
  [k: string]: unknown;
}

export type SseEvent =
  | PhaseEvent
  | PhaseDoneEvent
  | DeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | GuardrailEvent
  | LogEvent
  | ErrorEvent
  | ResultEvent
  | StopEvent;

/** Type-narrowing helper for SSE consumers. */
export function isEvent<T extends SseEvent["type"]>(
  ev: { type: string; [k: string]: unknown },
  t: T,
): ev is Extract<SseEvent, { type: T }> {
  return ev.type === t;
}

/** Human-readable text for an `error` event. Backend-emitted errors carry
 *  `content` (and sometimes `result.message`); client-synthesized ones from
 *  `sseStream` (non-2xx) carry `message`. */
export function sseErrorText(ev: { type: string; [k: string]: unknown }): string {
  const result = (ev.result ?? null) as Record<string, unknown> | null;
  const raw = ev.content ?? ev.message ?? (result ? result.message : undefined);
  const text = raw == null ? "" : String(raw).trim();
  return text || "알 수 없는 오류가 발생했습니다.";
}

/** Notice for a `stop` that ended the stream abnormally WITHOUT a preceding
 *  `error` event (network drop). `aborted` is user-initiated → no notice;
 *  `error:<status>` / `stream_error` are always preceded by an `error`. */
export function stopReasonNotice(reason: unknown): string | null {
  const r = String(reason ?? "");
  if (r.startsWith("fetch_error")) {
    return "네트워크 오류로 응답이 중단되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  return null;
}
