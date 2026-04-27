// TODO: when the `settings` table lands (spec §5.9), read this from DB and allow admin override.
// For MVP, a hardcoded rate is fine — the /api/admin/settings endpoint is not in Part 1 or Part 2.
export const USD_TO_CNY = 7.20

export function toCny(usd: number): number {
  return usd * USD_TO_CNY
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

export function fmtCny(n: number): string {
  return `¥${n.toFixed(2)}`
}
