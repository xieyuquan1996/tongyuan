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
  // Optional pepper for the API-key HMAC fingerprint. Defaults to a
  // domain-separated derivation of SESSION_SECRET (see crypto/apikey-hmac.ts)
  // so existing deployments don't need a new env. Set this when you want to
  // rotate API key fingerprints without touching sessions, or vice versa.
  API_KEY_HMAC_PEPPER: z.string().min(32).optional(),
  // Kill-switch for user-facing quotas (per-API-key RPM in rate-limit
  // middleware and per-API-key TPM reservation in handle-messages). Does NOT
  // affect upstream Anthropic key admission control in gateway/quota.ts —
  // disabling that would just shift the 429 to Anthropic's side.
  DISABLE_USER_QUOTA: z.string().optional().transform((v) => v === '1' || v === 'true'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  FRONTEND_URL: z.string().url().optional(),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production' && !data.METRICS_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'METRICS_TOKEN must be set in production — /metrics would be publicly accessible without it',
      path: ['METRICS_TOKEN'],
    })
  }
})

export type Env = z.infer<typeof schema>

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  return schema.parse(raw)
}

let _env: Env | null = null
export function getEnv(): Env {
  if (_env) return _env
  _env = parseEnv(process.env)
  if (_env.DISABLE_USER_QUOTA) {
    // eslint-disable-next-line no-console
    console.warn('[env] WARN: DISABLE_USER_QUOTA is enabled — all per-user RPM/TPM limits are bypassed')
  }
  return _env
}
export const env: Env = new Proxy({} as Env, { get(_t, k) { return (getEnv() as any)[k] } })

// Test-only override. Lets e2e tests point the upstream at a mock HTTP server
// without having to reset the cached parsed env. Production code paths must
// use getAnthropicBaseUrl() instead of reading env.ANTHROPIC_UPSTREAM_BASE_URL
// directly so the override is honored.
let _anthropicBaseUrlOverride: string | undefined
export function setAnthropicBaseUrlOverride(url: string | undefined): void {
  _anthropicBaseUrlOverride = url
}
export function getAnthropicBaseUrl(): string {
  return _anthropicBaseUrlOverride ?? getEnv().ANTHROPIC_UPSTREAM_BASE_URL
}
