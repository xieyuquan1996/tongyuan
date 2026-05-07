import { eq, sql } from 'drizzle-orm'
import { requestLogs } from '../../db/schema.js'

export function parseStatusFilter(status: string) {
  const m = /^([2-5])xx$/i.exec(status)
  if (m) {
    const lo = Number(m[1]) * 100
    return sql`${requestLogs.status}::int >= ${lo} AND ${requestLogs.status}::int < ${lo + 100}`
  }
  return eq(requestLogs.status, status)
}

export function serializeTokenFields(r: {
  inputTokens: unknown
  cacheReadTokens: unknown
  cacheWriteTokens: unknown
  cacheWrite1hTokens: unknown
  outputTokens: unknown
}) {
  const raw = Number(r.inputTokens)
  const cacheRead = Number(r.cacheReadTokens)
  const cacheWrite = Number(r.cacheWriteTokens)
  const cacheWrite1h = Number(r.cacheWrite1hTokens)
  const output = Number(r.outputTokens)
  const input = raw + cacheRead + cacheWrite + cacheWrite1h
  return {
    input_tokens: input,
    input_tokens_raw: raw,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    cache_write_1h_tokens: cacheWrite1h,
    output_tokens: output,
    tokens: input + output,
  }
}

export function serializeFacets(
  statusFacet: { status: string | null }[],
  modelFacet: { model: string | null }[],
) {
  return {
    statuses: statusFacet.map((r) => Number(r.status)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b),
    models: modelFacet.map((r) => r.model).filter(Boolean).sort() as string[],
  }
}
