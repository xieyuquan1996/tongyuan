// backend/src/env.ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  UPSTREAM_KEY_KMS: z.string().length(64, 'must be 64 hex chars (32 bytes)'),
  ANTHROPIC_UPSTREAM_BASE_URL: z.string().url().default('https://api.anthropic.com'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  METRICS_TOKEN: z.string().optional(),
})

export type Env = z.infer<typeof schema>

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  return schema.parse(raw)
}

let _env: Env | null = null
export function getEnv(): Env { return _env ??= parseEnv(process.env) }
export const env: Env = new Proxy({} as Env, { get(_t, k) { return (getEnv() as any)[k] } })
