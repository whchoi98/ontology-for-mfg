import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import FloatingChat from "@/components/FloatingChat";

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

function useUA(ua: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

function openLauncher() {
  fireEvent.click(screen.getByRole("button", { name: "Manny 챗봇 열기" }));
}

function iframe() {
  return document.querySelector('iframe[title="Manny 챗봇"]') as HTMLIFrameElement | null;
}

function postFromFrame(data: unknown, origin = window.location.origin, source?: MessageEventSource | null) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", {
      data, origin, source: source === undefined ? iframe()!.contentWindow : source,
    }));
  });
}

const isShown = () => screen.queryByRole("dialog", { name: "Manny 챗봇" }) !== null;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FloatingChat iframe modal (Chromium)", () => {
  it("closes on a same-origin manny:close message from its iframe (ESC forwarded from /manny)", () => {
    useUA(CHROME_UA);
    render(<FloatingChat />);
    openLauncher();
    expect(isShown()).toBe(true);

    postFromFrame({ type: "manny:close" });
    expect(isShown()).toBe(false);
  });

  it("ignores close messages from other origins or other frames", () => {
    useUA(CHROME_UA);
    render(<FloatingChat />);
    openLauncher();

    postFromFrame({ type: "manny:close" }, "https://evil.example.com");
    expect(isShown()).toBe(true);
    postFromFrame({ type: "manny:close" }, window.location.origin, window);
    expect(isShown()).toBe(true);
    postFromFrame({ type: "something-else" });
    expect(isShown()).toBe(true);
  });

  it("keeps the iframe (and its conversation) alive across close → reopen", () => {
    useUA(CHROME_UA);
    render(<FloatingChat />);
    openLauncher();
    const first = iframe();
    expect(first).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(isShown()).toBe(false);
    expect(iframe()).toBe(first); // hidden, not unmounted

    openLauncher();
    expect(isShown()).toBe(true);
    expect(iframe()).toBe(first);
  });
});

describe("FloatingChat popup window (Firefox / Safari)", () => {
  it("opens a single named window and re-focuses it instead of spawning new ones", () => {
    useUA(FIREFOX_UA);
    const popup = {
      closed: false,
      focus: vi.fn(),
      location: { href: "about:blank" },
    };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    render(<FloatingChat />);

    openLauncher();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1]).toBe("manny");
    expect(popup.location.href).toBe(`${window.location.origin}/manny`);

    openLauncher();
    expect(open).toHaveBeenCalledTimes(1);
    expect(popup.focus).toHaveBeenCalledTimes(2);
  });

  it("does not reload an already-open named window (e.g. after the launcher page reloaded)", () => {
    useUA(FIREFOX_UA);
    const href = `${window.location.origin}/manny`;
    const popup = { closed: false, focus: vi.fn(), location: { href } };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    render(<FloatingChat />);
    openLauncher();
    expect(popup.location.href).toBe(href);
    expect(popup.focus).toHaveBeenCalled();
  });
});
