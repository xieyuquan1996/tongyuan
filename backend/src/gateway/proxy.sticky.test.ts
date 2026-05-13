// backend/src/gateway/proxy.sticky.test.ts
//
// Unit tests for sticky routing: djb2 hash stability and stickyOrder behaviour.
// No I/O — pure logic only.

import { describe, it, expect } from 'vitest'
import { djb2, stickyOrder } from './proxy.js'
import type { UpstreamRow } from '../services/upstream-keys.js'

function makeUpstream(id: string, weight = 100): UpstreamRow {
  return {
    id,
    alias: id,
    provider: 'anthropic_official',
    keyCiphertext: '',
    keyPrefix: 'sk-test',
    state: 'active',
    priority: '100' as any,
    weight,
    cooldownUntil: null,
    lastErrorCode: null,
    lastErrorAt: null,
    quotaHintUsd: null,
    baseUrl: null,
    adminKeyCiphertext: null,
    anthropicKeyId: null,
    createdAt: new Date(),
  }
}

describe('djb2', () => {
  it('produces the same output for the same input', () => {
    const a = djb2('sk-relay-abc123')
    const b = djb2('sk-relay-abc123')
    expect(a).toBe(b)
  })

  it('produces different outputs for different inputs', () => {
    expect(djb2('key-A')).not.toBe(djb2('key-B'))
  })

  it('returns an unsigned 32-bit number', () => {
    const h = djb2('test-string')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('stickyOrder', () => {
  it('returns the same pool for single entry', () => {
    const pool = [makeUpstream('a')]
    const result = stickyOrder(pool, 'any-key')
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('a')
  })

  it('always returns the same preferred upstream for the same stickyKey', () => {
    const pool = [makeUpstream('aaa'), makeUpstream('bbb'), makeUpstream('ccc')]
    const order1 = stickyOrder(pool, 'sk-relay-user-x')
    const order2 = stickyOrder(pool, 'sk-relay-user-x')
    expect(order1[0]!.id).toBe(order2[0]!.id)
  })

  it('different stickyKeys can map to different preferred upstreams', () => {
    const pool = [makeUpstream('aaa'), makeUpstream('bbb'), makeUpstream('ccc')]
    const preferreds = new Set<string>()
    // Try 20 different keys — with 3 upstreams, at least 2 should appear.
    for (let i = 0; i < 20; i++) {
      const order = stickyOrder(pool, `sk-relay-key-${i}`)
      preferreds.add(order[0]!.id)
    }
    expect(preferreds.size).toBeGreaterThanOrEqual(2)
  })

  it('includes all pool entries in the result', () => {
    const pool = [makeUpstream('a'), makeUpstream('b'), makeUpstream('c')]
    const result = stickyOrder(pool, 'some-key')
    expect(result).toHaveLength(3)
    const ids = result.map((u) => u.id).sort()
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('preferred upstream is stable even when pool order is different', () => {
    const poolABC = [makeUpstream('aaa'), makeUpstream('bbb'), makeUpstream('ccc')]
    const poolCBA = [makeUpstream('ccc'), makeUpstream('bbb'), makeUpstream('aaa')]
    const key = 'sk-relay-stable-test'
    expect(stickyOrder(poolABC, key)[0]!.id).toBe(stickyOrder(poolCBA, key)[0]!.id)
  })
})
