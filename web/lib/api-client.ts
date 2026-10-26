import { apiUrl } from "./api-base";

const SESSION_EXPIRED_MSG =
  "로그인 세션이 만료되었습니다. 페이지를 새로고침하면 자동 재로그인됩니다.";

/** Send the browser to the Cognito login flow. */
function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    window.location.href = apiUrl("/auth/login");
  }
}

/** Redirect to Cognito login when the API returns 401. */
function handleUnauthorized(): never {
  redirectToLogin();
  throw new Error("authentication required");
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    signal,
  });
  if (r.status === 401) handleUnauthorized();
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(apiUrl(path), { credentials: "include", signal });
  if (r.status === 401) handleUnauthorized();
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export const api = {
  search: (q: string, persona = "buyer", top_n = 10) =>
    postJson<{ hits: unknown[]; subgraph: unknown }>("/search", { q, persona, top_n }),
  insights: (question: string, persona = "buyer") =>
    postJson("/insights", { question, persona }),
  specMatch: (requirements: string, top_n = 5) =>
    postJson("/spec-match", { requirements, top_n }),
  compliance: (component_id: string) =>
    postJson("/compliance", { component_id }),
  substitute: (component_id: string, same_supplier_ok = false, top_n = 8) =>
    postJson("/substitute", { component_id, same_supplier_ok, top_n }),
  substituteSamples: (limit = 15) =>
    getJson(`/substitute/samples?limit=${limit}`),
  price: (component_id: string) =>
    postJson("/price", { component_id }),
  priceSamples: (limit = 15) =>
    getJson(`/substitute/samples?limit=${limit}`),
  lanes: () => getJson("/lane"),
  reroute: (event: string) => postJson("/lane/reroute", { event }),
  rfm: (tier = 1, top_n = 20) => postJson("/supplier-rfm", { tier, top_n }),
  eightD,
  esg: (plant_id?: string) => postJson("/esg", { plant_id }),
  pdm: (plant_id?: string) => postJson("/pdm", { plant_id }),
};

// ─── New API methods for flat URL structure ──────────────────────────────────

// listPersonas — returns hardcoded 5 mfg personas (no API call)
export function listPersonas(_n = 5) {
  return Promise.resolve({
    items: [
      { persona_id: "buyer",    label_ko: "Buyer 구매" },
      { persona_id: "engineer", label_ko: "Engineer R&D" },
      { persona_id: "quality",  label_ko: "Quality 품질" },
      { persona_id: "scm",      label_ko: "SCM 공급망" },
      { persona_id: "plant",    label_ko: "Plant 생산" },
    ],
  });
}

// listObjects — GET /api/objects/<label>?limit=N
export function listObjects<T = { label: string; items: unknown[] }>(
  label: string, limit = 100, signal?: AbortSignal,
) {
  return getJson<T>(`/objects/${encodeURIComponent(label)}?limit=${limit}`, signal);
}

// getObject — GET /api/objects/<label>/<id> (properties + 1-hop subgraph)
export function getObject<T = Record<string, unknown>>(
  label: string, id: string, signal?: AbortSignal,
) {
  return getJson<T>(`/objects/${encodeURIComponent(label)}/${encodeURIComponent(id)}`, signal);
}

// getOpsTrace — GET /api/ops/trace (fallback on error)
export async function getOpsTrace(limit = 50) {
  try {
    return await getJson<unknown>(`/ops/trace?limit=${limit}`);
  } catch {
    return { items: [], error: "trace endpoint not available" };
  }
}

// ─── Ops console (typed surface for /ops/[area] page) ────────────────────────

export type IngestStatus = {
  neptune: Record<string, number>;
  opensearch_docs: number;
  opensearch_index: string;
};

export type GuardrailEvent = { timestamp: number; message: string };
export type GuardrailTopic = { name: string; ko: string; definition: string };
export type GuardrailResponse = {
  events: GuardrailEvent[];
  bedrock_guardrail_id: string;
  topics: GuardrailTopic[];
};

export type MemoryEvent = {
  actor_id?: string | null;
  role?: string | null;
  text?: string | null;
  event_timestamp?: string | null;
  raw?: Record<string, unknown>;
};
export type MemorySnapshot = {
  memory_id: string;
  session_id?: string | null;
  events: MemoryEvent[];
};

export type EvalRow = {
  q: string;
  keywords: string[];
  hit_count: number;
  passed: boolean;
  latency_ms: number;
  error?: string | null;
};
export type EvalResponse = {
  pass_rate: number;
  passes: number;
  total: number;
  avg_latency_ms: number;
  cached_at_unix: number;
  rows: EvalRow[];
};

export type TraceEvent = {
  ts: number;
  session_id: string;
  actor_id: string;
  tool: string;
  input: Record<string, unknown>;
};
export type TraceResponse = { events: TraceEvent[]; total: number };

export const opsIngest = () => getJson<IngestStatus>(`/ops/ingest`);
export const opsGuardrail = (minutes = 60, limit = 40) =>
  getJson<GuardrailResponse>(`/ops/guardrail?minutes=${minutes}&limit=${limit}`);
export const opsMemory = (sessionId?: string, topK = 30) => {
  const qp = sessionId
    ? `?session_id=${encodeURIComponent(sessionId)}&top_k=${topK}`
    : `?top_k=${topK}`;
  return getJson<MemorySnapshot>(`/ops/memory${qp}`);
};
export const opsEval = (run = false) =>
  getJson<EvalResponse>(`/ops/eval?run=${run}`);
export const opsTrace = (limit = 50, sessionId?: string) => {
  const qp = sessionId
    ? `?limit=${limit}&session_id=${encodeURIComponent(sessionId)}`
    : `?limit=${limit}`;
  return getJson<TraceResponse>(`/ops/trace${qp}`);
};

export type StreamEvent = { type: string; [k: string]: unknown };

/** Generic SSE streamer shared by /chat and /eight-d.
 *
 *  Contract: every stream ends with at least one `stop` event, including
 *  the failure paths — non-2xx → `error` + `stop(error:<status>)`, network
 *  failure → `stop(fetch_error:…)`, caller cancel → `stop(aborted)` — so
 *  consumers can always leave their streaming state on `stop`. */
function sseStream(
  path: string,
  body: unknown,
  onEvent: (e: StreamEvent) => void,
): () => void {
  const ctrl = new AbortController();
  fetch(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: ctrl.signal,
    credentials: "include",
  }).then(async (r) => {
    if (!r.ok) {
      // Surface the failure so the panel doesn't appear silent.
      const detail = await r.text().catch(() => "");
      const why = r.status === 401
        ? SESSION_EXPIRED_MSG
        : `(${r.status}) ${detail.slice(0, 200) || r.statusText}`;
      onEvent({ type: "error", message: why, status: r.status });
      onEvent({ type: "stop", reason: `error:${r.status}` });
      if (r.status === 401) redirectToLogin();
      return;
    }
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // SSE event separator is two newlines. sse-starlette emits CRLF (`\r\n\r\n`),
    // some servers emit LF (`\n\n`). Split on both.
    const eventSep = /\r?\n\r?\n/;
    const lineSep = /\r?\n/;
    const dispatch = (ev: string) => {
      const dataLine = ev.split(lineSep).find((l) => l.startsWith("data:"));
      if (!dataLine) return;
      const payload = dataLine.slice(5).trimStart();
      if (!payload) return;
      try { onEvent(JSON.parse(payload)); } catch { /* skip malformed */ }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split(eventSep);
      buf = events.pop() ?? "";
      for (const ev of events) dispatch(ev);
    }
    // Flush trailing buffer (last event may have no terminating blank line)
    if (buf.trim()) dispatch(buf);
    // Ensure streaming ends if stream closes without explicit stop event
    onEvent({ type: "stop", reason: "stream_end" });
  }).catch((err) => {
    if (ctrl.signal.aborted || err?.name === "AbortError") {
      // Caller cancelled — still terminate the event sequence so any
      // consumer keyed on `stop` leaves its streaming state.
      onEvent({ type: "stop", reason: "aborted" });
    } else {
      onEvent({ type: "stop", reason: `fetch_error:${String(err)}` });
    }
  });
  return () => ctrl.abort();
}

/** Stream the 8D pipeline — emits phase / phase_done / result / stop events. */
export function eightDStream(
  incident_id: string,
  onEvent: (e: StreamEvent) => void,
): () => void {
  return sseStream("/eight-d", { incident_id }, onEvent);
}

/** Promise wrapper around eightDStream — resolves with the final result payload.
 *  Kept for legacy persona-routed pages that expected a JSON response. New code
 *  should use eightDStream directly to render live progress. */
function eightD(incident_id: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let final: Record<string, unknown> | null = null;
    let errMsg: string | null = null;
    eightDStream(incident_id, (ev) => {
      if (ev.type === "result") {
        final = ev as Record<string, unknown>;
      } else if (ev.type === "error") {
        errMsg = String(ev.message ?? "8D stream error");
      } else if (ev.type === "stop") {
        if (final) resolve(final);
        else reject(new Error(errMsg ?? `8D stream ended without result (${String(ev.reason ?? "?")})`));
      }
    });
  });
}

export function chatStream(
  msg: string, session_id: string, persona = "engineer",
  onEvent: (e: StreamEvent) => void,
): () => void {
  return sseStream("/chat", { msg, session_id, persona }, onEvent);
}
