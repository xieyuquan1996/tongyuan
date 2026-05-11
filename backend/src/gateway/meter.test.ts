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

// ---- computeHoldUsd ----

import { computeHoldUsd } from './meter.js'

const baseModel = {
  inputPriceUsdPerMtok: '3',
  outputPriceUsdPerMtok: '15',
  cacheReadPriceUsdPerMtok: null,
  cacheWritePriceUsdPerMtok: null,
  cacheWrite1hPriceUsdPerMtok: null,
  markupPct: '0',
}

describe('computeHoldUsd', () => {
  // U1: max_tokens 已指定
  it('U1: uses max_tokens as output ceiling', () => {
    const body = { messages: [{ role: 'user', content: 'hi' }], max_tokens: 1000 }
    const hold = Number(computeHoldUsd(body, baseModel))
    const outputFloor = 1000 * 15 / 1_000_000  // 0.015
    expect(hold).toBeGreaterThanOrEqual(outputFloor)
    expect(hold).toBeLessThan(0.02)
  })

  // U2: max_tokens 超过 8192 上限
  it('U2: caps output at 8192 when max_tokens is very large', () => {
    const body = { messages: [{ role: 'user', content: 'hi' }], max_tokens: 100_000 }
    const hold = Number(computeHoldUsd(body, baseModel))
    const cap = 8192 * 15 / 1_000_000  // 0.12288
    expect(hold).toBeLessThan(cap + 0.01)
  })

  // U3: max_tokens 未指定，使用默认约 4096
  it('U3: falls back to ~4096 output tokens when max_tokens absent', () => {
    const body = { messages: [{ role: 'user', content: 'hi' }] }
    const hold = Number(computeHoldUsd(body, baseModel))
    const expected = 4096 * 15 / 1_000_000  // 0.06144
    expect(hold).toBeGreaterThanOrEqual(expected * 0.9)
    expect(hold).toBeLessThan(expected * 1.5)
  })

  // U4: markup 正确叠加
  it('U4: applies markup correctly', () => {
    const modelWith20 = { ...baseModel, markupPct: '0.2' }
    const body = { messages: [{ role: 'user', content: 'x' }], max_tokens: 100 }
    const base   = Number(computeHoldUsd(body, baseModel))
    const marked = Number(computeHoldUsd(body, modelWith20))
    expect(marked).toBeCloseTo(base * 1.2, 4)
  })
})
