"use client";
import { useEffect, useState } from "react";
import { ExternalLink, FileText, Code2 } from "lucide-react";
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

  useEffect(() => {
    fetch(`${STATIC_BASE}/manifest.json`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d) => setManifest(d as Manifest))
      .catch((e) => setManifestError(String(e)));
  }, []);

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

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader
        title="코드 지식 그래프"
        tech="Graphify AST 기반 코드 그래프 (서드파티 스킬, LLM 미사용 빌드)"
      />

      <div className="flex-1 mx-auto max-w-7xl w-full px-6 py-6 flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Code2 className="w-5 h-5 text-accent-400" />
              <h1 className="text-2xl font-bold text-ink-50">코드 지식 그래프</h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                graphify · AST-only
              </span>
            </div>
            <p className="text-sm text-ink-400">
              `ontology-for-mfg` 저장소를 graphify가 AST 추출 + Louvain 클러스터링으로 변환한 코드 그래프입니다.
              파일·심볼·import 경로 간 의존 관계를 인터랙티브하게 탐색할 수 있습니다.
            </p>
            {manifestError && (
              <p className="text-xs text-rose-300 mt-1">manifest.json 로드 실패 — {manifestError}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`${STATIC_BASE}/graph.html`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
              title="새 탭에서 전체 화면으로 열기"
            >
              <ExternalLink className="w-3.5 h-3.5" /> 새 탭
            </a>
            <a
              href={`${STATIC_BASE}/GRAPH_REPORT.md`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
              title="GRAPH_REPORT.md 원문"
            >
              <FileText className="w-3.5 h-3.5" /> 리포트
            </a>
            <a
              href={`${STATIC_BASE}/graph.json`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
              title="graph.json 다운로드"
            >
              JSON
            </a>
          </div>
        </div>

        {stats.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {stats.map(([k, v]) => (
              <span
                key={k}
                className="text-[11px] font-mono px-2 py-1 rounded border border-ink-700 bg-ink-900 text-ink-300"
              >
                <span className="text-ink-500">{k}</span> · <span className="text-ink-100">{v}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-[640px] rounded-lg border border-ink-700 bg-ink-950 overflow-hidden">
          <iframe
            title="graphify code graph"
            src={`${STATIC_BASE}/graph.html`}
            className="w-full h-full"
            style={{ minHeight: 640, border: 0 }}
            // sandbox kept permissive so vis-network can run scripts inside the iframe;
            // the document is bundled into our own /public so origin is same-site.
          />
        </div>

        <p className="mt-3 text-[11px] text-ink-500">
          그래프는 빌드 시점의 스냅샷입니다. 코드 변경 후 갱신은 저장소 루트에서 <code className="font-mono text-ink-400">graphify update .</code> 후 재배포로 반영됩니다.
        </p>
      </div>
    </div>
  );
}
