"use client";
import { useRef, useState } from "react";
import { eightDStream } from "@/lib/api-client";
import { useActivePersona } from "@/lib/persona-context";
import { MarkdownView } from "@/components/MarkdownView";
import type { Persona } from "@/lib/types";
import { ScenarioHeader } from "@/components/ScenarioHeader";

type Sample = { label: string; persona: Persona; incidentId: string };

interface EightDSection { section: string; title: string; content: string }
interface IncidentMeta {
  id?: string; title?: string; severity?: string;
  component_id?: string; plant_id?: string;
  _synthetic?: boolean; [k: string]: unknown;
}

const EIGHTD_INCIDENTS: Sample[] = [
  { label: "INC-2026-0412 (BGA 솔더볼 균열, CRITICAL)",            persona: "quality",  incidentId: "INC-2026-0412" },
  { label: "INC-2026-0050 (PCB 박리, HIGH)",                       persona: "quality",  incidentId: "INC-2026-0050" },
  { label: "INC-2026-0100 (커패시터 누설, MID)",                   persona: "engineer", incidentId: "INC-2026-0100" },
];

const PERSONA_TONE: Record<Persona, string> = {
  buyer:    "border-blue-500/40    bg-blue-500/10    text-blue-200",
  engineer: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  quality:  "border-amber-500/40   bg-amber-500/10   text-amber-200",
  scm:      "border-rose-500/40    bg-rose-500/10    text-rose-200",
  plant:    "border-violet-500/40  bg-violet-500/10  text-violet-200",
};

const PERSONA_LABEL: Record<Persona, string> = {
  buyer:    "Buyer 구매",
  engineer: "Engineer R&D",
  quality:  "Quality 품질",
  scm:      "SCM 공급망",
  plant:    "Plant 생산",
};

// Phase chip palette mirrors the chat page so the UX feels consistent.
const PHASE_META: Record<string, { label: string; tone: string }> = {
  neptune: { label: "지식 그래프 조회",   tone: "border-sky-500/40    bg-sky-500/10    text-sky-200" },
  kb:      { label: "KB 유사 사례 검색", tone: "border-violet-500/40 bg-violet-500/10 text-violet-200" },
  bedrock: { label: "Sonnet 4.6 8D 작성", tone: "border-orange-500/40 bg-orange-500/10 text-orange-200" },
};

interface Phase {
  name: string;
  label: string;
  detail?: string;
  duration?: number;
  done: boolean;
}

export default function EightDPage() {
  const { active, setActive } = useActivePersona();
  const [incidentId, setIncidentId] = useState("INC-2026-0412");
  const [phases, setPhases] = useState<Phase[]>([]);
  const [markdown, setMarkdown] = useState<string>("");
  const [sections, setSections] = useState<EightDSection[]>([]);
  const [incidentMeta, setIncidentMeta] = useState<IncidentMeta | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const [totalS, setTotalS] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  function runEightD(id?: string) {
    const target = (id ?? incidentId).trim();
    if (!target || streaming) return;
    setStreaming(true);
    setError(null);
    setFallback(false);
    setSynthetic(false);
    setMarkdown("");
    setSections([]);
    setIncidentMeta(null);
    setPhases([]);
    setTotalS(null);

    cancelRef.current = eightDStream(target, (event) => {
      const ev = event as { type: string; [k: string]: unknown };

      if (ev.type === "phase") {
        const name = String(ev.phase ?? "");
        const meta = PHASE_META[name] ?? { label: name, tone: "" };
        setPhases((p) => [...p, {
          name,
          label: String(ev.label ?? meta.label),
          done: false,
        }]);
      } else if (ev.type === "phase_done") {
        const name = String(ev.phase ?? "");
        const detail = ev.detail ? String(ev.detail) : undefined;
        const duration = typeof ev.duration_s === "number" ? ev.duration_s : undefined;
        setPhases((p) => {
          const idx = p.findIndex((x) => x.name === name && !x.done);
          if (idx < 0) return p;
          const next = [...p];
          next[idx] = { ...next[idx], detail, duration, done: true };
          return next;
        });
      } else if (ev.type === "result") {
        setMarkdown(String(ev.markdown ?? ""));
        setSections(Array.isArray(ev.sections) ? (ev.sections as EightDSection[]) : []);
        setIncidentMeta((ev.incident as IncidentMeta) ?? null);
        setFallback(Boolean(ev.fallback));
        setSynthetic(Boolean(ev.synthetic));
        if (typeof ev.total_s === "number") setTotalS(ev.total_s);
      } else if (ev.type === "error") {
        setError(String(ev.message ?? "알 수 없는 오류"));
      } else if (ev.type === "stop") {
        setStreaming(false);
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runEightD();
  }

  function copyMarkdown() {
    if (!markdown) return;
    navigator.clipboard?.writeText(markdown).catch(() => {});
  }

  function downloadMarkdown() {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `8d-${incidentId}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // PDF: render an off-screen white-themed structured DOM (header + 8 D-section
  // cards) and rasterize with html2canvas → multi-page jsPDF. Mirrors the chat
  // page export pattern but tailored to the 8D AIAG layout.
  async function downloadPdf() {
    if (!markdown || exporting) return;
    setExporting(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const host = document.createElement("div");
      host.style.position = "fixed";
      host.style.left = "-10000px";
      host.style.top = "0";
      host.style.width = "760px";
      host.style.padding = "28px 32px";
      host.style.background = "#ffffff";
      host.style.color = "#111";
      host.style.fontFamily = "'Noto Sans KR', system-ui, sans-serif";
      host.style.fontSize = "13px";
      host.style.lineHeight = "1.65";

      const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
      const inc = incidentMeta ?? {};
      const incTitle = String(inc.title ?? incidentId);
      const incId = String(inc.id ?? incidentId);
      const severity = String(inc.severity ?? "—");
      const componentId = String(inc.component_id ?? "—");
      const plantId = String(inc.plant_id ?? "—");
      const mode = fallback
        ? "결정론적 폴백 (Bedrock 응답 지연 >25s)"
        : "Sonnet/Haiku tool-use 생성";

      const h1 = document.createElement("h1");
      h1.textContent = `8D Report — ${incId}`;
      h1.style.fontSize = "20px";
      h1.style.borderBottom = "2px solid #1f2937";
      h1.style.paddingBottom = "6px";
      h1.style.margin = "0 0 12px";
      host.appendChild(h1);

      const sub = document.createElement("div");
      sub.style.fontSize = "12px"; sub.style.color = "#374151";
      sub.style.marginBottom = "6px"; sub.style.fontWeight = "600";
      sub.textContent = incTitle;
      host.appendChild(sub);

      const meta = document.createElement("div");
      meta.style.fontSize = "11px"; meta.style.color = "#6b7280";
      meta.style.marginBottom = "4px";
      meta.textContent = `심각도 ${severity} · 부품 ${componentId} · 공장 ${plantId}`;
      host.appendChild(meta);

      const meta2 = document.createElement("div");
      meta2.style.fontSize = "11px"; meta2.style.color = "#6b7280";
      meta2.style.marginBottom = "16px";
      meta2.textContent = `생성 모드: ${mode}` +
        (totalS != null ? ` · 총 소요 ${totalS.toFixed(1)}s` : "") +
        ` · 추출 ${stamp}`;
      host.appendChild(meta2);

      // Render each D-section as a clean card. If the SSE result didn't
      // include `sections`, fall back to splitting markdown headings.
      const renderSections: EightDSection[] =
        sections.length > 0
          ? sections
          : (markdown.match(/^## D\d+ — .+$/gm) || []).map((h, i) => {
              const code = (h.match(/^## (D\d+) /)?.[1]) || `D${i + 1}`;
              const title = h.replace(/^## /, "");
              return { section: code, title, content: "" };
            });

      renderSections.forEach((s) => {
        const card = document.createElement("div");
        card.style.margin = "0 0 14px";
        card.style.padding = "12px 14px";
        card.style.border = "1px solid #d1d5db";
        card.style.borderLeft = "4px solid #f59e0b";
        card.style.borderRadius = "4px";
        card.style.background = "#fafafa";
        card.style.pageBreakInside = "avoid";

        const hdr = document.createElement("div");
        hdr.style.fontSize = "12px";
        hdr.style.fontWeight = "700";
        hdr.style.color = "#111827";
        hdr.style.marginBottom = "6px";
        hdr.textContent = `${s.section} — ${s.title}`;
        card.appendChild(hdr);

        const body = document.createElement("div");
        body.style.fontSize = "12px";
        body.style.lineHeight = "1.65";
        body.style.color = "#1f2937";
        body.style.whiteSpace = "pre-wrap";
        body.style.wordBreak = "break-word";
        body.textContent = s.content || "(생성된 내용 없음)";
        card.appendChild(body);

        host.appendChild(card);
      });

      const footer = document.createElement("div");
      footer.style.borderTop = "1px solid #e5e7eb";
      footer.style.paddingTop = "8px";
      footer.style.marginTop = "8px";
      footer.style.fontSize = "10px";
      footer.style.color = "#9ca3af";
      footer.textContent =
        "Ontology MFG · AIAG 8D Report · 합성 데이터 · 생성: " + stamp;
      host.appendChild(footer);

      document.body.appendChild(host);
      try {
        const canvas = await html2canvas(host, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const imgData = canvas.toDataURL("image/jpeg", 0.95);

        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft > 0) {
          position -= pageHeight;
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        pdf.save(`8d-${incidentId}-${Date.now()}.pdf`);
      } finally {
        host.remove();
      }
    } catch (e) {
      console.error("8D PDF export failed:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="J" title="8D / RCA" tech="Cypher 인시던트 + KB 유사 사례 → Sonnet 4.6 tool-use 8단계 강제 → SSE 진행 스트림" />
      <div className="flex-1 mx-auto max-w-4xl w-full px-6 py-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h1 className="text-2xl font-bold text-ink-50">8D 보고서 자동 생성</h1>
          {markdown && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyMarkdown}
                className="text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
                title="Markdown 복사"
              >
                MD 복사
              </button>
              <button
                type="button"
                onClick={downloadMarkdown}
                className="text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
                title="Markdown 다운로드"
              >
                MD 다운로드
              </button>
              <button
                type="button"
                onClick={downloadPdf}
                disabled={exporting}
                className="text-xs px-3 py-1.5 rounded-md border border-accent-500/50 bg-accent-500/10 text-accent-200 hover:bg-accent-500/20 transition disabled:opacity-50"
                title="PDF 다운로드 (A4, 8 D-section 카드 레이아웃)"
              >
                {exporting ? "PDF 생성 중…" : "PDF 다운로드"}
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-ink-400 mb-4">
          인시던트 ID 입력 → Neptune·KB·Bedrock 단계가 SSE로 실시간 표시되고 결과는 Markdown으로 렌더링됩니다.
        </p>

        {!streaming && phases.length === 0 && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              인시던트 선택 — 클릭하면 바로 생성됩니다
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EIGHTD_INCIDENTS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={streaming}
                  onClick={() => { setActive(p.persona); setIncidentId(p.incidentId); runEightD(p.incidentId); }}
                  className="group flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border border-ink-700 bg-ink-900 hover:border-accent-500/60 hover:bg-ink-800 transition disabled:opacity-50"
                >
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${PERSONA_TONE[p.persona]}`}>
                    {PERSONA_LABEL[p.persona]}
                  </span>
                  <span className="text-sm text-ink-200 leading-relaxed group-hover:text-accent-200">
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <input
            className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
            placeholder="인시던트 ID (예: INC-2026-0412)"
            value={incidentId}
            onChange={(e) => setIncidentId(e.target.value)}
            disabled={streaming}
          />
          <button
            type="submit"
            disabled={streaming}
            className="bg-accent-500 hover:bg-accent-400 text-ink-950 font-semibold px-4 py-2 rounded-md text-sm transition disabled:opacity-50"
          >
            {streaming ? "생성 중…" : "생성"}
          </button>
        </form>

        {/* Phase strip — chat-style live progress */}
        {(streaming || phases.length > 0) && (
          <div className="mb-4 rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${streaming ? "bg-orange-500 animate-pulse-soft" : "bg-emerald-500"}`} />
              {streaming ? `에이전트 진행 중 — ${phases.length}단계` : `완료 — ${totalS != null ? `${totalS.toFixed(1)}s` : ""}`}
            </div>
            <ol className="flex flex-wrap items-center gap-2">
              {phases.map((p, i) => {
                const meta = PHASE_META[p.name] ?? { label: p.label, tone: "border-slate-500/40 bg-slate-500/10 text-slate-200" };
                return (
                  <li
                    key={i}
                    className={[
                      "flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border",
                      meta.tone,
                      p.done ? "" : "animate-pulse-soft",
                    ].join(" ")}
                  >
                    <span className="text-[9px] opacity-60">{i + 1}.</span>
                    <span className="font-semibold">{meta.label}</span>
                    {p.done && p.duration != null && (
                      <span className="opacity-70">— {p.duration.toFixed(1)}s</span>
                    )}
                    {p.done && p.detail && <span className="opacity-70">· {p.detail}</span>}
                  </li>
                );
              })}
              {streaming && (
                <li className="text-[11px] font-mono px-2 py-1 rounded border border-ink-700 bg-ink-800/50 text-ink-400 animate-pulse-soft">
                  다음 단계…
                </li>
              )}
            </ol>
          </div>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-200 text-xs flex items-start gap-2">
            <span className="font-bold">⚠️ 오류</span>
            <span className="flex-1">{error}</span>
          </div>
        )}

        {fallback && markdown && (
          <div className="mb-4 px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs">
            ⓘ Bedrock 응답 지연으로 결정론적 폴백 템플릿이 사용되었습니다 — 실제 LLM 결과가 아닙니다.
          </div>
        )}

        {synthetic && !fallback && (
          <div className="mb-4 px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs">
            ⓘ Neptune에 해당 인시던트가 없어 데모용 메타데이터로 진행되었습니다.
          </div>
        )}

        {markdown && (
          <article className="rounded-lg border border-ink-700 bg-ink-900 p-6">
            <MarkdownView text={markdown} className="text-ink-200" />
          </article>
        )}
      </div>
    </div>
  );
}
