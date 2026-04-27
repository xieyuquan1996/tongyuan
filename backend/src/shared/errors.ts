// backend/src/shared/errors.ts
export type ErrorCode =
  | 'unauthorized' | 'invalid_credentials' | 'wrong_password'
  | 'missing_fields' | 'invalid_email' | 'weak_password' | 'invalid_amount'
  | 'email_exists' | 'model_exists'
  | 'account_suspended' | 'forbidden'
  | 'not_found' | 'route_not_found'
  | 'insufficient_balance' | 'rate_limit'
  | 'unknown_model' | 'method_not_allowed'
  | 'all_upstreams_down' | 'upstream_error'
  | 'not_implemented' | 'internal_error'

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401, invalid_credentials: 401, wrong_password: 401,
  missing_fields: 400, invalid_email: 400, weak_password: 400, invalid_amount: 400,
  unknown_model: 400,
  insufficient_balance: 402,
  account_suspended: 403, forbidden: 403,
  not_found: 404, route_not_found: 404,
  method_not_allowed: 405,
  email_exists: 409, model_exists: 409,
  rate_limit: 429,
  internal_error: 500,
  not_implemented: 501,
  all_upstreams_down: 502, upstream_error: 502,
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

export function toErrorBody(e: unknown): { error: ErrorCode; message?: string } {
  if (e instanceof AppError) return { error: e.code, message: e.message !== e.code ? e.message : undefined }
  // duck-type fallback for ESM module instance mismatch
  const a = e as any
  if (a && typeof a.code === 'string' && typeof a.status === 'number' && a.code in STATUS) {
    return { error: a.code as ErrorCode, message: a.message !== a.code ? a.message : undefined }
  }
  return { error: 'internal_error', message: e instanceof Error ? e.message : String(e) }
}
