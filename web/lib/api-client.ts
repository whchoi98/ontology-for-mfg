const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { credentials: "include" });
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
  substitute: (component_id: string, top_n = 5) =>
    postJson("/substitute", { component_id, top_n }),
  price: (component_id: string) =>
    postJson("/price", { component_id }),
  lanes: () => getJson("/lane"),
  reroute: (event: string) => postJson("/lane/reroute", { event }),
  rfm: (tier = 1, top_n = 20) => postJson("/supplier-rfm", { tier, top_n }),
  eightD: (incident_id: string) => postJson("/eight-d", { incident_id }),
  esg: (plant_id?: string) => postJson("/esg", { plant_id }),
  pdm: (plant_id?: string) => postJson("/pdm", { plant_id }),
};

export function chatStream(
  msg: string, session_id: string, persona = "engineer",
  onEvent: (e: { type: string; [k: string]: unknown }) => void,
): () => void {
  const ctrl = new AbortController();
  fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ msg, session_id, persona }),
    signal: ctrl.signal,
    credentials: "include",
  }).then(async (r) => {
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value);
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const ev of events) {
        const dataLine = ev.split("\n").find((l) => l.startsWith("data: "));
        if (dataLine) onEvent(JSON.parse(dataLine.slice(6)));
      }
    }
  });
  return () => ctrl.abort();
}
