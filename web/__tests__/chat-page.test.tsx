import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PersonaProvider, useActivePersona } from "@/lib/persona-context";

type Ev = { type: string; [k: string]: unknown };
type Stream = {
  msg: string; sessionId: string; persona: string;
  onEvent: (e: Ev) => void; cancel: ReturnType<typeof vi.fn>;
};

const h = vi.hoisted(() => ({ streams: [] as Stream[], exportToPdf: vi.fn() }));

vi.mock("@/lib/pdf-export", () => ({ exportToPdf: h.exportToPdf }));

vi.mock("@/lib/api-client", () => ({
  chatStream: vi.fn((msg: string, sessionId: string, persona: string, onEvent: (e: Ev) => void) => {
    const cancel = vi.fn();
    h.streams.push({ msg, sessionId, persona, onEvent, cancel });
    return cancel;
  }),
}));

import ChatPage from "@/app/chat/page";

function PersonaFlip() {
  const { setActive } = useActivePersona();
  return <button type="button" onClick={() => setActive("plant")}>flip-persona</button>;
}

function renderChat() {
  return render(
    <PersonaProvider>
      <PersonaFlip />
      <ChatPage />
    </PersonaProvider>,
  );
}

const literal = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

function emit(s: Stream, ev: Ev) {
  act(() => { s.onEvent(ev); });
}

const ENGINEER_SAMPLE = "AMZN-CMP-IC-00001 부품의 AEC-Q100 인증 상태 알려줘";
const BUYER_SAMPLE = "1차 협력사 중 OTD 95% 이상 + 단가 인하 가능 후보";

beforeEach(() => {
  h.streams.length = 0;
  localStorage.clear();
});

describe("ChatPage", () => {
  it("sample chip for another persona streams under THAT persona and keeps the turn", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: literal(ENGINEER_SAMPLE) }));

    expect(h.streams).toHaveLength(1);
    const s = h.streams[0];
    expect(s.persona).toBe("engineer");
    expect(s.sessionId).toMatch(/^mfg_engineer_/);

    emit(s, { type: "delta", text: "AEC-Q100 Grade 1 인증 유효" });
    expect(screen.getByText(ENGINEER_SAMPLE)).toBeTruthy();
    expect(screen.getByText("AEC-Q100 Grade 1 인증 유효")).toBeTruthy();

    emit(s, { type: "suggested_followups", items: ["만료일은?"] });
    emit(s, { type: "stop", reason: "end_turn" });
    expect(screen.getByRole("button", { name: "만료일은?" })).toBeTruthy();
  });

  it("switching persona mid-stream cancels the stream and drops its late events", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: literal(BUYER_SAMPLE) }));
    const s = h.streams[0];
    expect(s.persona).toBe("buyer");
    expect(screen.getByRole("button", { name: "응답 중…" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "flip-persona" }));
    expect(s.cancel).toHaveBeenCalled();
    // Streaming state is released immediately — the form is usable again.
    expect(screen.queryByRole("button", { name: "응답 중…" })).toBeNull();
    expect((screen.getByPlaceholderText(/페르소나로 질문하기/) as HTMLInputElement).disabled).toBe(false);

    // Late events from the cancelled stream must not leak into the new session.
    emit(s, { type: "delta", text: "늦게 도착한 토큰" });
    emit(s, { type: "suggested_followups", items: ["이전 세션 칩"] });
    emit(s, { type: "stop", reason: "aborted" });
    expect(screen.queryByText("늦게 도착한 토큰")).toBeNull();
    expect(screen.queryByRole("button", { name: "이전 세션 칩" })).toBeNull();
  });

  it("renders backend `error` events instead of an empty assistant bubble", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: literal(BUYER_SAMPLE) }));
    const s = h.streams[0];
    emit(s, { type: "error", name: "chat_stream", content: "채팅 스트림 처리 중 오류: KeyError" });
    emit(s, { type: "stop", reason: "stream_error" });
    expect(screen.getByText(/채팅 스트림 처리 중 오류: KeyError/)).toBeTruthy();
  });

  it("shows a friendly notice when the network drops the stream", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: literal(BUYER_SAMPLE) }));
    emit(h.streams[0], { type: "stop", reason: "fetch_error:TypeError: Failed to fetch" });
    expect(screen.getByText(/네트워크 오류로 응답이 중단되었습니다/)).toBeTruthy();
  });

  it("cancels the in-flight stream on unmount", () => {
    const view = renderChat();
    fireEvent.click(screen.getByRole("button", { name: literal(BUYER_SAMPLE) }));
    const s = h.streams[0];
    view.unmount();
    expect(s.cancel).toHaveBeenCalled();
  });

  it("shows a visible error when PDF export fails (e.g. canvas too large)", async () => {
    h.exportToPdf.mockRejectedValueOnce(new Error("Invalid canvas"));
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: literal(BUYER_SAMPLE) }));
    emit(h.streams[0], { type: "delta", text: "답변" });
    emit(h.streams[0], { type: "stop", reason: "end_turn" });

    fireEvent.click(screen.getByTitle("대화 기록을 .pdf 파일로 다운로드"));
    expect(await screen.findByText(/PDF 생성 실패 — Invalid canvas/)).toBeTruthy();
  });
});
