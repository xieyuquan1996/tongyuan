// backend/src/shared/errors.ts
export type ErrorCode =
  | 'unauthorized' | 'invalid_credentials' | 'wrong_password'
  | 'missing_fields' | 'invalid_email' | 'weak_password' | 'invalid_amount'
  | 'email_exists' | 'model_exists'
  | 'account_suspended' | 'account_locked' | 'forbidden'
  | 'not_found' | 'route_not_found'
  | 'insufficient_balance' | 'rate_limit'
  | 'unknown_model' | 'method_not_allowed'
  | 'all_upstreams_down' | 'upstream_error'
  | 'not_implemented' | 'internal_error' | 'invalid_or_expired_token'

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401, invalid_credentials: 401, wrong_password: 401,
  missing_fields: 400, invalid_email: 400, weak_password: 400, invalid_amount: 400,
  unknown_model: 400,
  insufficient_balance: 402,
  account_suspended: 403, account_locked: 403, forbidden: 403,
  not_found: 404, route_not_found: 404,
  method_not_allowed: 405,
  email_exists: 409, model_exists: 409,
  rate_limit: 429,
  internal_error: 500,
  not_implemented: 501,
  all_upstreams_down: 502, upstream_error: 502,
  invalid_or_expired_token: 400,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  constructor(code: ErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.status = STATUS[code]
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSec: number
  readonly rateLimitHeaders: Record<string, string>

  constructor(
    message: string,
    opts: {
      retryAfterSec: number
      limitRequests?: number
      remainingRequests?: number
      limitTokens?: number
      remainingTokens?: number
    },
  ) {
    super('rate_limit', message)
    this.retryAfterSec = opts.retryAfterSec
    const resetAt = new Date(Date.now() + opts.retryAfterSec * 1000).toISOString()
    this.rateLimitHeaders = {
      'retry-after': String(Math.ceil(opts.retryAfterSec)),
      ...(opts.limitRequests !== undefined
        ? {
            'x-ratelimit-limit-requests': String(opts.limitRequests),
            'x-ratelimit-remaining-requests': String(Math.max(0, opts.remainingRequests ?? 0)),
            'x-ratelimit-reset-requests': resetAt,
          }
        : {}),
      ...(opts.limitTokens !== undefined
        ? {
            'x-ratelimit-limit-tokens': String(opts.limitTokens),
            'x-ratelimit-remaining-tokens': String(Math.max(0, opts.remainingTokens ?? 0)),
            'x-ratelimit-reset-tokens': resetAt,
          }
        : {}),
    }
  }
}

export function toErrorBody(e: unknown): { error: ErrorCode; message?: string } {
  if (e instanceof AppError) return { error: e.code, message: e.message !== e.code ? e.message : undefined }
  // duck-type fallback for ESM module instance mismatch
  const a = e as any
  if (a && typeof a.code === 'string' && typeof a.status === 'number' && a.code in STATUS) {
    return { error: a.code as ErrorCode, message: a.message !== a.code ? a.message : undefined }
  }
  // In production, hide raw exception details to prevent leaking DB schema,
  // query fragments, or stack traces to clients.
  if (process.env.NODE_ENV === 'production') {
    return { error: 'internal_error' }
  }
  return { error: 'internal_error', message: e instanceof Error ? e.message : String(e) }
}
