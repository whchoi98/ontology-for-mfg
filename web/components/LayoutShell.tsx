'use client';

/** Client-side chrome dispatcher.
 *
 *  Renders the standard 3-zone shell (Sidebar + main content + global
 *  FloatingChat launcher) on every route — EXCEPT `/manny` and any
 *  sub-path. `/manny` is the chat-only popup target loaded into a
 *  popup window (Firefox/Safari) or in-page iframe modal (Chrome
 *  popup-blocker workaround) by `FloatingChat`. In that popup context
 *  we want a clean full-bleed chat surface with no sidebar / top bar
 *  / floating button.
 *
 *  Pattern ported from ontology-for-gcc (`/cally` was the gcc analog).
 */
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { PersonaSwitch } from './PersonaSwitch';
import { GuidedTour } from './GuidedTour';
import FloatingChat from './FloatingChat';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const isPopup = pathname === '/manny' || pathname.startsWith('/manny/');

  if (isPopup) {
    // No sidebar, no top bar, no floating button — chat-only popup UX.
    return <>{children}</>;
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-end gap-3 px-6 h-12 bg-ink-950/85 backdrop-blur border-b border-ink-800/60 shrink-0">
            <GuidedTour />
            <PersonaSwitch />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </main>
      </div>
      <FloatingChat />
    </>
  );
}
