import Link from 'next/link';
import {
  Search, MessageSquare, BarChart3, FileSearch, ShieldCheck, ArrowLeftRight,
  Wallet, Truck, TrendingUp, ClipboardList, Leaf, Activity,
  Network, ArrowRight, Package, Boxes, Cpu, Layers, Factory,
  Building2, Building, Briefcase, MapPin, BookOpen, Award, Scale,
  FlaskConical, AlertTriangle, Wrench, Cloud, GitBranch,
} from 'lucide-react';

type Scenario = {
  href: string;
  tag: string;
  title: string;
  desc: string;
  color: 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'cyan' | 'sky' | 'teal' | 'orange' | 'fuchsia' | 'yellow' | 'lime' | 'pink';
  icon: React.ComponentType<{ className?: string }>;
};

const SCENARIOS: Scenario[] = [
  { href: '/search',     tag: 'A', title: '의미 검색',       desc: '자연어 → BM25 + Cohere KNN 하이브리드 + Reranker → 1-hop 그래프 시각화.',                    color: 'blue',    icon: Search },
  { href: '/chat',       tag: 'B', title: '대화형 에이전트',  desc: 'Bedrock Converse + AgentCore Memory + Guardrails 4-topic + 4개 도구 호출 SSE 스트리밍.',  color: 'emerald', icon: MessageSquare },
  { href: '/insights',   tag: 'C', title: '인사이트',         desc: 'Neptune 집계 + Sonnet 4.6 스트리밍 + AgentCore Code Interpreter 차트.',                     color: 'amber',   icon: BarChart3 },
  { href: '/spec',       tag: 'D', title: '스펙 매치',        desc: '자연어 요구사항 → 후보 부품 + AEC-Q/IPC/JEDEC 표준 커버리지 그래프.',                        color: 'violet',  icon: FileSearch },
  { href: '/compliance', tag: 'E', title: '규제 검증',        desc: 'REACH SVHC / RoHS / PFAS / AEC-Q 준수 여부 즉시 확인 — 위반 경로 추적.',                    color: 'rose',    icon: ShieldCheck },
  { href: '/substitute', tag: 'F', title: '대체 부품',        desc: '공급 중단 시 동일 기능 + 공유 표준 기반 대안 산출.',                                          color: 'cyan',    icon: ArrowLeftRight },
  { href: '/price',      tag: 'G', title: '단가/재고 비교',   desc: '복수 공급사별 단가·납기·OTD 매트릭스 비교.',                                                  color: 'sky',     icon: Wallet },
  { href: '/lane',       tag: 'H', title: '글로벌 SCM lane', desc: '7개국 trade lane + IRA/USMCA 이벤트 reroute 시뮬레이션.',                                    color: 'teal',    icon: Truck },
  { href: '/rfm',        tag: 'I', title: '협력사 RFM',      desc: 'Recency·Frequency·Monetary 협력사 등급 + Tier별 납기 신뢰도.',                               color: 'orange',  icon: TrendingUp },
  { href: '/eight-d',    tag: 'J', title: '8D / RCA',        desc: '품질 인시던트 ID → D1-D8 전체 보고서 자동 생성 + 근본 원인 그래프.',                           color: 'fuchsia', icon: ClipboardList },
  { href: '/esg',        tag: 'K', title: 'ESG / CBAM',      desc: 'Scope 1/2/3 탄소 배출량 + EU CBAM 2026 부담금 + IRA 적격 여부.',                            color: 'lime',    icon: Leaf },
  { href: '/pdm',        tag: 'L', title: 'PdM / IoT',       desc: '공장 IoT 텔레메트리 + 예지 보전 알람 + 정비 이벤트 추천.',                                    color: 'pink',    icon: Activity },
];

const CARD_COLOR: Record<Scenario['color'], string> = {
  blue:    'from-blue-500/20 to-blue-500/0 border-blue-500/40',
  emerald: 'from-emerald-500/20 to-emerald-500/0 border-emerald-500/40',
  amber:   'from-amber-500/20 to-amber-500/0 border-amber-500/40',
  violet:  'from-violet-500/20 to-violet-500/0 border-violet-500/40',
  rose:    'from-rose-500/20 to-rose-500/0 border-rose-500/40',
  cyan:    'from-cyan-500/20 to-cyan-500/0 border-cyan-500/40',
  sky:     'from-sky-500/20 to-sky-500/0 border-sky-500/40',
  teal:    'from-teal-500/20 to-teal-500/0 border-teal-500/40',
  orange:  'from-orange-500/20 to-orange-500/0 border-orange-500/40',
  fuchsia: 'from-fuchsia-500/20 to-fuchsia-500/0 border-fuchsia-500/40',
  yellow:  'from-yellow-500/20 to-yellow-500/0 border-yellow-500/40',
  lime:    'from-lime-500/20 to-lime-500/0 border-lime-500/40',
  pink:    'from-pink-500/20 to-pink-500/0 border-pink-500/40',
};

type ObjectType = {
  href: string;
  label_en: string;
  label_ko: string;
  count: string;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
};

const OBJECT_GROUPS: { title: string; types: ObjectType[] }[] = [
  {
    title: 'BOM 계층',
    types: [
      { href: '/objects/Product',     label_en: 'Product',     label_ko: '완제품',          count: '(50)',    color: '#60a5fa', icon: Package },
      { href: '/objects/Module',      label_en: 'Module',      label_ko: '모듈',            count: '(200)',   color: '#34d399', icon: Boxes },
      { href: '/objects/Component',   label_en: 'Component',   label_ko: '부품',            count: '(2,000)', color: '#fbbf24', icon: Cpu },
      { href: '/objects/RawMaterial', label_en: 'RawMaterial', label_ko: '원자재',          count: '(500)',   color: '#a78bfa', icon: Layers },
    ],
  },
  {
    title: 'Supply Chain',
    types: [
      { href: '/objects/Manufacturer',    label_en: 'Manufacturer',    label_ko: '제조사',        count: '(20)',  color: '#f472b6', icon: Factory },
      { href: '/objects/Supplier',        label_en: 'Supplier',        label_ko: '1차 협력사',    count: '(150)', color: '#fb923c', icon: Building2 },
      { href: '/objects/SubSupplier',     label_en: 'SubSupplier',     label_ko: '2차 협력사',    count: '(300)', color: '#94a3b8', icon: Building },
      { href: '/objects/CustomerAccount', label_en: 'CustomerAccount', label_ko: 'OEM 고객',     count: '(30)',  color: '#22d3ee', icon: Briefcase },
      { href: '/objects/Plant',           label_en: 'Plant',           label_ko: '공장',          count: '(12)',  color: '#0ea5e9', icon: Building2 },
    ],
  },
  {
    title: '표준·규제',
    types: [
      { href: '/objects/Standard',      label_en: 'Standard',      label_ko: '표준',      count: '(80)',  color: '#facc15', icon: BookOpen },
      { href: '/objects/Certification', label_en: 'Certification', label_ko: '인증',      count: '(200)', color: '#34d399', icon: Award },
      { href: '/objects/Regulation',    label_en: 'Regulation',    label_ko: '규제',      count: '(60)',  color: '#f87171', icon: Scale },
      { href: '/objects/Substance',     label_en: 'Substance',     label_ko: '화학물질',  count: '(240)', color: '#c084fc', icon: FlaskConical },
      { href: '/objects/Region',        label_en: 'Region',        label_ko: '지역 (7개국)', count: '',   color: '#38bdf8', icon: MapPin },
      { href: '/objects/TradeLane',     label_en: 'TradeLane',     label_ko: '운송 lane', count: '(40)', color: '#14b8a6', icon: Truck },
    ],
  },
  {
    title: '품질',
    types: [
      { href: '/objects/QualityIncident', label_en: 'QualityIncident', label_ko: '품질 인시던트', count: '(100)', color: '#fca5a5', icon: AlertTriangle },
      { href: '/objects/EightDReport',    label_en: 'EightDReport',    label_ko: '8D 리포트',    count: '(80)',  color: '#fdba74', icon: ClipboardList },
      { href: '/objects/RootCause',       label_en: 'RootCause',       label_ko: '근본원인',     count: '(200)', color: '#d9f99d', icon: GitBranch },
    ],
  },
  {
    title: '운영·ESG',
    types: [
      { href: '/objects/Telemetry',        label_en: 'Telemetry',        label_ko: '텔레메트리',   count: '(5,000)', color: '#6ee7b7', icon: Activity },
      { href: '/objects/MaintenanceEvent', label_en: 'MaintenanceEvent', label_ko: '정비 이벤트', count: '(300)',   color: '#93c5fd', icon: Wrench },
      { href: '/objects/ESGIndicator',     label_en: 'ESGIndicator',     label_ko: 'ESG 지표',    count: '(120)',   color: '#86efac', icon: Leaf },
      { href: '/objects/CarbonScope',      label_en: 'CarbonScope',      label_ko: '탄소 Scope',  count: '(36)',    color: '#a5b4fc', icon: Cloud },
    ],
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">홈 / 대시보드</div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-ink-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
            All systems operational
          </span>
        </div>
      </header>

      <div className="flex-1 px-8 py-10 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-accent-400 mb-2 font-semibold">
            AMZN Tech 온톨로지 데모 · Hi-Tech MFG · 12 시나리오 × 5 페르소나
          </p>
          <h1 className="text-4xl font-bold text-ink-50 leading-tight mb-3">
            부품·공급망·표준·품질 데이터를<br />
            <span className="text-accent-300">온톨로지 그래프</span>로 풀어내는 MFG 데모
          </h1>
          <p className="text-ink-300 leading-relaxed">
            JEDEC / IPC / AEC-Q / IATF 16949 / ISO 9001 + REACH / RoHS / CBAM / IRA / USMCA 표준에
            한국 Hi-Tech 어댑터를 매핑한 합성 데이터로, 12개 시나리오(의미 검색 → PdM/IoT)와
            22종 Knowledge Graph 객체 탐색을 한 화면에 제공합니다.
            우상단에서 페르소나를 전환하면 동일 시나리오가 5가지 시점으로 바뀝니다.
          </p>
        </div>

        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`group relative rounded-lg border bg-gradient-to-br ${CARD_COLOR[s.color]} bg-ink-800 p-5 hover:bg-ink-700/60 transition`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-md bg-ink-900 border border-ink-700 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-accent-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-accent-400 font-semibold">
                      시나리오 {s.tag}
                    </div>
                    <h3 className="text-base font-bold text-ink-50">{s.title}</h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-400 group-hover:text-accent-300 group-hover:translate-x-0.5 transition shrink-0" />
                </div>
                <p className="text-xs text-ink-300 leading-relaxed">{s.desc}</p>
              </Link>
            );
          })}
        </section>

        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-ink-100 flex items-center gap-2">
              <Network className="w-5 h-5 text-accent-400" />
              Knowledge Graph 객체 타입
            </h2>
            <span className="text-xs text-ink-400">22 types · Neptune openCypher · 합성 데이터</span>
          </div>

          {OBJECT_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1.5 mt-3">
                {g.title}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {g.types.map((t) => {
                  const Icon = t.icon;
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      className="group rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 flex items-center gap-2 hover:border-accent-500/60 hover:bg-ink-700/40 transition"
                    >
                      <div
                        className="w-7 h-7 rounded flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${t.color}22`, border: `1px solid ${t.color}55` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: t.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-ink-100 truncate">{t.label_en}</div>
                        <div className="text-[10px] text-ink-400 truncate">{t.label_ko} {t.count}</div>
                      </div>
                      <ArrowRight className="w-3 h-3 text-ink-500 group-hover:text-accent-400 group-hover:translate-x-0.5 transition shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <footer className="border-t border-ink-700 pt-6 text-xs text-ink-400">
          본 데모의 부품·공급사·공장·인시던트는 합성 데이터입니다.
          표준 매핑: JEDEC JESD22 · IPC-A-610 · AEC-Q100/Q101/Q200 · IATF 16949 · ISO 9001 ·
          REACH 240+ SVHC · RoHS Annex II · EU CBAM 2026 · IRA 2022 · USMCA Chapter 4.
        </footer>
      </div>
    </div>
  );
}
