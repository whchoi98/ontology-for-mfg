// web/components/KpiStrip.tsx
export function KpiStrip({ kpis }: { kpis: { label: string; value: string; delta?: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3">
      {kpis.map((k, i) => (
        <div key={i} className="bg-white border rounded-lg p-3">
          <div className="text-xs text-neutral-500">{k.label}</div>
          <div className="text-xl font-semibold">{k.value}</div>
          {k.delta && <div className="text-xs text-emerald-600 mt-1">{k.delta}</div>}
        </div>
      ))}
    </div>
  );
}
