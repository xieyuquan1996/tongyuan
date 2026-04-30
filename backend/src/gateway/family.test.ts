import { describe, it, expect } from 'vitest'
import { familyOf } from './family.js'

describe('familyOf', () => {
  it('recognizes opus', () => {
    expect(familyOf('claude-opus-4-7')).toBe('opus')
    expect(familyOf('claude-3-opus-20240229')).toBe('opus')
  })
  it('recognizes haiku', () => {
    expect(familyOf('claude-haiku-4-5-20251001')).toBe('haiku')
    expect(familyOf('claude-3-5-haiku-20241022')).toBe('haiku')
  })
  it('defaults unknown / sonnet ids to sonnet', () => {
    expect(familyOf('claude-sonnet-4-6')).toBe('sonnet')
    expect(familyOf('claude-3-5-sonnet-latest')).toBe('sonnet')
    expect(familyOf('unknown-id')).toBe('sonnet')
  })
})
