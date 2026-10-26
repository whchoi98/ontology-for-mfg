import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("SidebarAuth API base", () => {
  it.each([undefined, "/api"])(
    "hits /api/auth/* exactly once-prefixed (NEXT_PUBLIC_API_BASE=%s)",
    async (base) => {
      if (base !== undefined) vi.stubEnv("NEXT_PUBLIC_API_BASE", base);
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ authenticated: false })));
      vi.stubGlobal("fetch", fetchMock);
      vi.resetModules();
      const { SidebarAuth } = await import("@/components/SidebarAuth");

      render(<SidebarAuth />);
      const login = await screen.findByRole("link", { name: /로그인/ });

      expect(fetchMock).toHaveBeenCalledWith("/api/auth/whoami", expect.anything());
      expect(login.getAttribute("href")).toBe("/api/auth/login");
    },
  );
});
