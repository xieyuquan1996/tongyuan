// backend/src/gateway/scheduler.ts
import * as svc from '../services/upstream-keys.js'
import type { UpstreamRow } from '../services/upstream-keys.js'

export class UpstreamScheduler {
  async snapshot(): Promise<UpstreamRow[]> {
    return svc.pickActive()
  }

  async cooldown(id: string, ms: number, errorCode: string) {
    await svc.markCooldown(id, ms, errorCode)
  }

  async decrypt(row: UpstreamRow): Promise<string> {
    return svc.decrypt(row)
  }
}

export const scheduler = new UpstreamScheduler()
