"use client";

const STANDARDS = [
  // JEDEC
  { id: "JEDEC-JESD22", name: "JESD22 System", domain: "반도체", body: "JEDEC", applies_to: "Component", kr_note: "차량용 반도체 신뢰성 시험" },
  { id: "JEDEC-JESD47", name: "JESD47 Qualification", domain: "반도체", body: "JEDEC", applies_to: "Component", kr_note: "반도체 자격 인증 절차" },
  { id: "JEDEC-JEP106", name: "JEP106 Manufacturer ID", domain: "반도체", body: "JEDEC", applies_to: "Component", kr_note: "제조사 ID 코드" },
  // IPC
  { id: "IPC-A-610", name: "IPC-A-610 Acceptability", domain: "전자조립", body: "IPC", applies_to: "Component", kr_note: "전자 어셈블리 수락 기준 (Class 1/2/3)" },
  { id: "IPC-J-STD-001", name: "J-STD-001 Soldering", domain: "전자조립", body: "IPC", applies_to: "Component", kr_note: "납땜 요건" },
  { id: "IPC-6012", name: "IPC-6012 PCB", domain: "기판", body: "IPC", applies_to: "Module", kr_note: "경성 PCB 성능 기준" },
  // AEC-Q
  { id: "AEC-Q100", name: "AEC-Q100 IC Qual", domain: "차량반도체", body: "AEC", applies_to: "Component", kr_note: "집적회로 차량용 자격인증 Grade 0-3" },
  { id: "AEC-Q101", name: "AEC-Q101 Discrete", domain: "차량반도체", body: "AEC", applies_to: "Component", kr_note: "이산 반도체 차량용 자격인증" },
  { id: "AEC-Q200", name: "AEC-Q200 Passive", domain: "차량반도체", body: "AEC", applies_to: "Component", kr_note: "수동 부품 차량용 자격인증" },
  // IATF/ISO
  { id: "IATF-16949", name: "IATF 16949:2016", domain: "품질경영", body: "IATF", applies_to: "Supplier", kr_note: "자동차 품질경영시스템" },
  { id: "ISO-9001", name: "ISO 9001:2015", domain: "품질경영", body: "ISO", applies_to: "Supplier", kr_note: "일반 품질경영시스템" },
  { id: "ISO-14001", name: "ISO 14001:2015", domain: "환경경영", body: "ISO", applies_to: "Plant", kr_note: "환경경영시스템" },
  // REACH/RoHS
  { id: "REACH-SVHC", name: "REACH SVHC List", domain: "화학물질", body: "ECHA", applies_to: "Substance", kr_note: "고위험 우려 물질 240+ 목록" },
  { id: "ROHS-2011-65", name: "RoHS Annex II", domain: "화학물질", body: "EU", applies_to: "Substance", kr_note: "유해물질 제한 지침 (10종 물질)" },
  { id: "PFAS-REACH", name: "PFAS under REACH", domain: "화학물질", body: "EU", applies_to: "Substance", kr_note: "불소화합물 제한 규정 (2026 발효)" },
  // CBAM/IRA
  { id: "EU-CBAM-2026", name: "EU CBAM 2026", domain: "탄소세", body: "EU", applies_to: "CarbonScope", kr_note: "탄소국경조정메커니즘 — 철강/알루미늄 등" },
  { id: "IRA-2022", name: "IRA 2022", domain: "통상", body: "US", applies_to: "TradeLane", kr_note: "인플레이션감축법 — 전기차 배터리 국내 함량" },
  { id: "USMCA-2020", name: "USMCA 2020", domain: "통상", body: "US/MX/CA", applies_to: "TradeLane", kr_note: "미국-멕시코-캐나다 협정 원산지 규정" },
];

export default function StandardsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">메타 · 표준 매핑</div>
        <span className="ml-3 text-[10px] text-ink-500">{STANDARDS.length} 표준 · JEDEC / IPC / AEC-Q / IATF / ISO / REACH / CBAM</span>
      </header>
      <div className="flex-1 p-6 overflow-x-auto">
        <h1 className="text-2xl font-bold text-ink-50 mb-6">표준 매핑</h1>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-ink-800">
              {["표준 ID","표준명","도메인","발행기관","적용 클래스","한국 어댑터 노트"].map((h) => (
                <th key={h} className="border border-ink-700 px-3 py-2.5 text-left text-xs text-ink-300 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STANDARDS.map((s, i) => (
              <tr key={s.id} className={`border-b border-ink-700/40 ${i % 2 === 0 ? "bg-ink-900" : "bg-ink-800/50"} hover:bg-ink-800`}>
                <td className="border border-ink-700/30 px-3 py-2 font-mono text-xs text-accent-300">{s.id}</td>
                <td className="border border-ink-700/30 px-3 py-2 text-ink-100 font-medium">{s.name}</td>
                <td className="border border-ink-700/30 px-3 py-2">
                  <span className="px-2 py-0.5 rounded text-[10px] bg-ink-700 text-ink-300">{s.domain}</span>
                </td>
                <td className="border border-ink-700/30 px-3 py-2 text-ink-300">{s.body}</td>
                <td className="border border-ink-700/30 px-3 py-2 font-mono text-xs text-emerald-300">{s.applies_to}</td>
                <td className="border border-ink-700/30 px-3 py-2 text-ink-400 text-xs">{s.kr_note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
