// backend/src/gateway/meter.test.ts
import { describe, it, expect } from 'vitest'
import { computeCost } from './meter.js'

describe('meter', () => {
  it('base cost with no markup', () => {
    const c = computeCost({
      inputTokens: 1_000_000, outputTokens: 1_000_000,
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      model: {
        inputPriceUsdPerMtok: '3', outputPriceUsdPerMtok: '15',
        cacheReadPriceUsdPerMtok: null, cacheWritePriceUsdPerMtok: null,
        cacheWrite1hPriceUsdPerMtok: null,
        markupPct: '0',
      },
    })
    expect(c.costUsd).toBe('18.000000')
    expect(c.chargeUsd).toBe('18.000000')
  })

  it('applies markup', () => {
    const c = computeCost({
      inputTokens: 1_000_000, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      model: {
        inputPriceUsdPerMtok: '3', outputPriceUsdPerMtok: '15',
        cacheReadPriceUsdPerMtok: null, cacheWritePriceUsdPerMtok: null,
        cacheWrite1hPriceUsdPerMtok: null,
        markupPct: '0.2',
      },
    })
    expect(c.costUsd).toBe('3.000000')
    expect(c.chargeUsd).toBe('3.600000')
  })

  it('prices cache writes with 5m and 1h buckets separately', () => {
    // Sonnet tier: input $3, 5m write $3.75, 1h write $6, cache read $0.30
    const c = computeCost({
      inputTokens: 1_000_000, outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,   // 5m bucket
      cacheWrite1hTokens: 1_000_000, // 1h bucket
      model: {
        inputPriceUsdPerMtok: '3', outputPriceUsdPerMtok: '15',
        cacheReadPriceUsdPerMtok: '0.30',
        cacheWritePriceUsdPerMtok: '3.75',
        cacheWrite1hPriceUsdPerMtok: '6',
        markupPct: '0',
      },
    })
    // 3 + 0.30 + 3.75 + 6 = 13.05
    expect(c.costUsd).toBe('13.050000')
  })

  it('1h writes fall back to 5m price when 1h price unset', () => {
    const c = computeCost({
      inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      cacheWrite1hTokens: 1_000_000,
      model: {
        inputPriceUsdPerMtok: '3', outputPriceUsdPerMtok: '15',
        cacheReadPriceUsdPerMtok: null,
        cacheWritePriceUsdPerMtok: '3.75',
        cacheWrite1hPriceUsdPerMtok: null,
        markupPct: '0',
      },
    })
    expect(c.costUsd).toBe('3.750000')
  })
})
