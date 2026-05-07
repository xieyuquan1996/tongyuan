// Pre-request token estimation. We need to *reserve* budget on the upstream
// key before we know the real usage — Anthropic returns the authoritative
// count in the response, so this is strictly for admission control.
//
// Strategy:
//   - Walk messages/system/tools, sum char length, divide by 4 (the classic
//     GPT-ish heuristic). Anthropic tokenizer is similar enough for this
//     purpose; we reconcile with real values at commit time.
//   - Multiply by 1.1 (10% safety margin) so we rarely *under*reserve and
//     accidentally flood the upstream budget.
//   - For output, respect `max_tokens` if the client set one; else assume a
//     conservative default based on the family's OTPM budget.

const CHARS_PER_TOK = 4
const SAFETY = 1.1

function len(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'string') return v.length
  if (Array.isArray(v)) return v.reduce<number>((s, x) => s + len(x), 0)
  if (typeof v === 'object') {
    let s = 0
    for (const k of Object.keys(v as Record<string, unknown>)) {
      s += k.length
      s += len((v as Record<string, unknown>)[k])
    }
    return s
  }
  return String(v).length
}

export function estimateInputTokens(body: any): number {
  const chars =
    len(body?.system) +
    len(body?.messages) +
    len(body?.tools) +
    len(body?.tool_choice)
  return Math.ceil((chars / CHARS_PER_TOK) * SAFETY)
}

// For streaming requests the reservation is held for the entire stream duration
// (potentially tens of seconds), so we cap at a fraction of the OTPM budget to
// allow concurrent SSE streams. Non-streaming requests release their reservation
// within seconds, so the full estimate is fine there.
const STREAM_OTPM_FRACTION = 0.3

export function estimateOutputTokens(body: any, defaultCap: number, isStream = false): number {
  const streamCap = isStream ? Math.ceil(defaultCap * STREAM_OTPM_FRACTION) : defaultCap
  const max = Number(body?.max_tokens)
  if (Number.isFinite(max) && max > 0) return Math.min(max, streamCap)
  // No max_tokens — use 50% of the effective cap as a rough upper bound.
  return Math.floor(streamCap / 2)
}
