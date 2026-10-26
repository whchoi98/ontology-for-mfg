import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PersonaProvider } from "@/lib/persona-context";

type Ev = { type: string; [k: string]: unknown };
type Stream = {
  msg: string; sessionId: string; persona: string;
  onEvent: (e: Ev) => void; cancel: ReturnType<typeof vi.fn>;
};

const h = vi.hoisted(() => ({ streams: [] as Stream[] }));

vi.mock("@/lib/api-client", () => ({
  chatStream: vi.fn((msg: string, sessionId: string, persona: string, onEvent: (e: Ev) => void) => {
    const cancel = vi.fn();
    h.streams.push({ msg, sessionId, persona, onEvent, cancel });
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
