# ADR-010 — UA-branching popup vs iframe-modal for the "Manny" launcher

- **Status**: Accepted
- **Date**: 2026-05-15
- **Related**: ADR-009 (token streaming — Manny consumes the same SSE)

## Context

v0.5.4 added a global floating chatbot ("Manny") accessible from every
page via a bottom-right launcher button. The launcher targets a
chrome-less chat surface at `/manny` that users can keep visible while
working in other pages.

Initial v0.5.4 implementation opened a slide-in drawer in the same
viewport. User feedback was that the chat should be a detachable window
they could move to a second monitor — like gcc's "Cally" launcher.

Two ways to detach in a browser:

1. **`window.open(url, '_blank', features)`** with `popup=true,width=...`
   features — opens a real OS-level popup window
2. **In-page iframe modal** with `<iframe src="/manny">` — same-origin
   iframe that visually mimics a popup

Both approaches have failure modes that vary by browser.

## Decision

`web/components/FloatingChat.tsx` detects the user agent at click time
and branches:

- **Chromium-family browsers** (Chrome / Edge / Brave / Opera, detected
  by `/Chrome/.test(navigator.userAgent)`) → render in-page iframe modal
  centered on screen, `<iframe src="/manny">` 480×760
- **Firefox / Safari / other** → `window.open('/manny', '_blank', features)`
  with popup features
- **Popup attempt returns `null` / `closed`** → fall back to iframe modal

Both surfaces load the same-origin `/manny` route, which `LayoutShell`
recognizes as a chrome-less path and renders without sidebar / top bar /
nested FloatingChat. Cognito cookies and SSE work identically because
`/manny` is same-origin.

## Why UA branch instead of "popup, then fall back"

Chromium downgrades `window.open` to a regular new tab (instead of a
popup window) when the user's *Site Engagement Score* for the origin is
below an internal threshold. This score is opaque, varies per user, and
isn't deterministic from JavaScript. The same code can produce different
outcomes for different users in the same browser version.

Always-fall-back was tried in v0.5.4-rc; result was a flicker where
Chrome briefly opened a tab, then we detected it as wrong, then we
opened the modal. The UA branch eliminates the flicker by skipping the
unreliable attempt entirely.

Firefox and Safari respect the `features` string deterministically — no
need to skip the real popup there.

## Consequences

### Wins
- Predictable UX per browser family. No flicker.
- Same `/manny` route handles both — single chat surface to test and
  maintain.
- Same-origin iframe → no postMessage / cross-origin auth gymnastics.
- ESC closes the iframe modal; closing the popup window closes the
  surface in either case.

### Costs
- UA-sniffing is fragile in principle. If Chromium ever fixes
  `window.open` reliability or if a new browser family appears, the
  branch needs an update.
- Brave / Edge / Opera all match `Chrome` in their UA strings (they're
  Chromium). They get the iframe modal too. Acceptable — they have the
  same Site Engagement Score policy.

### Surface contract
- `/manny` MUST render without chrome (no Sidebar, no top bar, no
  FloatingChat). `LayoutShell.isPopup` enforces this. Any future
  chrome-less route should be added to the same `isPopup` check.
- `LayoutShell` is a `'use client'` component because `usePathname()`
  requires it. `app/layout.tsx` remains a server component and
  delegates to `LayoutShell`.

## Alternatives considered

- **Drawer only** (v0.5.4) — rejected per user feedback: not
  detachable to a second monitor.
- **Popup window only** — rejected: ~50% of Chrome users would see a
  new tab instead of a window, breaking the UX promise.
- **iframe modal only** — rejected: Firefox / Safari users prefer the
  real popup-window experience, and forcing iframe everywhere is
  worse UX where it isn't needed.
- **postMessage cross-origin chat host** — rejected: same-origin
  `/manny` is dramatically simpler and inherits Cognito auth.

## Operational notes

If reports come in that Manny doesn't open / opens in a tab:

1. Check `navigator.userAgent` — does the user's browser match
   `/Chrome/`? If yes, they should get the modal. If they're seeing a
   tab, the modal render failed and we fell back inadvertently.
2. Check browser console for cross-origin or CSP errors on the iframe
   load.
3. Confirm `/manny` returns 200 (Cognito redirect = unauth user).
