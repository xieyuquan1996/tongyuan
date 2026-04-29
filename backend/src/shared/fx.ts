// TODO: when the `settings` table lands (spec §5.9), read this from DB and allow admin override.
// For MVP, a hardcoded rate is fine — the /api/admin/settings endpoint is not in Part 1 or Part 2.
import { db } from '../db/client.js'
import { settings } from '../db/schema.js'
import { eq } from 'drizzle-orm'

let _rate = 7.20
let _rateAt = 0
const TTL = 60_000

export async function getRate(): Promise<number> {
  if (Date.now() - _rateAt < TTL) return _rate
  const row = await db.query.settings.findFirst({ where: eq(settings.key, 'usd_to_cny') })
  _rate = row ? Number(row.value) : 7.20
  _rateAt = Date.now()
  return _rate
}

export function invalidateRateCache() { _rateAt = 0 }

export function toCny(usd: number, rate: number): number {
  return usd * rate
}

export function fromCny(cny: number, rate: number): number {
  return cny / rate
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

export function fmtCny(n: number): string {
  return `¥${n.toFixed(2)}`
}
