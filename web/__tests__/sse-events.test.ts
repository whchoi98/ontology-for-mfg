// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sseErrorText, stopReasonNotice } from "@/lib/sse-events";

describe("sseErrorText", () => {
  it("prefers backend `content`, then client `message`, then result.message", () => {
    expect(sseErrorText({ type: "error", content: "채팅 스트림 처리 중 오류: KeyError" }))
      .toBe("채팅 스트림 처리 중 오류: KeyError");
    expect(sseErrorText({ type: "error", message: "(502) bad gateway", status: 502 }))
      .toBe("(502) bad gateway");
    expect(sseErrorText({ type: "error", result: { message: "throttled" } })).toBe("throttled");
  });

  it("falls back to a generic notice", () => {
    expect(sseErrorText({ type: "error" })).toBe("알 수 없는 오류가 발생했습니다.");
    expect(sseErrorText({ type: "error", content: "   " })).toBe("알 수 없는 오류가 발생했습니다.");
  });
});

describe("stopReasonNotice", () => {
  it("only flags network failures", () => {
    expect(stopReasonNotice("fetch_error:TypeError: Failed to fetch")).toMatch(/네트워크/);
    expect(stopReasonNotice("aborted")).toBeNull();
    expect(stopReasonNotice("stream_end")).toBeNull();
    expect(stopReasonNotice("end_turn")).toBeNull();
    expect(stopReasonNotice("error:502")).toBeNull();
    expect(stopReasonNotice(undefined)).toBeNull();
  });
});
