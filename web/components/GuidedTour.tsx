'use client';

// 60-min guided tour — 12 scenarios A-L + 4 wow moments.
// Triggers on first visit (localStorage gate) and via topbar button.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Play, X, ChevronLeft, ChevronRight, Search, MessageSquare, BarChart3,
  FileSearch, ShieldCheck, ArrowLeftRight, Wallet, Truck, TrendingUp,
  ClipboardList, Leaf, Activity, BookOpen, Map,
} from 'lucide-react';

const STORAGE_KEY = 'ontology-mfg.tour-seen';

type Step = {
  badge: string;
  ko: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  pitch: string;
  try_it: string;
  tech: string;
  wow?: boolean;
};

const STEPS: Step[] = [
  {
    badge: '시작',
    ko: '60분 가이드 투어',
    href: '/',
    icon: Map,
    pitch: 'AMZN Tech Hi-Tech MFG 온톨로지 데모입니다 — Bedrock + AgentCore + Neptune 위에 12개 시나리오(A-L)가 올라갑니다. 5개 페르소나(Buyer·Engineer·Quality·SCM·Plant)가 동일한 그래프를 다른 시점에서 봅니다.',
    try_it: '우상단 페르소나 버튼으로 역할을 선택해두면 모든 시나리오가 해당 페르소나 시점을 반영합니다.',
    tech: 'Next.js 14 + FastAPI + Bedrock Sonnet 4.6 + AgentCore Memory/Code Interpreter + Neptune + OpenSearch Serverless',
  },
  {
    badge: 'A',
    ko: '의미 검색',
    href: '/search',
    icon: Search,
    wow: true,
    pitch: '자연어 질의를 BM25(한국어/영문) + Cohere KNN 하이브리드로 인덱싱하고 Bedrock Reranker로 정렬합니다. 결과는 Cytoscape 1-hop 그래프로 실시간 시각화됩니다.',
    try_it: '"차량용 -40°C 보장 BGA 패키지" 검색 — 우측 그래프에서 공급사·표준·규제 간 연결을 확인하세요. ★ WOW: Cytoscape 그래프 노드 클릭 시 세부 부품 트리 자동 확장',
    tech: 'OpenSearch Serverless · Cohere embed-v4 · cohere.rerank-v3 · Neptune openCypher 1-hop',
  },
  {
    badge: 'B',
    ko: '대화형 에이전트',
    href: '/chat',
    icon: MessageSquare,
    wow: true,
    pitch: 'Bedrock Converse 다회차 + AgentCore Memory short/long-term + 4개 tool(memory_recall, neptune_subgraph, semantic_search, kb_lookup) + Guardrails 4-topic 스크럽 — 도구 호출이 SSE 스트리밍으로 실시간 표시됩니다.',
    try_it: '"COMP-CAP-2023 부품의 REACH SVHC 위반 가능성이 있나?" — ★ WOW: Memory 패널에서 이전 세션 기억 재활성화 + Guardrail 발동 로그 확인',
    tech: 'Bedrock Converse Stream · AgentCore Memory · Bedrock Guardrails · 4 tool definitions',
  },
  {
    badge: 'C',
    ko: '인사이트',
    href: '/insights',
    icon: BarChart3,
    pitch: 'Neptune 집계 쿼리 → Sonnet 4.6 한국어 답변 (토큰 스트리밍) → AgentCore Code Interpreter 샌드박스에서 차트 렌더링.',
    try_it: '"지난 6개월간 납기 지연이 가장 많은 협력사 Top 5는?" — 답변이 흐른 뒤 차트가 도착합니다.',
    tech: 'Neptune openCypher · Bedrock Converse Stream · AgentCore Code Interpreter Firecracker',
  },
  {
    badge: 'D',
    ko: '스펙 매치',
    href: '/spec',
    icon: FileSearch,
    pitch: '자연어 요구사항을 그래프 워크 + 유사도 점수로 후보 부품 목록과 표준 커버리지로 매핑합니다.',
    try_it: '"동작 온도 -40~125°C, AEC-Q100 Grade 0, SOP-8 패키지" — 후보 부품과 규격 그래프를 확인하세요.',
    tech: 'Neptune graph traversal · Cohere embed · spec similarity scoring',
  },
  {
    badge: 'E',
    ko: '규제 검증',
    href: '/compliance',
    icon: ShieldCheck,
    pitch: 'REACH SVHC / RoHS / PFAS / AEC-Q 표준 준수 여부를 부품 ID 입력만으로 즉시 확인합니다.',
    try_it: '"COMP-MCU-001" 입력 — 위반 사항과 세부 규정 경로가 함께 표시됩니다.',
    tech: 'Neptune COMPLIES_WITH / CONTAINS_SUBSTANCE edges · REACH 240+ SVHC list',
  },
  {
    badge: 'F',
    ko: '대체 부품',
    href: '/substitute',
    icon: ArrowLeftRight,
    pitch: '공급 중단·단종 시 동일 기능·다른 공급사의 대안을 공유 표준·전기 특성 유사도로 산출합니다.',
    try_it: '"COMP-MCU-001" → 대체 후보와 공통 규격 그래프가 나타납니다.',
    tech: 'Neptune COMPATIBLE_WITH traversal · shared standard scoring',
  },
  {
    badge: 'G',
    ko: '단가/재고 비교',
    href: '/price',
    icon: Wallet,
    pitch: '특정 부품에 대한 복수 공급사별 단가·납기·OTD를 매트릭스로 비교합니다.',
    try_it: '"COMP-CAP-2023" — 공급사별 단가 차이와 납기 일수를 바로 비교하세요.',
    tech: 'Neptune SUPPLIES edges · price/lead-time synthesis · OTD aggregation',
  },
  {
    badge: 'H',
    ko: '글로벌 SCM lane',
    href: '/lane',
    icon: Truck,
    wow: true,
    pitch: '7개국 trade lane 지도 + IRA/USMCA 관세 이벤트 reroute 시뮬레이션. 규제 변화 시 최적 대체 경로를 자동 산출합니다.',
    try_it: '"Trigger IRA 2026" 버튼 클릭 — ★ WOW: 멕시코 및 중국 경유 lane이 즉시 재계산되고 지도 위 경로가 바뀌는 것을 확인하세요.',
    tech: 'Neptune TradeLane traversal · regulation-aware reroute · SCMMap visualization',
  },
  {
    badge: 'I',
    ko: '협력사 RFM',
    href: '/rfm',
    icon: TrendingUp,
    pitch: 'Recency·Frequency·Monetary 기반 협력사 등급 분석. Tier별 상위 공급사와 납기 신뢰도를 한 화면에.',
    try_it: '"Tier 1" 선택 후 조회 — RFM 합산 점수 상위 공급사와 세부 R·F·M 값을 비교하세요.',
    tech: 'Neptune supplier RFM aggregation · tier-based filtering',
  },
  {
    badge: 'J',
    ko: '8D / RCA',
    href: '/eight-d',
    icon: ClipboardList,
    wow: true,
    pitch: '품질 인시던트 ID 입력만으로 D1-D8 전체 보고서를 자동 생성합니다. 근본 원인 + 시정 조치 + 재발 방지까지 Bedrock이 초안을 작성합니다.',
    try_it: '"INC-2026-0412" 입력 → ★ WOW: 15초 안에 8개 섹션 전체 8D 보고서가 완성됩니다.',
    tech: 'Bedrock Sonnet 4.6 · Neptune QualityIncident + RootCause graph · 8D template generation',
  },
  {
    badge: 'K',
    ko: 'ESG / CBAM',
    href: '/esg',
    icon: Leaf,
    pitch: '공장별 Scope 1/2/3 탄소 배출량과 EU CBAM 2026 부담금을 산출합니다. IRA 세액 공제 적격 여부도 함께 확인.',
    try_it: '"PLANT-KR-01" 선택 — Scope별 배출 KPI와 CBAM 예상 비용이 표시됩니다.',
    tech: 'Neptune ESGIndicator + CarbonScope · CBAM 2026 rate tables · IRA domestic content check',
  },
  {
    badge: 'L',
    ko: 'PdM / IoT',
    href: '/pdm',
    icon: Activity,
    pitch: '공장 IoT 센서 텔레메트리 실시간 모니터링 + 예지 보전 알람. 임계값 초과 센서를 즉시 식별하고 정비 일정을 추천합니다.',
    try_it: '"PLANT-VN-01" 선택 — 센서 테이블에서 CRITICAL 상태 항목과 알람 목록을 확인하세요.',
    tech: 'Neptune Telemetry + MaintenanceEvent · threshold alerting · predictive maintenance scoring',
  },
  {
    badge: '메타',
    ko: '온톨로지 / KG 탐색 / 운영',
    href: '/schema',
    icon: BookOpen,
    pitch: '시나리오 외에도 — 22 클래스 온톨로지 ER 다이어그램 / 표준 매핑 (JEDEC·IPC·AEC-Q·IATF·REACH·CBAM) / 검증 리포트 / 22종 객체 탐색 / 운영 콘솔이 좌측 사이드바에 모두 들어 있습니다.',
    try_it: '/schema에서 22 클래스 ER을 둘러보고, /validation에서 노드·엣지 수가 스펙과 일치하는지 확인하세요.',
    tech: 'Cytoscape ER · Neptune node/edge count validation · in-process trace ring buffer',
  },
];

export function GuidedTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = setTimeout(() => setOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);

  const closeAndRemember = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  const cur = STEPS[step];
  const Icon = cur.icon;

  return (
    <>
      <button
        onClick={() => { setStep(0); setOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent-500/40 bg-accent-500/10 text-accent-200 text-xs font-medium hover:bg-accent-500/15 transition"
        title="60분 가이드 투어"
      >
        <Play className="w-3.5 h-3.5" />
        가이드
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl mx-4 rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
            <button
              onClick={closeAndRemember}
              className="absolute top-3 right-3 p-1.5 rounded hover:bg-ink-800 text-ink-400"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className={[
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  cur.wow
                    ? 'bg-gradient-to-br from-orange-400 to-orange-600'
                    : 'bg-gradient-to-br from-accent-400 to-accent-600',
                ].join(' ')}>
                  <Icon className="w-5 h-5 text-ink-950" />
                </div>
                <div>
                  <div className="text-[10px] font-mono tracking-wider text-accent-300 flex items-center gap-2">
                    {cur.badge} · {step + 1} / {STEPS.length}
                    {cur.wow && (
                      <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 text-[9px] font-bold uppercase tracking-wider">
                        WOW
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-ink-50">{cur.ko}</h2>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-ink-200 mb-4">{cur.pitch}</p>

              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 mb-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 mb-1">
                  지금 해보기
                </div>
                <p className="text-xs text-ink-200">{cur.try_it}</p>
              </div>

              <div className="text-[10px] font-mono text-ink-500 mb-5">
                {cur.tech}
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-ink-700 text-ink-300 text-xs disabled:opacity-30 hover:bg-ink-800"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> 이전
                </button>

                <Link
                  href={cur.href}
                  onClick={closeAndRemember}
                  className="px-3 py-1.5 rounded bg-accent-500 text-ink-950 text-xs font-semibold hover:bg-accent-400"
                >
                  이 시나리오 열기 →
                </Link>

                {step < STEPS.length - 1 ? (
                  <button
                    onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-ink-800 border border-ink-700 text-ink-100 text-xs hover:border-accent-500"
                  >
                    다음 <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={closeAndRemember}
                    className="px-3 py-1.5 rounded bg-emerald-500 text-ink-950 text-xs font-semibold hover:bg-emerald-400"
                  >
                    완료
                  </button>
                )}
              </div>

              <div className="mt-5 flex justify-center gap-1">
                {STEPS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={[
                      'h-1.5 rounded-full transition-all',
                      i === step
                        ? 'w-8 ' + (s.wow ? 'bg-orange-400' : 'bg-accent-400')
                        : 'w-1.5 bg-ink-700 hover:bg-ink-600',
                    ].join(' ')}
                    aria-label={`스텝 ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
