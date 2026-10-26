// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, resolveApiBase } from "@/lib/api-base";

describe("resolveApiBase", () => {
  it("defaults to the same-origin /api prefix", () => {
    expect(resolveApiBase(undefined)).toBe("/api");
    expect(resolveApiBase("")).toBe("/api");
    expect(resolveApiBase("   ")).toBe("/api");
  });

  it("keeps an explicit prefix and strips trailing slashes", () => {
    expect(resolveApiBase("/api")).toBe("/api");
    expect(resolveApiBase("/api/")).toBe("/api");
    expect(resolveApiBase("https://mfg.example.com/api/")).toBe("https://mfg.example.com/api");
  });
});

describe("apiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("joins paths under the single prefix", () => {
    expect(apiUrl("/auth/login")).toBe("/api/auth/login");
    expect(apiUrl("auth/whoami")).toBe("/api/auth/whoami");
  });

  it("never doubles the prefix when NEXT_PUBLIC_API_BASE is baked in at build time", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE", "/api");
    vi.resetModules();
    const mod = await import("@/lib/api-base");
    expect(mod.apiUrl("/auth/whoami")).toBe("/api/auth/whoami");
  });
});
