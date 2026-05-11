import { db, pool } from './src/db/client.js'
import { users } from './src/db/schema.js'
import { eq } from 'drizzle-orm'
import { checkBillingAlerts } from './src/services/alert-notifier.js'

const [u] = await db.select().from(users).where(eq(users.email, 'yorick1456@gmail.com'))
checkBillingAlerts(u!.id)
await new Promise(r => setTimeout(r, 3000))
console.log('done')
await pool.end()
