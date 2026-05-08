"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Database, ShieldCheck, Brain, Activity, ChevronRight, RefreshCcw,
  CheckCircle2, XCircle, AlertCircle, ListTree, Wrench,
} from "lucide-react";

import {
  opsIngest, opsGuardrail, opsMemory, opsEval, opsTrace,
  type IngestStatus, type GuardrailResponse, type MemorySnapshot,
  type EvalResponse, type TraceResponse,
} from "@/lib/api-client";

const META: Record<string, {
  ko: string; desc: string; icon: React.ComponentType<{ className?: string }>;
}> = {
  ingest:    { ko: "데이터 적재",         desc: "Neptune 노드/엣지 + OpenSearch 인덱스 카운트", icon: Database },
  guardrail: { ko: "가드레일",            desc: "Bedrock Guardrail 4 토픽 (IP·경쟁사·규제·유해화학) + intervention 로그", icon: ShieldCheck },
  memory:    { ko: "메모리 히스토리",     desc: "AgentCore Memory (DynamoDB 폴백) — 세션별 short-term 이벤트", icon: Brain },
  eval:      { ko: "평가 결과",           desc: "30 mfg-domain 검색 쿼리 pass rate + p95 latency", icon: Activity },
  trace:     { ko: "도구 호출 트레이스",  desc: "대화형 에이전트 도구 호출 timeline — 최근 200개 (per-instance ring)", icon: ListTree },
};

export default function OpsPage({ params }: { params: { area: string } }) {
  const meta = META[params.area] ?? { ko: params.area, desc: "", icon: Activity };
  const Icon = meta.icon;
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400 flex items-center gap-2">
          <Link href="/" className="hover:text-accent-300">홈</Link>
          <ChevronRight className="w-3 h-3" />
          <span>파이프라인</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ink-200">{meta.ko}</span>
        </div>
      </header>
      <div className="flex-1 mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center">
            <Icon className="w-5 h-5 text-accent-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-50">{meta.ko}</h1>
            <p className="text-sm text-ink-400">{meta.desc}</p>
          </div>
        </div>
        {params.area === "ingest" && <IngestView />}
        {params.area === "guardrail" && <GuardrailView />}
        {params.area === "memory" && <MemoryView />}
        {params.area === "eval" && <EvalView />}
        {params.area === "trace" && <TraceView />}
        {!META[params.area] && (
          <p className="text-sm text-ink-400">Unknown ops area: {params.area}</p>
        )}
      </div>
    </div>
  );
}

// ─── Ingest ────────────────────────────────────────────────────────────────
function IngestView() {
  const [data, setData] = useState<IngestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError(null);
    try { setData(await opsIngest()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  if (loading && !data) return <p className="text-sm text-ink-400">로딩 중…</p>;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  const labels = Object.entries(data.neptune).filter(([k]) => !k.startsWith(":")).sort((a, b) => b[1] - a[1]);
  const edges = Object.entries(data.neptune).filter(([k]) => k.startsWith(":")).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-5">
      <RefreshButton onClick={load} loading={loading} />
      <Section title="OpenSearch Serverless">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="총 도큐먼트" value={data.opensearch_docs.toLocaleString()} />
          <Stat label="인덱스" value={data.opensearch_index} mono />
        </div>
      </Section>
      <Section title={`Neptune Nodes (${labels.length} labels)`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {labels.map(([k, v]) => <Stat key={k} label={k} value={v.toLocaleString()} />)}
        </div>
      </Section>
      <Section title={`Neptune Edges (${edges.length} relationships)`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {edges.map(([k, v]) => <Stat key={k} label={k.slice(1)} value={v.toLocaleString()} mono />)}
        </div>
      </Section>
    </div>
  );
}

// ─── Guardrail ─────────────────────────────────────────────────────────────
function GuardrailView() {
  const [data, setData] = useState<GuardrailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [minutes, setMinutes] = useState(60);
  async function load() {
    setLoading(true); setError(null);
    try { setData(await opsGuardrail(minutes, 50)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [minutes]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <RefreshButton onClick={load} loading={loading} />
        <select
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="rounded-md border border-ink-700 bg-ink-900 text-ink-100 px-3 py-1.5 text-xs"
        >
          {[15, 60, 360, 1440].map((m) => <option key={m} value={m}>지난 {m}분</option>)}
        </select>
        {data && (
          <span className="text-xs text-ink-400">
            guardrail_id:{" "}
            <span className="font-mono text-ink-200">{data.bedrock_guardrail_id}</span>
          </span>
        )}
      </div>

      {error && <ErrorBox msg={error} />}

      {data && data.topics && data.topics.length > 0 && (
        <Section title={`활성 토픽 (${data.topics.length}개)`}>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.topics.map((t) => (
              <li
                key={t.name}
                className="p-3 rounded border border-ink-700 bg-ink-800"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-200">
                    {t.name}
                  </span>
                  <span className="text-sm font-semibold text-ink-100">{t.ko}</span>
                </div>
                <p className="text-xs text-ink-400 leading-relaxed">{t.definition}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data && (
        <Section title={`최근 이벤트 (${data.events.length}건, 지난 ${minutes}분)`}>
          {data.events.length === 0 ? (
            <p className="text-sm text-ink-400 italic px-1">
              매칭된 가드레일 이벤트가 없습니다 (정상 동작 중).
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.events.map((e, i) => (
                <li
                  key={i}
                  className="p-2.5 rounded border border-ink-700 bg-ink-800 font-mono text-xs"
                >
                  <span className="text-ink-400 mr-2">
                    {new Date(e.timestamp).toISOString().slice(11, 19)}
                  </span>
                  <span className="text-ink-200 whitespace-pre-wrap break-all">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

// ─── Memory ────────────────────────────────────────────────────────────────
function MemoryView() {
  const [sid, setSid] = useState("");
  const [data, setData] = useState<MemorySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError(null);
    try { setData(await opsMemory(sid.trim() || undefined, 30)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={sid}
          onChange={(e) => setSid(e.target.value)}
          placeholder="session_id (예: mfg_engineer_abc123…)"
          className="flex-1 rounded-md border border-ink-700 bg-ink-900 text-ink-100 px-3 py-1.5 text-xs font-mono"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-md bg-accent-500 text-ink-950 font-semibold text-xs disabled:bg-ink-700"
        >
          {loading ? "로딩…" : "조회"}
        </button>
      </div>
      {error && <ErrorBox msg={error} />}
      {data && (
        <Section
          title={`Memory: ${data.memory_id}${data.session_id ? ` · ${data.session_id}` : ""}`}
        >
          {!data.session_id && (
            <p className="text-xs text-ink-400 italic">
              session_id를 입력하면 short-term 이벤트(role/text/actor)가 시간 순으로 표시됩니다.
            </p>
          )}
          {data.session_id && data.events.length === 0 && (
            <p className="text-xs text-ink-400 italic">이 세션에 아직 이벤트가 없습니다.</p>
          )}
          <ul className="space-y-2">
            {data.events.map((e, i) => (
              <li key={i} className="p-3 rounded border border-ink-700 bg-ink-800">
                <div className="flex items-center gap-2 text-[10px] font-mono text-ink-400 mb-1">
                  <span>{e.role ?? "(role?)"}</span>
                  <span>·</span>
                  <span>{e.actor_id ?? "(actor?)"}</span>
                  <span>·</span>
                  <span>{e.event_timestamp ?? "(ts?)"}</span>
                </div>
                <p className="text-sm text-ink-100 whitespace-pre-wrap">
                  {e.text ?? "(no text)"}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ─── Eval ──────────────────────────────────────────────────────────────────
function EvalView() {
  const [data, setData] = useState<EvalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function load(run = false) {
    setLoading(true); setError(null);
    try { setData(await opsEval(run)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(false); }, []);
  if (loading && !data) {
    return (
      <p className="text-sm text-ink-400">로딩 중… (라이브 실행은 30s+ 소요)</p>
    );
  }
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  const passPct = (data.pass_rate * 100).toFixed(0);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => load(false)}
          disabled={loading}
          className="px-3 py-1.5 rounded-md border border-ink-700 text-ink-200 text-xs disabled:opacity-50 hover:bg-ink-800"
        >
          <RefreshCcw className="w-3 h-3 inline mr-1.5" /> 캐시
        </button>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="px-3 py-1.5 rounded-md bg-accent-500 text-ink-950 text-xs font-semibold disabled:bg-ink-700"
        >
          {loading ? "실행 중…" : "라이브 실행 (30 쿼리)"}
        </button>
        <span className="text-xs text-ink-400">
          cached at {new Date(data.cached_at_unix * 1000).toLocaleTimeString()}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pass Rate" value={`${passPct}%`} />
        <Stat label="Passes" value={`${data.passes} / ${data.total}`} />
        <Stat label="Avg Latency" value={`${data.avg_latency_ms}ms`} mono />
      </div>
      <Section title={`${data.total} mfg-domain wow queries`}>
        <ul className="space-y-1.5 text-xs">
          {data.rows.map((r, i) => (
            <li
              key={i}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-ink-700 bg-ink-800"
            >
              {r.error ? (
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : r.passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              )}
              <span className="flex-1 text-ink-100 truncate">{r.q}</span>
              <span className="text-[10px] font-mono text-ink-400">hits {r.hit_count}</span>
              <span className="text-[10px] font-mono text-ink-400">{r.latency_ms}ms</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ─── Trace ─────────────────────────────────────────────────────────────────
function TraceView() {
  const [data, setData] = useState<TraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  async function load() {
    setLoading(true); setError(null);
    try { setData(await opsTrace(100)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  if (loading && !data) return <p className="text-sm text-ink-400">로딩 중…</p>;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  const filtered = data.events.filter((e) =>
    !filter ||
    e.tool.toLowerCase().includes(filter.toLowerCase()) ||
    e.session_id.includes(filter) ||
    e.actor_id.includes(filter),
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <RefreshButton onClick={load} loading={loading} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="도구명 / 세션 / 액터 필터"
          className="rounded bg-ink-800 border border-ink-700 px-3 py-1.5 text-xs text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500 flex-1 max-w-xs"
        />
        <span className="text-xs text-ink-400 ml-auto">
          {filtered.length} / {data.total} 이벤트
        </span>
      </div>
      {data.events.length === 0 && (
        <div className="p-4 rounded border border-dashed border-ink-700 text-xs text-ink-500 italic text-center">
          트레이스가 없습니다 — /chat에서 메시지를 보내면 도구 호출이 여기에 기록됩니다.
        </div>
      )}
      <ul className="space-y-2">
        {filtered.map((e, i) => (
          <li key={i} className="p-3 rounded border border-ink-700 bg-ink-800">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Wrench className="w-3.5 h-3.5 text-accent-300 shrink-0" />
              <span className="font-mono text-xs font-semibold text-accent-200">{e.tool}</span>
              <span className="text-[10px] font-mono text-ink-500">
                @ {new Date(e.ts * 1000).toLocaleTimeString()}
              </span>
              <span className="ml-auto text-[10px] font-mono text-ink-400 truncate max-w-[180px]">
                session: {e.session_id.slice(-8) || "—"}
              </span>
              <span className="text-[10px] font-mono text-orange-300 truncate max-w-[120px]">
                actor: {e.actor_id}
              </span>
            </div>
            <pre className="text-[10px] text-ink-300 overflow-x-auto whitespace-pre-wrap break-all leading-snug font-mono">
              {JSON.stringify(e.input, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── shared bits ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-3 py-2.5 rounded-md border border-ink-700 bg-ink-800">
      <div className="text-[10px] text-ink-400 font-mono">{label}</div>
      <div className={`text-sm text-ink-100 ${mono ? "font-mono" : "font-semibold"} truncate`}>
        {value}
      </div>
    </div>
  );
}
function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="p-3 rounded-md bg-red-500/10 text-red-300 border border-red-500/30 text-sm">
      {msg}
    </div>
  );
}
function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-3 py-1.5 rounded-md border border-ink-700 text-ink-200 text-xs hover:bg-ink-800 disabled:opacity-50"
    >
      <RefreshCcw className="w-3 h-3 inline mr-1.5" /> {loading ? "로딩…" : "새로고침"}
    </button>
  );
}
