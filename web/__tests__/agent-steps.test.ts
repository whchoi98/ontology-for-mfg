import { describe, expect, it } from "vitest";
import {
  type AgentStep,
  answerStart,
  answerText,
  applyStepEvent,
  summarizeToolResult,
} from "@/lib/agent-steps";

function fold(events: Array<{ type: string; [k: string]: unknown }>): AgentStep[] {
  return events.reduce<AgentStep[]>((s, ev) => applyStepEvent(s, ev), []);
}

describe("agent-steps", () => {
  it("interleaves notes, tool calls and the answer in stream order", () => {
    const steps = fold([
      { type: "delta", text: "협력사 OTD를 " },
      { type: "delta", text: "조회합니다." },
      { type: "tool_call", name: "neptune_query", args: { cypher: "MATCH (s:Supplier) RETURN s" } },
      { type: "tool_result", name: "neptune_query", result: { results: [{}, {}], row_count: 2 } },
      { type: "delta", text: "## 결과" },
    ]);
    expect(steps).toEqual([
      { kind: "text", text: "협력사 OTD를 조회합니다." },
      {
        kind: "tool",
        name: "neptune_query",
        args: { cypher: "MATCH (s:Supplier) RETURN s" },
        status: "done",
        summary: "2행",
      },
      { kind: "text", text: "## 결과" },
    ]);
    expect(answerStart(steps)).toBe(2);
    expect(answerText(steps)).toBe("협력사 OTD를 조회합니다.\n\n## 결과");
  });

  it("a tool still running has no summary; its result closes the newest call of that name", () => {
    let steps = fold([
      { type: "tool_call", name: "neptune_query", args: {} },
      { type: "tool_result", name: "neptune_query", result: { row_count: 1 } },
      { type: "tool_call", name: "neptune_query", args: { cypher: "2" } },
    ]);
    expect(steps[1]).toMatchObject({ status: "running" });
    steps = applyStepEvent(steps, { type: "tool_result", name: "neptune_query", result: { error: "timeout" } });
    expect(steps[0]).toMatchObject({ status: "done", summary: "1행" });
    expect(steps[1]).toMatchObject({ status: "error", summary: "오류: timeout" });
  });

  it("a stream that stops mid-tool closes the running card instead of spinning forever", () => {
    const steps = fold([
      { type: "tool_call", name: "neptune_query", args: {} },
      { type: "tool_result", name: "neptune_query", result: { row_count: 2 } },
      { type: "tool_call", name: "kb_retrieve", args: {} },
      { type: "stop", reason: "fetch_error:TypeError" },
    ]);
    expect(steps.map((s) => s.kind === "tool" && [s.status, s.summary])).toEqual([
      ["done", "2행"],
      ["error", "중단됨"],
    ]);
    const finished = fold([{ type: "delta", text: "a" }]);
    expect(applyStepEvent(finished, { type: "stop", reason: "end_turn" })).toBe(finished);
  });

  it("ignores events that do not change the turn (same array back)", () => {
    const steps = fold([{ type: "delta", text: "a" }]);
    for (const ev of [
      { type: "delta", text: "" },
      { type: "phase", phase: "thinking" },
      { type: "tool_result", name: "unknown", result: {} },
      { type: "guardrail", name: "output_check", result: "passed" },
    ]) {
      expect(applyStepEvent(steps, ev)).toBe(steps);
    }
  });

  it("summarizes every chat tool result shape", () => {
    expect(summarizeToolResult({ results: [1, 2, 3], row_count: 3, truncated: true })).toEqual({ status: "done", summary: "3행+" });
    expect(summarizeToolResult({ hits: [1] })).toEqual({ status: "done", summary: "1건" });
    expect(summarizeToolResult({ results: [] })).toEqual({ status: "done", summary: "0건" });
    expect(summarizeToolResult({ status: "insufficient_data" })).toEqual({ status: "done", summary: "insufficient_data" });
    expect(summarizeToolResult({ truncated: true, preview: "…" })).toEqual({ status: "done", summary: "결과 일부(크기 제한)" });
    expect(summarizeToolResult({ ok: true })).toEqual({ status: "done", summary: "완료" });
    expect(summarizeToolResult(null)).toEqual({ status: "done", summary: "완료" });
  });
});
