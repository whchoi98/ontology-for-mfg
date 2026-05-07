"use client";
import { useEffect, useState } from "react";
import { ExternalLink, FileText, Code2, Maximize2, Minimize2 } from "lucide-react";
import { ScenarioHeader } from "@/components/ScenarioHeader";

interface Manifest {
  total_nodes?: number;
  total_edges?: number;
  total_communities?: number;
  generated_at?: string;
  source_commit?: string;
  files_processed?: number;
  // Graphify versions vary the exact key names — render whatever it gives us.
  [k: string]: unknown;
}

const STATIC_BASE = "/codegraph";

export default function CodeGraphPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    fetch(`${STATIC_BASE}/manifest.json`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d) => setManifest(d as Manifest))
      .catch((e) => setManifestError(String(e)));
  }, []);

  // ESC exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Best-effort stat extraction — graphify schema isn't strictly versioned.
  const stats: Array<[string, string]> = [];
  if (manifest) {
    const nodes = (manifest.total_nodes as number) ?? (manifest.node_count as number);
    const edges = (manifest.total_edges as number) ?? (manifest.edge_count as number);
    const communities = (manifest.total_communities as number) ?? (manifest.community_count as number);
    const files = (manifest.files_processed as number) ?? (manifest.file_count as number);
    if (nodes != null) stats.push(["노드", String(nodes)]);
    if (edges != null) stats.push(["엣지", String(edges)]);
    if (communities != null) stats.push(["커뮤니티", String(communities)]);
    if (files != null) stats.push(["파일", String(files)]);
    const commit = manifest.source_commit as string | undefined;
    if (commit) stats.push(["커밋", commit.slice(0, 8)]);
  }

  // Fullscreen mode: iframe takes the whole viewport with a single dismiss button.
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-ink-950 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ink-700 bg-ink-900">
          <Code2 className="w-4 h-4 text-accent-400" />
          <span className="text-xs font-semibold text-ink-100">코드 지식 그래프</span>
          {stats.length > 0 && (
            <span className="text-[10px] font-mono text-ink-400 ml-2">
              {stats.map(([k, v]) => `${k} ${v}`).join(" · ")}
            </span>
          )}
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
            title="전체화면 해제 (ESC)"
          >
            <Minimize2 className="w-3.5 h-3.5" /> 해제 (ESC)
          </button>
        </div>
        <iframe
          title="graphify code graph (fullscreen)"
          src={`${STATIC_BASE}/graph.html`}
          className="flex-1 w-full"
          style={{ border: 0 }}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <ScenarioHeader
        title="코드 지식 그래프"
        tech="Graphify AST 기반 코드 그래프 (서드파티 스킬, LLM 미사용 빌드)"
      />

      <div className="flex-1 min-h-0 flex flex-col px-4 py-3">
        {/* Compact header row — keeps the iframe as tall as possible */}
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-accent-400" />
            <h1 className="text-base font-bold text-ink-50">코드 지식 그래프</h1>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
              graphify · AST-only
            </span>
          </div>

          {stats.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stats.map(([k, v]) => (
                <span
                  key={k}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-ink-700 bg-ink-900 text-ink-300"
                >
                  <span className="text-ink-500">{k}</span> <span className="text-ink-100">{v}</span>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-accent-500/50 bg-accent-500/10 text-accent-200 hover:bg-accent-500/20 transition font-semibold"
              title="페이지 안에서 전체화면 (ESC로 해제)"
            >
              <Maximize2 className="w-3.5 h-3.5" /> 전체화면
            </button>
            <a
              href={`${STATIC_BASE}/graph.html`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
              title="새 탭에서 열기"
            >
              <ExternalLink className="w-3.5 h-3.5" /> 새 탭
            </a>
            <a
              href={`${STATIC_BASE}/GRAPH_REPORT.md`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
              title="GRAPH_REPORT.md"
            >
              <FileText className="w-3.5 h-3.5" /> 리포트
            </a>
            <a
              href={`${STATIC_BASE}/graph.json`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
              title="graph.json"
            >
              JSON
            </a>
          </div>
        </div>

        {manifestError && (
          <p className="text-[11px] text-rose-300 mb-2">manifest.json 로드 실패 — {manifestError}</p>
        )}

        <div className="flex-1 min-h-0 rounded-lg border border-ink-700 bg-ink-950 overflow-hidden">
          <iframe
            title="graphify code graph"
            src={`${STATIC_BASE}/graph.html`}
            className="w-full h-full block"
            style={{ border: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
