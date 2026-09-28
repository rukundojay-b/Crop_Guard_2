import pg from 'pg'
import { config } from '../config.js'

// Numeric ids and counts should come back as JS numbers, not strings.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10))

export const pool = new pg.Pool({
  connectionString: config.db.connectionString,
  ssl: config.db.ssl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on('error', (err) => {
  console.error('[db] idle client error', err)
})

export function query(text, params) {
  return pool.query(text, params)
}

/** Runs `fn` inside a transaction and rolls back on any throw. */
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
