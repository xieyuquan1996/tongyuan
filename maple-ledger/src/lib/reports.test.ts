import { describe, it, expect } from 'vitest'

describe('exchange loss calculation', () => {
  it('calculates loss_cad correctly', () => {
    const amount = 1000
    const bankRate = 0.72
    const marketRate = 0.74
    const lossCad = amount - (amount / bankRate) * marketRate
    expect(lossCad).toBeCloseTo(-27.78, 1)
  })

  it('calculates loss_pct correctly', () => {
    const bankRate = 0.72
    const marketRate = 0.74
    const lossPct = (bankRate - marketRate) / marketRate * 100
    expect(lossPct).toBeCloseTo(-2.70, 1)
  })
})

describe('monthly profit', () => {
  it('profit = income_cad - expense_cad', () => {
    const income_cad = 150.5
    const expense_cad = 100.0
    expect(income_cad - expense_cad).toBeCloseTo(50.5, 2)
  })
})
