// backend/src/shared/errors.ts
const STATUS_MAP: Record<string, number> = {
  bad_request: 400,
  unauthorized: 401,
  insufficient_balance: 402,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  too_many_requests: 429,
  internal_error: 500,
  all_upstreams_down: 502,
  upstream_timeout: 504,
  // domain codes that map to 400
  invalid_email: 400,
  invalid_password: 400,
  invalid_request: 400,
}

export class AppError extends Error {
  readonly status: number
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'AppError'
    this.status = STATUS_MAP[code] ?? 500
  }
}

export interface ErrorBody {
  error: string
  message: string
}

export function toErrorBody(err: unknown): ErrorBody {
  if (err instanceof AppError) {
    return { error: err.code, message: err.message }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { error: 'internal_error', message }
}
