import { Hono } from 'hono'
import { publicConfig } from '../../shared/public-config.js'

export const publicRegions = new Hono()
publicRegions.get('/', (c) => c.json({ regions: publicConfig.regions }))
