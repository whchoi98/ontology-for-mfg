// web/lib/agent-steps.ts
//
// One /api/chat assistant turn as the ordered steps it streamed: the text the
// model writes and the tools it runs, interleaved. The chat system prompt asks
// Sonnet 5.5 for one short sentence before each tool call, so a text step that
// is followed by a tool step is a progress note and the trailing text is the
// answer. /chat and Manny render the steps live instead of a bare "…".

export type ToolStatus = "running" | "done" | "error";

export type ToolStep = {
  kind: "tool";
  name: string;
  args: unknown;
  status: ToolStatus;
  /** Short result hint once the tool returns ("12행", "오류: …"). */
  summary?: string;
};

export type TextStep = { kind: "text"; text: string };

export type AgentStep = TextStep | ToolStep;

type StreamEvent = { type: string; [k: string]: unknown };

/** One-line hint for a tool result — shapes from api/routers/chat.py tools. */
export function summarizeToolResult(result: unknown): { status: ToolStatus; summary: string } {
  if (result === null || typeof result !== "object") return { status: "done", summary: "완료" };
  const r = result as Record<string, unknown>;
  if (r.error) return { status: "error", summary: `오류: ${String(r.error).slice(0, 80)}` };
  if (r.truncated && typeof r.row_count !== "number") return { status: "done", summary: "결과 일부(크기 제한)" };
  if (typeof r.row_count === "number") return { status: "done", summary: `${r.row_count}행${r.truncated ? "+" : ""}` };
  for (const key of ["results", "hits"]) {
    if (Array.isArray(r[key])) return { status: "done", summary: `${(r[key] as unknown[]).length}건` };
  }
  if (typeof r.status === "string") return { status: "done", summary: r.status };
  return { status: "done", summary: "완료" };
}

/** Fold one SSE event into the step list (pure — returns a new array when it changes). */
export function applyStepEvent(steps: AgentStep[], ev: StreamEvent): AgentStep[] {
  if (ev.type === "delta" || ev.type === "token") {
    const chunk = String(ev.text ?? ev.content ?? "");
    if (!chunk) return steps;
    const last = steps[steps.length - 1];
    if (last?.kind === "text") return [...steps.slice(0, -1), { ...last, text: last.text + chunk }];
    return [...steps, { kind: "text", text: chunk }];
  }
  if (ev.type === "tool_call") {
    const name = String(ev.name ?? "");
    if (!name) return steps;
    return [...steps, { kind: "tool", name, args: ev.args ?? {}, status: "running" }];
  }
  if (ev.type === "tool_result") {
    const name = String(ev.name ?? "");
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (s.kind === "tool" && s.status === "running" && s.name === name) {
        const next = steps.slice();
        next[i] = { ...s, ...summarizeToolResult(ev.result) };
        return next;
      }
    }
  }
  if (ev.type === "stop" && steps.some((s) => s.kind === "tool" && s.status === "running")) {
    // Stream ended mid-tool (drop / cancel) — don't leave a spinner behind.
    return steps.map((s) =>
      s.kind === "tool" && s.status === "running" ? { ...s, status: "error", summary: "중단됨" } : s,
    );
  }
  return steps;
}

/** Every text step, paragraph-separated — the message text kept for history / export. */
export function answerText(steps: AgentStep[]): string {
  return steps
    .filter((s): s is TextStep => s.kind === "text")
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Index of the first text step after the last tool step — where the answer starts. */
export function answerStart(steps: AgentStep[]): number {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].kind === "tool") return i + 1;
  return 0;
}
