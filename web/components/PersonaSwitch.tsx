// web/components/PersonaSwitch.tsx
"use client";
import { useRouter, usePathname } from "next/navigation";
import { Persona } from "@/lib/types";

const PERSONAS: { id: Persona; label: string; emoji: string }[] = [
  { id: "buyer",    label: "Buyer 구매",     emoji: "🛒" },
  { id: "engineer", label: "Engineer R&D",  emoji: "⚙️" },
  { id: "quality",  label: "Quality 품질",   emoji: "✅" },
  { id: "scm",      label: "SCM 공급망",     emoji: "🚚" },
  { id: "plant",    label: "Plant 생산",     emoji: "🏭" },
];

export function PersonaSwitch({ active }: { active: Persona }) {
  const router = useRouter();
  const path = usePathname();
  const root = path.split("/")[2] ?? "";  // /(buyer)/search → "search"
  return (
    <nav className="flex gap-2 p-3 border-b bg-white">
      {PERSONAS.map((p) => (
        <button key={p.id}
          onClick={() => router.push(`/(${p.id})/${root || ""}`)}
          className={`px-3 py-1.5 rounded-md text-sm transition ${
            active === p.id ? "bg-blue-600 text-white" : "bg-neutral-100 hover:bg-neutral-200"
          }`}>
          <span className="mr-1">{p.emoji}</span>{p.label}
        </button>
      ))}
    </nav>
  );
}
