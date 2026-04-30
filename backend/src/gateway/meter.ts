// backend/src/gateway/meter.ts
export type ModelPricing = {
  inputPriceUsdPerMtok: string
  outputPriceUsdPerMtok: string
  cacheReadPriceUsdPerMtok: string | null
  cacheWritePriceUsdPerMtok: string | null    // 5-minute TTL
  cacheWrite1hPriceUsdPerMtok: string | null  // 1-hour TTL
  markupPct: string
}

export type UsageInput = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number    // 5-minute writes
  cacheWrite1hTokens: number  // 1-hour writes
  model: ModelPricing
}

function mul(tokens: number, pricePerMtok: string | null): number {
  if (!pricePerMtok) return 0
  return (tokens / 1_000_000) * Number(pricePerMtok)
}

function fmt(n: number): string {
  return n.toFixed(6)
}

export function computeCost(u: UsageInput): { costUsd: string; chargeUsd: string } {
  // 1h writes fall back to the 5m price if the 1h price isn't configured,
  // so a partially-configured model still charges something reasonable.
  const write1hPrice = u.model.cacheWrite1hPriceUsdPerMtok ?? u.model.cacheWritePriceUsdPerMtok
  const cost =
    mul(u.inputTokens, u.model.inputPriceUsdPerMtok) +
    mul(u.outputTokens, u.model.outputPriceUsdPerMtok) +
    mul(u.cacheReadTokens, u.model.cacheReadPriceUsdPerMtok) +
    mul(u.cacheWriteTokens, u.model.cacheWritePriceUsdPerMtok) +
    mul(u.cacheWrite1hTokens, write1hPrice)
  const charge = cost * (1 + Number(u.model.markupPct))
  return { costUsd: fmt(cost), chargeUsd: fmt(charge) }
}
