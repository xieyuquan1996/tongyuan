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

export function estimateOutputTokens(body: any, defaultCap: number): number {
  const max = Number(body?.max_tokens)
  if (Number.isFinite(max) && max > 0) return Math.min(max, defaultCap)
  // No max_tokens — assume half the family's per-minute OTPM budget as a rough
  // upper bound for a single request. Reconciled on response.
  return Math.floor(defaultCap / 2)
}
