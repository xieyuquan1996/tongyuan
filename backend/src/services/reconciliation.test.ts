// src/services/reconciliation.test.ts
import { describe, it, expect } from 'vitest'
import { diffPct, calcStatus } from './reconciliation.js'

describe('diffPct', () => {
  it('returns 0 when both are 0', () => {
    expect(diffPct(0, 0)).toBe(0)
  })
  it('returns null when anthropic=0 but local>0', () => {
    expect(diffPct(100, 0)).toBeNull()
  })
  it('returns positive pct when local > anthropic', () => {
    expect(diffPct(110, 100)).toBeCloseTo(10)
  })
  it('returns negative pct when local < anthropic', () => {
    expect(diffPct(90, 100)).toBeCloseTo(-10)
  })
})

describe('calcStatus', () => {
  it('match when all diffs < 0.1', () => {
    expect(calcStatus(0.05, 0.05, null)).toBe('match')
  })
  it('warn when any diff between 0.1 and 1', () => {
    expect(calcStatus(0.5, 0, null)).toBe('warn')
  })
  it('mismatch when any diff >= 1', () => {
    expect(calcStatus(1.5, 0, null)).toBe('mismatch')
  })
  it('ignores null diffs', () => {
    expect(calcStatus(null, null, null)).toBe('match')
  })
})
