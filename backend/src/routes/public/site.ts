import { Hono } from 'hono'

export const publicSite = new Hono()
publicSite.get('/', (c) => c.json({
  contact: {
    general: process.env.CONTACT_EMAIL_GENERAL ?? '',
    support: process.env.CONTACT_EMAIL_SUPPORT ?? '',
    privacy: process.env.CONTACT_EMAIL_PRIVACY ?? '',
  },
}))
