import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, withTransaction } from './pool.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const { rows } = await pool.query('SELECT name FROM schema_migrations')
  const applied = new Set(rows.map((r) => r.name))

  let count = 0
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await fs.readFile(path.join(dir, file), 'utf8')
    await withTransaction(async (client) => {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    })
    console.log(`[migrate] applied ${file}`)
    count += 1
  }

  console.log(count === 0 ? '[migrate] already up to date' : `[migrate] ${count} migration(s) applied`)
  await pool.end()
}

main().catch((err) => {
  // Connection failures from pg often arrive with an empty message and only a
  // code, which tells the reader nothing on its own.
  const hints = {
    ECONNREFUSED: 'Nothing is listening at that host and port. Is Postgres running?',
    ENOTFOUND: 'That database host could not be resolved. Check DATABASE_URL.',
    ETIMEDOUT: 'The database did not answer in time. Check the host, port and firewall.',
    '28P01': 'Postgres rejected the username or password in DATABASE_URL.',
    '3D000': 'That database does not exist yet. Create it, then run this again.',
    '42501': 'This database user is not allowed to create tables or extensions.',
  }

  const detail = err.message || err.code || String(err)
  console.error(`[migrate] failed: ${detail}`)
  if (hints[err.code]) console.error(`[migrate] ${hints[err.code]}`)
  console.error(`[migrate] DATABASE_URL currently points at: ${describeTarget()}`)

  process.exit(1)
})

/** Shows the connection target without ever printing the password. */
function describeTarget() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '')
    return `${url.hostname}:${url.port || 5432}${url.pathname} as ${url.username || '(no user)'}`
  } catch {
    return 'an unreadable value'
  }
}
