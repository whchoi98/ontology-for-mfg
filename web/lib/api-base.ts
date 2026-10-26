// web/lib/api-base.ts
//
// Single source of truth for the API URL prefix. `NEXT_PUBLIC_API_BASE` is
// the FULL prefix including `/api` (compute-stack sets it to "/api"); when it
// is unset or blank we fall back to same-origin "/api". Every caller passes
// paths WITHOUT the prefix (`apiUrl("/auth/login")`), so inlining the env var
// at build time can never produce `/api/api/...`.

export function resolveApiBase(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  return (v || "/api").replace(/\/+$/, "");
}

export const API_BASE = resolveApiBase(process.env.NEXT_PUBLIC_API_BASE);

/** `apiUrl("/auth/login")` → "/api/auth/login". */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
