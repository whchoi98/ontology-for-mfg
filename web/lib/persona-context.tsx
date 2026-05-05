"use client";

// PersonaContext — global "active persona" for the mfg demo.
// 5 fixed personas (buyer / engineer / quality / scm / plant).
// PersonaSwitch in the topbar writes; scenario pages read.
// Backed by localStorage so choice survives reload.

import { createContext, useContext, useEffect, useState } from "react";
import type { Persona } from "./types";

const STORAGE_KEY = "ontology-mfg.active-persona";

interface Ctx {
  active: Persona;
  setActive: (p: Persona) => void;
}

const PersonaContext = createContext<Ctx>({ active: "buyer", setActive: () => {} });

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = useState<Persona>("buyer");

  // Hydrate from localStorage on mount (client-only — SSR-safe).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && ["buyer","engineer","quality","scm","plant"].includes(raw)) {
        setActiveState(raw as Persona);
      }
    } catch {
      // ignore
    }
  }, []);

  const setActive = (p: Persona) => {
    setActiveState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch { /* ignore */ }
  };

  return (
    <PersonaContext.Provider value={{ active, setActive }}>
      {children}
    </PersonaContext.Provider>
  );
}

export function useActivePersona(): Ctx {
  return useContext(PersonaContext);
}
