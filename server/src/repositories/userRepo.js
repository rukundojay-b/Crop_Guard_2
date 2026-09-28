import { query } from '../db/pool.js'

const PUBLIC_COLUMNS = 'id, email, display_name, role, created_at'

export async function createUser({ email, passwordHash, displayName }) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, passwordHash, displayName],
  )
  return rows[0]
}

export async function findByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, password_hash, display_name, role, is_active
       FROM users WHERE email = $1`,
    [email],
  )
  return rows[0] ?? null
}

export async function findById(id) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, is_active FROM users WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function updateProfile(id, { displayName }) {
  const { rows } = await query(
    `UPDATE users SET display_name = $2, updated_at = now()
      WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, displayName],
  )
  return rows[0] ?? null
}

export async function updatePassword(id, passwordHash) {
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
    id,
    passwordHash,
  ])
}

export async function getPasswordHash(id) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [id])
  return rows[0]?.password_hash ?? null
}
