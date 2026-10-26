// web/lib/chat-history.ts
//
// Client-held conversation context for /chat and /manny (ADR-012). The API runs
// as two ECS tasks without sticky sessions, so every /api/chat request carries
// the earlier turns itself. Only answers the server finished normally are
// replayed: a blocked, failed or cancelled turn must not become context.

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Pairs sent per request. The API trims again (agent.HISTORY_MAX_PAIRS). */
export const HISTORY_MAX_PAIRS = 6;

type Message = {
  role: "user" | "assistant";
  text: string;
  /** Set when the answer's stream stopped with `end_turn` (see isCompleteStop). */
  complete?: boolean;
  error?: string;
};

/** Stop reason after which an answer may be replayed — not guardrail_intervened,
 *  bedrock_error, max_tokens, aborted, fetch_error:…, stream_end, … */
export function isCompleteStop(reason: unknown): boolean {
  return reason === "end_turn";
}

/** Completed question → answer pairs, oldest first, newest HISTORY_MAX_PAIRS. */
export function historyFrom(messages: readonly Message[]): ChatTurn[] {
  const pairs: ChatTurn[][] = [];
  for (let i = 0; i + 1 < messages.length; i++) {
    const q = messages[i];
    const a = messages[i + 1];
    if (q.role !== "user" || a.role !== "assistant") continue;
    if (a.complete && !a.error && q.text.trim() && a.text.trim()) {
      pairs.push([
        { role: "user", content: q.text },
        { role: "assistant", content: a.text },
      ]);
    }
    i++; // this question's answer is consumed either way
  }
  return pairs.slice(-HISTORY_MAX_PAIRS).flat();
}
