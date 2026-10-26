// web/lib/manny-bridge.ts
//
// Same-origin message contract between the /manny chat surface and the
// FloatingChat iframe modal that hosts it (ADR-010). Keyboard focus lives
// inside the iframe (autoFocus input), so the parent's own keydown listener
// never sees ESC — /manny forwards it instead.

export const MANNY_CLOSE_MESSAGE = "manny:close";

/** True when `e` is a close request from the expected same-origin frame. */
export function isMannyCloseMessage(
  e: MessageEvent,
  expectedOrigin: string,
  expectedSource: MessageEventSource | null | undefined,
): boolean {
  if (e.origin !== expectedOrigin) return false;
  if (!expectedSource || e.source !== expectedSource) return false;
  const data = e.data as { type?: unknown } | null;
  return typeof data === "object" && data !== null && data.type === MANNY_CLOSE_MESSAGE;
}
