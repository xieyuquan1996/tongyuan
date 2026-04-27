// backend/src/shared/canonicalize.ts
import { createHash } from 'node:crypto'

export function canonicalize(v: unknown): string {
  return JSON.stringify(sort(v))
}

function sort(v: unknown): unknown {
  if (v === null || v === undefined) return undefined
  if (Array.isArray(v)) return v.map(sort).filter((x) => x !== undefined)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) {
      const s = sort(o[k])
      if (s !== undefined) out[k] = s
    }
    return out
  }
  if (typeof v === 'string') return v.normalize('NFC')
  return v
}

export function hashBody(v: unknown): string {
  return createHash('sha256').update(canonicalize(v)).digest('hex')
}
