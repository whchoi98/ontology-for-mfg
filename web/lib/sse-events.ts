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
