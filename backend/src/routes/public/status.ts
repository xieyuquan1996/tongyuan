import { Hono } from 'hono'
import { publicConfig } from '../../shared/public-config.js'

export const publicStatus = new Hono()
publicStatus.get('/', (c) => c.json({
  overall: publicConfig.status.overall,
  components: publicConfig.status.components,
  regions: publicConfig.regions,
  incidents: publicConfig.status.incidents,
}))
