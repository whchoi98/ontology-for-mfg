'use client';

// Global persona-switch widget rendered top-right of layout.
// 5 fixed mfg personas (buyer / engineer / quality / scm / plant).
// No API call — list is hardcoded.

import { useRef, useState } from 'react';
import { ChevronDown, UserCheck } from 'lucide-react';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

const PERSONAS: { id: Persona; label: string; emoji: string }[] = [
  { id: 'buyer',    label: 'Buyer 구매',    emoji: '🛒' },
  { id: 'engineer', label: 'Engineer R&D', emoji: '⚙️' },
  { id: 'quality',  label: 'Quality 품질',  emoji: '✅' },
  { id: 'scm',      label: 'SCM 공급망',    emoji: '🚚' },
  { id: 'plant',    label: 'Plant 생산',    emoji: '🏭' },
];

const PERSONA_LABEL: Record<Persona, string> = {
  buyer:    'Buyer 구매',
  engineer: 'Engineer R&D',
  quality:  'Quality 품질',
  scm:      'SCM 공급망',
  plant:    'Plant 생산',
};

export function PersonaSwitch() {
  const { active, setActive } = useActivePersona();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!popRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  return (
    <div className="relative" ref={popRef} onBlur={handleBlur}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={[
          'flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-medium transition',
          active !== 'buyer'
            ? 'border-orange-500/40 bg-orange-500/10 text-orange-200 hover:bg-orange-500/15'
            : 'border-ink-700 bg-ink-800 text-ink-300 hover:border-ink-600',
        ].join(' ')}
      >
        <UserCheck className="w-3.5 h-3.5" />
        <span className="max-w-[140px] truncate">
          {PERSONA_LABEL[active]}
        </span>
        <ChevronDown className={`w-3 h-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[240px] rounded-lg border border-ink-700 bg-ink-900 shadow-xl shadow-black/50 z-50 overflow-hidden">
          <div className="py-1">
            {PERSONAS.map((p) => {
              const isActive = active === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => { setActive(p.id); setOpen(false); }}
                  className={[
                    'w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition',
                    isActive
                      ? 'bg-orange-500/15 text-orange-200'
                      : 'text-ink-300 hover:bg-ink-800',
                  ].join(' ')}
                >
                  <span className="text-base leading-none">{p.emoji}</span>
                  <span className="flex-1">{p.label}</span>
                  {isActive && (
                    <span className="text-[10px] font-mono text-orange-300">active</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
