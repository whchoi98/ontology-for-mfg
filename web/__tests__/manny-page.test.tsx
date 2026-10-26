import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PersonaProvider } from "@/lib/persona-context";

type Ev = { type: string; [k: string]: unknown };
type Stream = {
  msg: string; sessionId: string; persona: string;
  onEvent: (e: Ev) => void; cancel: ReturnType<typeof vi.fn>; history: unknown[];
};

const h = vi.hoisted(() => ({ streams: [] as Stream[] }));

vi.mock("@/lib/api-client", () => ({
  chatStream: vi.fn((msg: string, sessionId: string, persona: string, onEvent: (e: Ev) => void,
    history: unknown[] = []) => {
    const cancel = vi.fn();
    h.streams.push({ msg, sessionId, persona, onEvent, cancel, history });
    return cancel;
  }),
}));

import MannyPopupPage from "@/app/manny/page";

const SAMPLE = "AMZN-CMP-IC-00001 EOL 대체품 + 단가 비교"; // buyer persona sample

function renderManny() {
  return render(<PersonaProvider><MannyPopupPage /></PersonaProvider>);
}

function emit(s: Stream, ev: Ev) {
  act(() => { s.onEvent(ev); });
}

function input() {
  return screen.getByPlaceholderText("Manny에게 자연어로 질문하세요") as HTMLInputElement;
}

beforeEach(() => {
  h.streams.length = 0;
  localStorage.clear();
});

describe("Manny popup page", () => {
  it("'새로' reset mid-stream cancels the stream and re-enables input + samples", () => {
    renderManny();
    fireEvent.click(screen.getByRole("button", { name: SAMPLE }));
    const s = h.streams[0];
    emit(s, { type: "delta", text: "부분 응답" });
    expect(input().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /새로/ }));
    expect(s.cancel).toHaveBeenCalled();
    expect(input().disabled).toBe(false);
    expect((screen.getByRole("button", { name: SAMPLE }) as HTMLButtonElement).disabled).toBe(false);

    // Late events of the cancelled stream are ignored.
    emit(s, { type: "suggested_followups", items: ["이전 세션 칩"] });
    emit(s, { type: "stop", reason: "aborted" });
    expect(screen.queryByRole("button", { name: "이전 세션 칩" })).toBeNull();

    // And a fresh question can be sent right away, under a new session.
    fireEvent.click(screen.getByRole("button", { name: SAMPLE }));
    expect(h.streams).toHaveLength(2);
    expect(h.streams[1].sessionId).not.toBe(s.sessionId);
  });

  it("switching persona mid-stream cancels the stream", () => {
    renderManny();
    fireEvent.click(screen.getByRole("button", { name: SAMPLE }));
    const s = h.streams[0];
    fireEvent.click(screen.getByRole("button", { name: "생산" }));
    expect(s.cancel).toHaveBeenCalled();
    expect(input().disabled).toBe(false);
    emit(s, { type: "delta", text: "늦게 도착한 토큰" });
    expect(screen.queryByText("늦게 도착한 토큰")).toBeNull();
  });

  it("renders `error` events and network drops", () => {
    renderManny();
    fireEvent.click(screen.getByRole("button", { name: SAMPLE }));
    emit(h.streams[0], { type: "error", message: "(502) bad gateway", status: 502 });
    emit(h.streams[0], { type: "stop", reason: "error:502" });
    expect(screen.getByText(/\(502\) bad gateway/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /새로/ }));
    fireEvent.click(screen.getByRole("button", { name: SAMPLE }));
    emit(h.streams[1], { type: "stop", reason: "fetch_error:TypeError: Failed to fetch" });
    expect(screen.getByText(/네트워크 오류로 응답이 중단되었습니다/)).toBeTruthy();
  });

  it("forwards ESC to the parent window when embedded in the iframe modal", () => {
    const postMessage = vi.fn();
    const fakeParent = { postMessage } as unknown as Window;
    vi.spyOn(window, "parent", "get").mockReturnValue(fakeParent as Window & typeof globalThis);
    renderManny();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(postMessage).toHaveBeenCalledWith({ type: "manny:close" }, window.location.origin);
  });

  it("does not post anything when running as a top-level popup window", () => {
    const postMessage = vi.spyOn(window, "postMessage");
    renderManny();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe("MannyPage live agent steps", () => {
  it("paints the note, the running tool and the wait before the answer arrives", () => {
    renderManny();
    fireEvent.click(screen.getByRole("button", { name: SAMPLE }));
    const s = h.streams[0];
    expect(screen.getByTestId("agent-waiting").textContent).toContain("질문을 분석하고 있습니다");

    emit(s, { type: "delta", text: "단가 데이터를 조회합니다." });
    expect(screen.getByText("단가 데이터를 조회합니다.")).toBeTruthy();
    expect(screen.queryByTestId("agent-waiting")).toBeNull();

    emit(s, { type: "tool_call", name: "neptune_query", args: { cypher: "MATCH (c:Component) RETURN c" } });
    const card = screen.getByTestId("agent-tool-step");
    expect(card.textContent).toContain("neptune_query");
    expect(card.textContent).toContain("실행 중");
    // The sentence before the tool call is now a progress note, not the answer.
    expect(screen.getByTestId("agent-note-step").textContent).toContain("단가 데이터를 조회합니다.");

    emit(s, { type: "tool_result", name: "neptune_query", result: { results: [{}, {}, {}], row_count: 3 } });
    expect(card.textContent).toContain("3행");
    expect(screen.getByTestId("agent-waiting").textContent).toContain("결과를 정리하고 있습니다");

    emit(s, { type: "delta", text: "후보는 **SUP-0007**입니다." });
    expect(screen.queryByTestId("agent-waiting")).toBeNull();
    emit(s, { type: "stop", reason: "end_turn" });
    expect(screen.getByText("SUP-0007")).toBeTruthy();
  });

  it("replays the notes and the answer as one paragraph-separated turn", () => {
    renderManny();
    fireEvent.click(screen.getByRole("button", { name: SAMPLE }));
    const s = h.streams[0];
    emit(s, { type: "delta", text: "조회합니다." });
    emit(s, { type: "tool_call", name: "neptune_query", args: {} });
    emit(s, { type: "tool_result", name: "neptune_query", result: { row_count: 0 } });
    emit(s, { type: "delta", text: "결과 없음" });
    emit(s, { type: "stop", reason: "end_turn" });
    fireEvent.change(input(), { target: { value: "다음 질문" } });
    fireEvent.click(screen.getByRole("button", { name: /전송/ }));
    expect(h.streams[1].history).toEqual([
      { role: "user", content: SAMPLE },
      { role: "assistant", content: "조회합니다.\n\n결과 없음" },
    ]);
  });
});

describe("MannyPage conversation context", () => {
  it("replays only completed turns, and 새로 starts a clean context", () => {
    renderManny();
    const ask = (text: string) => {
      fireEvent.change(input(), { target: { value: text } });
      fireEvent.click(screen.getByRole("button", { name: /전송/ }));
      return h.streams[h.streams.length - 1];
    };
    const first = ask("Q1");
    emit(first, { type: "delta", text: "A1" });
    emit(first, { type: "stop", reason: "end_turn" });
    const failed = ask("Q2");
    emit(failed, { type: "stop", reason: "fetch_error:TypeError" });
    expect(ask("Q3").history).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
    ]);
  });
});
