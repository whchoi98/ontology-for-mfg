'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Search, MessageSquare, BarChart3, FileSearch, ShieldCheck,
  ArrowLeftRight, Wallet, Truck, TrendingUp, ClipboardList, Leaf,
  Activity, GitBranch, BookOpen, Package, Boxes, Cpu, Layers,
  Factory, Building2, Building, Briefcase, MapPin, Award, Scale,
  FlaskConical, AlertTriangle, Wrench, Cloud, Database, Brain,
  ListTree, Network, Sparkles, ChevronRight, ClipboardCheck, Code2,
} from 'lucide-react';

import { SidebarAuth } from './SidebarAuth';
import { CompanyLogo } from './CompanyLogo';

type Item = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string;
  match?: (path: string) => boolean;
};

type Section = { title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: '시나리오 (Scenarios)',
    items: [
      { href: '/',             icon: Home,            label: '홈' },
      { href: '/search',       icon: Search,          label: '의미 검색',       badge: 'A' },
      { href: '/chat',         icon: MessageSquare,   label: '대화형 에이전트',  badge: 'B' },
      { href: '/insights',     icon: BarChart3,       label: '인사이트',         badge: 'C' },
      { href: '/spec',         icon: FileSearch,      label: '스펙 매치',        badge: 'D' },
      { href: '/compliance',   icon: ShieldCheck,     label: '규제 검증',        badge: 'E' },
      { href: '/substitute',   icon: ArrowLeftRight,  label: '대체 부품',        badge: 'F' },
      { href: '/price',        icon: Wallet,          label: '단가/재고 비교',   badge: 'G' },
      { href: '/lane',         icon: Truck,           label: '글로벌 SCM lane', badge: 'H' },
      { href: '/rfm',          icon: TrendingUp,      label: '협력사 RFM',      badge: 'I' },
      { href: '/eight-d',      icon: ClipboardList,   label: '8D / RCA',        badge: 'J' },
      { href: '/esg',          icon: Leaf,            label: 'ESG / CBAM',      badge: 'K' },
      { href: '/pdm',          icon: Activity,        label: 'PdM / IoT',       badge: 'L' },
    ],
  },
  {
    title: '메타 (Ontology)',
    items: [
      { href: '/schema',     icon: GitBranch,     label: '온톨로지 스키마 (22 클래스)' },
      { href: '/standards',  icon: BookOpen,      label: '표준 매핑' },
      { href: '/validation', icon: ClipboardCheck, label: '검증 리포트' },
      { href: '/codegraph',  icon: Code2,         label: '코드 지식 그래프' },
    ],
  },
  {
    title: '객체 탐색 (Knowledge Graph)',
    items: [
      // BOM 계층 (4)
      { href: '/objects/Product',     icon: Package,        label: '완제품 (Product)' },
      { href: '/objects/Module',      icon: Boxes,          label: '모듈 (Module)' },
      { href: '/objects/Component',   icon: Cpu,            label: '부품 (Component)' },
      { href: '/objects/RawMaterial', icon: Layers,         label: '원자재 (RawMaterial)' },
      // Supply (5)
      { href: '/objects/Manufacturer',    icon: Factory,    label: '제조사 (Manufacturer)' },
      { href: '/objects/Supplier',        icon: Building2,  label: '1차 협력사 (Supplier)' },
      { href: '/objects/SubSupplier',     icon: Building,   label: '2차 협력사 (SubSupplier)' },
      { href: '/objects/CustomerAccount', icon: Briefcase,  label: 'OEM 고객 (CustomerAccount)' },
      { href: '/objects/Plant',           icon: Building2,  label: '공장 (Plant)' },
      // Geo / Lane (2)
      { href: '/objects/Region',      icon: MapPin,         label: '지역 (Region — 7개국)' },
      { href: '/objects/TradeLane',   icon: Truck,          label: '운송 lane (TradeLane)' },
      // 표준/규제 (4)
      { href: '/objects/Standard',      icon: BookOpen,       label: '표준 (Standard)' },
      { href: '/objects/Certification', icon: Award,          label: '인증 (Certification)' },
      { href: '/objects/Regulation',    icon: Scale,          label: '규제 (Regulation)' },
      { href: '/objects/Substance',     icon: FlaskConical,   label: '화학물질 (Substance)' },
      // 품질 (3)
      { href: '/objects/QualityIncident', icon: AlertTriangle,  label: '품질 인시던트 (QualityIncident)' },
      { href: '/objects/EightDReport',    icon: ClipboardList,  label: '8D 리포트 (EightDReport)' },
      { href: '/objects/RootCause',       icon: GitBranch,      label: '근본원인 (RootCause)' },
      // 운영/ESG (4)
      { href: '/objects/Telemetry',        icon: Activity,   label: '텔레메트리 (Telemetry)' },
      { href: '/objects/MaintenanceEvent', icon: Wrench,     label: '정비 이벤트 (MaintenanceEvent)' },
      { href: '/objects/ESGIndicator',     icon: Leaf,       label: 'ESG 지표 (ESGIndicator)' },
      { href: '/objects/CarbonScope',      icon: Cloud,      label: '탄소 Scope (CarbonScope)' },
    ],
  },
  {
    title: '파이프라인 (Ops)',
    items: [
      { href: '/ops/ingest',    icon: Database,    label: '데이터 적재' },
      { href: '/ops/guardrail', icon: ShieldCheck, label: '가드레일 (4 토픽)' },
      { href: '/ops/memory',    icon: Brain,       label: '메모리 히스토리' },
      { href: '/ops/eval',      icon: Activity,    label: '평가 결과' },
      { href: '/ops/trace',     icon: ListTree,    label: '도구 호출 트레이스' },
    ],
  },
];

function isActive(pathname: string, item: Item): boolean {
  if (item.match) return item.match(pathname);
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  return (
    <aside className="w-72 shrink-0 bg-ink-900 border-r border-ink-700 flex flex-col">
      <div className="h-14 flex items-center justify-between px-5 border-b border-ink-700 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 shrink-0 rounded-md bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
            <Network className="w-4 h-4 text-ink-950" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-100 leading-tight truncate">Ontology MFG</div>
            <div className="text-[10px] text-ink-400 leading-tight truncate">Hi-Tech Demo · v0.5.1</div>
          </div>
        </div>
        <CompanyLogo />
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-5 mb-1.5 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
              {section.title}
            </div>
            <ul>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={[
                        'flex items-center gap-2.5 mx-2 px-3 py-2 rounded text-sm transition-colors',
                        active
                          ? 'bg-accent-500/10 text-accent-200 ring-1 ring-accent-500/30'
                          : 'text-ink-200 hover:bg-ink-800 hover:text-ink-100',
                      ].join(' ')}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-accent-400' : 'text-ink-400'}`} />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className={[
                          'text-[10px] font-mono px-1.5 py-0.5 rounded',
                          active ? 'bg-accent-500/20 text-accent-300' : 'bg-ink-700 text-ink-300',
                        ].join(' ')}>
                          {item.badge}
                        </span>
                      )}
                      {active && <ChevronRight className="w-3 h-3 text-accent-400" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-700 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] text-ink-400">
          <Sparkles className="w-3 h-3 text-accent-400 shrink-0" />
          <span className="truncate">합성 데이터 · JEDEC / IPC / AEC-Q / IATF / REACH / CBAM</span>
        </div>
      </div>

      <SidebarAuth />
    </aside>
  );
}
