import { Hono } from 'hono'
import { publicConfig } from '../../shared/public-config.js'

export const publicChangelog = new Hono()
publicChangelog.get('/', (c) => c.json({ entries: publicConfig.changelog }))
