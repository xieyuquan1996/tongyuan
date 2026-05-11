import { db, pool } from '../db/client.js'
import { users, apiKeys } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { hmacApiKey } from '../crypto/apikey-hmac.js'

const TEST_SECRET = 'sk-relay-test_manual_key_for_rate_limit_testing_0000000000000000000000000000000'
const TEST_EMAIL = 'ratelimit-test@example.com'

async function main() {
  let [user] = await db.select().from(users).where(eq(users.email, TEST_EMAIL))
  if (!user) {
    const [u] = await db.insert(users).values({
      email: TEST_EMAIL,
      passwordHash: await bcrypt.hash('test1234', 10),
      name: 'Rate Limit Tester',
      balanceUsd: '100.000000',
    }).returning()
    user = u!
    console.log('Created user:', user.id)
  } else {
    console.log('Existing user:', user.id)
  }

  await db.delete(apiKeys).where(eq(apiKeys.userId, user.id))

  const prefix = TEST_SECRET.slice(0, 16)
  const secretHash = await bcrypt.hash(TEST_SECRET, 12)
  const secretHmac = hmacApiKey(TEST_SECRET)

  const [key] = await db.insert(apiKeys).values({
    userId: user.id,
    name: 'manual-test',
    prefix,
    secretHash,
    secretHmac,
    state: 'active',
    rpmLimit: null,
    tpmLimit: null,
  }).returning()

  console.log('API key ID:', key!.id)
  console.log('Secret:', TEST_SECRET)
  await pool.end()
}

main().catch(console.error)
