// backend/src/env.test.ts
import { describe, it, expect } from 'vitest'
import { parseEnv } from './env.js'

describe('parseEnv', () => {
  it('accepts a valid env', () => {
    const e = parseEnv({
      NODE_ENV: 'test',
      PORT: '8080',
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      REDIS_URL: 'redis://h:6379',
      SESSION_SECRET: 'a'.repeat(32),
      UPSTREAM_KEY_KMS: 'b'.repeat(64),
      ANTHROPIC_UPSTREAM_BASE_URL: 'https://api.anthropic.com',
    })
    expect(e.PORT).toBe(8080)
    expect(e.UPSTREAM_KEY_KMS).toHaveLength(64)
  })

  it('rejects a short KMS key', () => {
    expect(() => parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      REDIS_URL: 'redis://h:6379',
      SESSION_SECRET: 'a'.repeat(32),
      UPSTREAM_KEY_KMS: 'short',
      ANTHROPIC_UPSTREAM_BASE_URL: 'https://api.anthropic.com',
    })).toThrow()
  })
})
