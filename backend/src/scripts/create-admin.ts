import { pool } from '../db/client.js'
import bcrypt from 'bcryptjs'

async function main() {
  const hash = await bcrypt.hash('Admin123!', 10)
  await pool.query(
    `INSERT INTO users (email, password_hash, role, name)
     VALUES ('admin@test.com', $1, 'admin', 'Admin')
     ON CONFLICT (email) DO UPDATE SET role='admin', password_hash=$1`,
    [hash]
  )
  console.log('Admin created: admin@test.com / Admin123!')
  await pool.end()
}
main()
