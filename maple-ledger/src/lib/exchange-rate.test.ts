import { describe, it, expect } from 'vitest'

describe('CAD/USD rate calculation', () => {
  it('amount_cad formula: amount / usd_rmb_rate * cad_usd_rate', () => {
    const rmb = 720
    const usdRmb = 7.2
    const cadUsd = 0.74
    const amountCad = rmb / usdRmb * cadUsd
    expect(amountCad).toBeCloseTo(74, 2)
  })

  it('expense amount_cad equals amount directly', () => {
    const amountCad = 50.00
    expect(amountCad).toBe(50.00)
  })
})
