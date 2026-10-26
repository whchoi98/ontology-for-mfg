'use client';

/** Manny launcher — opens the popup chat (`/manny`) in a separate window
 *  on browsers that honor `window.open` features, with an in-page iframe
 *  modal fallback for Chrome / popup-blocked / cross-tab fallback cases.
 *
 *  Why the UA dance:
 *  - Firefox / Safari respect `features="popup=true,width=...,height=..."`
 *    and reliably open as a small floating window.
 *  - Chrome's Site Engagement Score policy can downgrade `window.open`
 *    with popup features to a regular new tab when the score is low — or
 *    the popup blocker may suppress it entirely. The user then loses the
 *    intended side-by-side "chat alongside main app" experience.
 *  - For Chrome we skip the popup attempt and render an iframe modal
 *    in-page. Same-origin iframe → Cognito cookies + SSE just work, so
 *    the chat surface inside the iframe is functionally identical to
 *    the popup-window version.
 *  - For any browser where the popup attempt fails at runtime (returns
 *    null / closed), we fall back to the modal too.
 *  - The modal is hidden, not unmounted, on close — the iframe (and its
 *    in-flight conversation / SSE stream) survives close → reopen. ESC
 *    inside the iframe is forwarded by /manny via a same-origin
 *    `postMessage` (see lib/manny-bridge.ts).
 *  - The popup uses a named target so repeated clicks focus the same
 *    window instead of spawning a new one each time.
 *
 *  Mascot: "Manny" — mirrors gcc's "Cally" sister-project pattern.
 *  Pattern ported from ontology-for-gcc's FloatingChat.
 */
import { useEffect, useRef, useState } from 'react';
import { Bot, X } from 'lucide-react';
import { useActivePersona } from '@/lib/persona-context';
import { isMannyCloseMessage } from '@/lib/manny-bridge';
import type { Persona } from '@/lib/types';

const PERSONA_LABEL: Record<Persona, string> = {
  buyer: '구매', engineer: 'R&D', quality: '품질', scm: 'SCM', plant: '생산',
};

const MFG_BRAND_GRADIENT = 'bg-gradient-to-br from-accent-700 via-accent-600 to-accent-400';

/** Named window target — reused across clicks instead of `_blank`. */
const MANNY_WINDOW_NAME = 'manny';

export default function FloatingChat() {
  const { active } = useActivePersona();
  const [modalOpen, setModalOpen] = useState(false);
  // Mounted on first open, then only hidden — keeps the iframe's chat alive.
  const [modalMounted, setModalMounted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const popupRef = useRef<Window | null>(null);

  function showModal() {
    setModalMounted(true);
    setModalOpen(true);
  }

  // ESC closes the iframe modal — from the parent page directly, or forwarded
  // by /manny when focus is inside the iframe.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalOpen(false); };
    const onMessage = (e: MessageEvent) => {
      if (isMannyCloseMessage(e, window.location.origin, iframeRef.current?.contentWindow)) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMessage);
    };
  }, [modalOpen]);

  function openMannyWindow() {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent;
    // Brave / Edge / Opera share Chromium but identify themselves; treat
    // those as Chrome-like (their popup-blocker behavior matches).
    const isChromium = /Chrome/.test(ua);
    if (isChromium) {
      showModal();
      return;
    }
    const existing = popupRef.current;
    if (existing && !existing.closed) {
      try { existing.focus(); } catch { /* focus is best-effort */ }
      return;
    }
    const url = `${window.location.origin}/manny`;
    const features = 'popup=true,width=480,height=760,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no';
    // Open the named target with an empty URL first: a window that is already
    // open (e.g. this page reloaded and lost popupRef) is returned as-is
    // instead of being navigated — which would wipe its conversation.
    const popup = window.open('', MANNY_WINDOW_NAME, features);
    if (!popup || popup.closed) {
      // Popup blocked or downgraded → in-page modal fallback.
      showModal();
      return;
    }
    try {
      if (popup.location.href === 'about:blank') popup.location.href = url;
    } catch {
      // Unreadable location → not our same-origin /manny page; load it.
      popup.location.href = url;
    }
    popupRef.current = popup;
    try { popup.focus(); } catch { /* cross-origin focus is fine to ignore */ }
  }

  return (
    <>
      {/* Floating launcher — bottom-right of every standard-shell page. */}
      <button
        type="button"
        onClick={openMannyWindow}
        className={`fixed bottom-6 right-6 z-40 w-16 h-16 rounded-full ${MFG_BRAND_GRADIENT} text-white shadow-2xl shadow-blue-900/50 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ring-2 ring-white/20`}
        title={`Manny — Hi-Tech 제조 AI 컨시어지 (새 창에서 열림 · ${PERSONA_LABEL[active]} 톤)`}
        aria-label="Manny 챗봇 열기"
      >
        <Bot className="w-7 h-7" strokeWidth={2.5} />
        <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-wow text-white rounded-full w-6 h-6 flex items-center justify-center border-2 border-accent-700 shadow-md">
          AI
        </span>
        <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-accent-700 px-2 py-0.5 rounded-md whitespace-nowrap shadow-md">
          Manny
        </span>
      </button>

      {/* In-page iframe modal — used for Chromium browsers and as the
          popup-blocked fallback. Same-origin /manny → Cognito + SSE work
          identically to the standalone window. Hidden (not unmounted) on
          close so the conversation survives a reopen. */}
      {modalMounted && (
        <div
          hidden={!modalOpen}
          className={[
            'fixed inset-0 z-50 items-center justify-center bg-black/40 backdrop-blur-sm',
            modalOpen ? 'flex' : 'hidden',
          ].join(' ')}
          onClick={() => setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Manny 챗봇"
            className="relative w-[480px] h-[760px] max-h-[90vh] bg-ink-900 border border-accent-500/40 rounded-lg shadow-2xl shadow-blue-900/60 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-accent-500/30 bg-gradient-to-r from-accent-700/30 to-accent-600/15 shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-accent-300" strokeWidth={2.5} />
                <span className="text-xs font-bold text-ink-50">
                  Manny <span className="text-[9px] font-mono text-accent-300">MFG AI</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-ink-800 text-ink-400 hover:text-ink-200"
                title="닫기 (ESC)"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              ref={iframeRef}
              src="/manny"
              title="Manny 챗봇"
              className="flex-1 w-full border-0 bg-ink-950"
            />
          </div>
        </div>
      )}
    </>
  );
}
