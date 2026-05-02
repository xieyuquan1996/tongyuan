// Stamp every response with a stable request id.
//
// Honors an inbound `x-request-id` if the client / upstream LB sent one — that
// way trace lines from nginx, this gateway, and the upstream Anthropic call
// all share an id when the operator wires their LB to forward it. If not
// present, we mint `req_<ulid>` and use it for both the response header and
// the `request_logs.id` row, so support requests can paste a single id and
// we can pull both the HTTP trail and the row.

import type { MiddlewareHandler } from 'hono'
import { ulid } from 'ulid'

const HEADER = 'x-request-id'
const PREFIX = 'req_'

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string
  }
}

// Validate inbound ids strictly enough that we don't echo arbitrary attacker
// input back in the header (response splitting via newlines etc.). Keep the
// whitelist generous — most LBs send UUIDs / shortuuid / hex / our own ulid.
function isSafeId(s: string): boolean {
  return s.length > 0 && s.length <= 128 && /^[A-Za-z0-9_\-:.]+$/.test(s)
}

export const requestId: MiddlewareHandler = async (c, next) => {
  const inbound = c.req.header(HEADER)
  const id = inbound && isSafeId(inbound) ? inbound : PREFIX + ulid()
  c.set('requestId', id)
  c.header(HEADER, id)
  await next()
}
