import { Hono } from 'hono'
import { publicConfig } from '../../shared/public-config.js'

export const publicPlans = new Hono()
publicPlans.get('/', (c) => c.json({ plans: publicConfig.plans }))
