'use client';

// Sidebar company-logo button. Default = AWS, click-cycles through presets
// and persists the choice in localStorage. Designed for live demo swap
// without a redeploy. To add a real brand logo, see public/logos/README.md.

import { useEffect, useState } from 'react';

export type LogoPreset = {
  id: string;
  label: string;
  src: string;
};

// Order matters — click cycles in this order. Add custom presets at the end
// (so AWS stays the default first item) or set NEXT_PUBLIC_DEFAULT_LOGO_PRESET.
export const LOGO_PRESETS: LogoPreset[] = [
  { id: 'aws',          label: 'AWS',                src: '/logos/aws.svg' },
  { id: 'demo-blue',    label: 'Demo (Blue)',        src: '/logos/demo-blue.svg' },
  { id: 'demo-emerald', label: 'Hi-Tech MFG Demo',   src: '/logos/demo-emerald.svg' },
  { id: 'demo-violet',  label: 'Auto Electronics',   src: '/logos/demo-violet.svg' },
];

const STORAGE_KEY = 'ontology-mfg.company-logo';
const DEFAULT_ID = process.env.NEXT_PUBLIC_DEFAULT_LOGO_PRESET || 'aws';

export function CompanyLogo() {
  const [presetId, setPresetId] = useState<string>(DEFAULT_ID);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && LOGO_PRESETS.some((p) => p.id === stored)) {
        setPresetId(stored);
      }
    } catch {
      // ignore quota / disabled storage
    }
    setHydrated(true);
  }, []);

  const cycle = () => {
    const idx = LOGO_PRESETS.findIndex((p) => p.id === presetId);
    const next = LOGO_PRESETS[(idx + 1) % LOGO_PRESETS.length];
    setPresetId(next.id);
    try {
      localStorage.setItem(STORAGE_KEY, next.id);
    } catch {
      // ignore
    }
  };

  const preset = LOGO_PRESETS.find((p) => p.id === presetId) ?? LOGO_PRESETS[0];

  // Defensive: if hydration produced an unexpected id, fall back to default.
  if (!hydrated && presetId !== DEFAULT_ID) {
    // unreachable in practice
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={`로고: ${preset.label} (클릭하여 다음 프리셋으로 변경)`}
      aria-label={`Cycle company logo, current: ${preset.label}`}
      className="shrink-0 w-9 h-9 rounded-md bg-white/5 hover:bg-white/10 ring-1 ring-white/10 hover:ring-white/20 flex items-center justify-center overflow-hidden transition"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preset.src}
        alt={preset.label}
        className="max-w-full max-h-full object-contain p-0.5"
      />
    </button>
  );
}
