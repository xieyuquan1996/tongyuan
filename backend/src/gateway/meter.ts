// backend/src/gateway/meter.ts
export type ModelPricing = {
  inputPriceUsdPerMtok: string
  outputPriceUsdPerMtok: string
  cacheReadPriceUsdPerMtok: string | null
  cacheWritePriceUsdPerMtok: string | null
  markupPct: string
}

export type UsageInput = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
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
  const cost =
    mul(u.inputTokens, u.model.inputPriceUsdPerMtok) +
    mul(u.outputTokens, u.model.outputPriceUsdPerMtok) +
    mul(u.cacheReadTokens, u.model.cacheReadPriceUsdPerMtok) +
    mul(u.cacheWriteTokens, u.model.cacheWritePriceUsdPerMtok)
  const charge = cost * (1 + Number(u.model.markupPct))
  return { costUsd: fmt(cost), chargeUsd: fmt(charge) }
}
