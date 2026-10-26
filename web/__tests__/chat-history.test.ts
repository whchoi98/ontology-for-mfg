// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HISTORY_MAX_PAIRS, historyFrom, isCompleteStop } from "@/lib/chat-history";

const q = (text: string) => ({ role: "user" as const, text });
const a = (text: string, extra: { complete?: boolean; error?: string } = { complete: true }) =>
  ({ role: "assistant" as const, text, ...extra });

describe("historyFrom", () => {
  it("keeps completed pairs only, oldest first", () => {
    expect(historyFrom([
      q("Q1"), a("A1"),
      q("blocked"), a("죄송합니다", { complete: false }), // guardrail_intervened
      q("failed"), a("partial", { complete: true, error: "네트워크 오류" }),
      q("Q2"), a("A2"),
      q("in flight"), a("", {}), // the turn being streamed right now
    ])).toEqual([
      { role: "user", content: "Q1" }, { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" }, { role: "assistant", content: "A2" },
    ]);
  });

  it("caps at the newest HISTORY_MAX_PAIRS pairs", () => {
    const msgs = Array.from({ length: HISTORY_MAX_PAIRS + 3 }, (_, i) => [q(`Q${i}`), a(`A${i}`)]).flat();
    const turns = historyFrom(msgs);
    expect(turns).toHaveLength(2 * HISTORY_MAX_PAIRS);
    expect(turns[0]).toEqual({ role: "user", content: "Q3" });
  });

  it("is empty for a fresh conversation", () => {
    expect(historyFrom([])).toEqual([]);
  });
});

describe("isCompleteStop", () => {
  it("accepts only end_turn", () => {
    expect(isCompleteStop("end_turn")).toBe(true);
    for (const r of ["guardrail_intervened", "bedrock_error", "max_tokens", "aborted", "stream_end", "fetch_error:x", undefined]) {
      expect(isCompleteStop(r)).toBe(false);
    }
  });
});
