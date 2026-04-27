import { Hono } from 'hono'
import { publicConfig } from '../../shared/public-config.js'

export const publicStats = new Hono()
publicStats.get('/', (c) => c.json(publicConfig.stats))
