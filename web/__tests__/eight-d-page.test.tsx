import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ cancel: vi.fn(), started: 0 }));

vi.mock("@/lib/api-client", () => ({
  eightDStream: vi.fn(() => { h.started += 1; return h.cancel; }),
}));

import EightDPage from "@/app/eight-d/page";

describe("EightDPage", () => {
  it("cancels the in-flight 8D stream on unmount (navigation away)", () => {
    const view = render(<EightDPage />);
    fireEvent.submit(screen.getByDisplayValue("INC-2026-0412").closest("form")!);
    expect(h.started).toBe(1);
    view.unmount();
    expect(h.cancel).toHaveBeenCalled();
  });
});
