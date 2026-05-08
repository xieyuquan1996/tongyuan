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

  it('accepts optional SMTP and FRONTEND_URL vars', () => {
    const e = parseEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://x:x@localhost/x',
      REDIS_URL: 'redis://localhost',
      SESSION_SECRET: 'aaaabbbbccccddddeeeeffffgggghhhh',
      UPSTREAM_KEY_KMS: '0'.repeat(64),
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_USER: 'me@gmail.com',
      SMTP_PASS: 'app-password',
      SMTP_FROM: 'Claude Link <me@gmail.com>',
      FRONTEND_URL: 'https://example.com',
    })
    expect(e.SMTP_HOST).toBe('smtp.gmail.com')
    expect(e.SMTP_PORT).toBe(465)
    expect(e.SMTP_USER).toBe('me@gmail.com')
    expect(e.SMTP_PASS).toBe('app-password')
    expect(e.SMTP_FROM).toBe('Claude Link <me@gmail.com>')
    expect(e.FRONTEND_URL).toBe('https://example.com')
  })

  it('env without SMTP vars still parses (ConsoleMailer fallback)', () => {
    const e = parseEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://x:x@localhost/x',
      REDIS_URL: 'redis://localhost',
      SESSION_SECRET: 'aaaabbbbccccddddeeeeffffgggghhhh',
      UPSTREAM_KEY_KMS: '0'.repeat(64),
    })
    expect(e.SMTP_HOST).toBeUndefined()
    expect(e.FRONTEND_URL).toBeUndefined()
  })
})
