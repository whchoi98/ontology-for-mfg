// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStream, eightDStream } from "@/lib/api-client";

type Ev = { type: string; [k: string]: unknown };

function sseResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(enc.encode(c));
      ctrl.close();
    },
  });
  return new Response(body, { status });
}

/** fetch mock that never resolves on its own — only rejects on abort, like the real one. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    }),
  );
}

function collect() {
  const events: Ev[] = [];
  const onEvent = (e: Ev) => { events.push(e); };
  return { events, onEvent };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chatStream", () => {
  it("parses CRLF-delimited SSE frames and ends with a stop", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      'data: {"type":"delta","text":"안녕"}\r\n\r\n',
      'data: {"type":"delta","text":"하세요"}\r\n\r\ndata: {"type":"stop","reason":"end_turn"}',
    ])));
    const { events, onEvent } = collect();
    chatStream("hi", "s1", "buyer", onEvent);
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe("stop"));
    expect(events.filter((e) => e.type === "delta").map((e) => e.text).join("")).toBe("안녕하세요");
  });

  it("sends the earlier turns as `history` (empty for a first question)", async () => {
    const fetchMock = vi.fn(async (_u: string, _init?: RequestInit) =>
      sseResponse(['data: {"type":"stop","reason":"end_turn"}\n\n']));
    vi.stubGlobal("fetch", fetchMock);
    const history = [
      { role: "user" as const, content: "Q1" },
      { role: "assistant" as const, content: "A1" },
    ];
    const first = collect();
    chatStream("hi", "s1", "buyer", first.onEvent);
    const second = collect();
    chatStream("Q2", "s1", "buyer", second.onEvent, history);
    await vi.waitFor(() => expect(second.events.at(-1)?.type).toBe("stop"));
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0]).toEqual({ msg: "hi", session_id: "s1", persona: "buyer", history: [] });
    expect(bodies[1].history).toEqual(history);
  });

  it("emits a synthetic stop(reason=aborted) when cancelled mid-request", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const { events, onEvent } = collect();
    const cancel = chatStream("hi", "s1", "buyer", onEvent);
    cancel();
    await vi.waitFor(() => expect(events).toContainEqual({ type: "stop", reason: "aborted" }));
    await flush();
    expect(events.filter((e) => e.type === "stop")).toHaveLength(1);
  });

  it("emits a synthetic stop(reason=aborted) when cancelled while reading the body", async () => {
    let ctrlRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          ctrlRef = c;
          c.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"a"}\n\n'));
          init?.signal?.addEventListener("abort", () => {
            c.error(new DOMException("The operation was aborted.", "AbortError"));
          });
        },
      });
      return new Response(body, { status: 200 });
    }));
    const { events, onEvent } = collect();
    const cancel = chatStream("hi", "s1", "buyer", onEvent);
    await vi.waitFor(() => expect(events.some((e) => e.type === "delta")).toBe(true));
    expect(ctrlRef).not.toBeNull();
    cancel();
    await vi.waitFor(() => expect(events.at(-1)).toEqual({ type: "stop", reason: "aborted" }));
  });

  it("surfaces non-2xx responses as an error event followed by stop", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream exploded", { status: 502 })));
    const { events, onEvent } = collect();
    chatStream("hi", "s1", "buyer", onEvent);
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe("stop"));
    expect(events[0].type).toBe("error");
    expect(String(events[0].message)).toContain("502");
    expect(events.at(-1)).toEqual({ type: "stop", reason: "error:502" });
  });

  it("reports network failures as stop(fetch_error:…)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { events, onEvent } = collect();
    chatStream("hi", "s1", "buyer", onEvent);
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe("stop"));
    expect(String(events.at(-1)?.reason)).toMatch(/^fetch_error:/);
  });
});

describe("eightDStream", () => {
  it("also emits stop(reason=aborted) on cancel", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const { events, onEvent } = collect();
    const cancel = eightDStream("INC-1", onEvent);
    cancel();
    await vi.waitFor(() => expect(events).toContainEqual({ type: "stop", reason: "aborted" }));
  });
});
