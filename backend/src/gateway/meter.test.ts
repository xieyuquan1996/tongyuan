// backend/src/gateway/meter.test.ts
import { describe, it, expect } from 'vitest'
import { computeCost } from './meter.js'

describe('meter', () => {
  it('base cost with no markup', () => {
    const c = computeCost({
      inputTokens: 1_000_000, outputTokens: 1_000_000,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      model: {
        inputPriceUsdPerMtok: '3', outputPriceUsdPerMtok: '15',
        cacheReadPriceUsdPerMtok: null, cacheWritePriceUsdPerMtok: null,
        markupPct: '0',
      },
    })
    expect(c.costUsd).toBe('18.000000')
    expect(c.chargeUsd).toBe('18.000000')
  })

  it('applies markup', () => {
    const c = computeCost({
      inputTokens: 1_000_000, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      model: {
        inputPriceUsdPerMtok: '3', outputPriceUsdPerMtok: '15',
        cacheReadPriceUsdPerMtok: null, cacheWritePriceUsdPerMtok: null,
        markupPct: '0.2',
      },
    })
    expect(c.costUsd).toBe('3.000000')
    expect(c.chargeUsd).toBe('3.600000')
  })
})
