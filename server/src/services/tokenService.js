import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { query, withTransaction } from '../db/pool.js'
import { unauthorized } from '../lib/errors.js'

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.auth.accessSecret,
    { expiresIn: config.auth.accessTtl, issuer: 'cropguard', audience: 'cropguard-app' },
  )
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.auth.accessSecret, {
      issuer: 'cropguard',
      audience: 'cropguard-app',
    })
  } catch {
    throw unauthorized('Your session has expired. Sign in again.')
  }
}

/**
 * Issues a refresh token. Only its hash reaches the database; the raw value
 * exists just long enough to be set as an httpOnly cookie.
 */
export async function issueRefreshToken(userId, { familyId = null, context = {} } = {}) {
  const raw = crypto.randomBytes(48).toString('base64url')
  const expiresAt = new Date(Date.now() + config.auth.refreshTtlDays * 86_400_000)

  const { rows } = await query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, COALESCE($2, gen_random_uuid()), $3, $4, $5, $6)
     RETURNING id, family_id, expires_at`,
    [userId, familyId, sha256(raw), expiresAt, context.userAgent ?? null, context.ip ?? null],
  )

  return { raw, expiresAt, familyId: rows[0].family_id }
}

/**
 * Consumes a refresh token and issues its replacement.
 *
 * If a token that was already rotated comes back, it has almost certainly been
 * stolen, so the entire rotation family is revoked and the user is signed out
 * everywhere.
 */
export async function rotateRefreshToken(raw, context = {}) {
  if (!raw) throw unauthorized('No session to refresh.')
  const hash = sha256(raw)

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT t.id, t.user_id, t.family_id, t.expires_at, t.revoked_at,
              u.email, u.role, u.display_name, u.is_active
         FROM refresh_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1
        FOR UPDATE OF t`,
      [hash],
    )
    const token = rows[0]
    if (!token) throw unauthorized('Your session is no longer valid.')

    if (token.revoked_at) {
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now()
          WHERE family_id = $1 AND revoked_at IS NULL`,
        [token.family_id],
      )
      throw unauthorized('This session was reused and has been revoked. Sign in again.')
    }

    if (new Date(token.expires_at) < new Date()) {
      throw unauthorized('Your session has expired. Sign in again.')
    }
    if (!token.is_active) throw unauthorized('This account is disabled.')

    await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [token.id])

    const next = crypto.randomBytes(48).toString('base64url')
    const expiresAt = new Date(Date.now() + config.auth.refreshTtlDays * 86_400_000)
    await client.query(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [token.user_id, token.family_id, sha256(next), expiresAt, context.userAgent ?? null, context.ip ?? null],
    )

    return {
      raw: next,
      expiresAt,
      user: {
        id: token.user_id,
        email: token.email,
        role: token.role,
        display_name: token.display_name,
      },
    }
  })
}

export async function revokeRefreshToken(raw) {
  if (!raw) return
  await query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [sha256(raw)],
  )
}

export async function revokeAllForUser(userId) {
  await query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  )
}

/** Drops rows that are expired or long revoked. Called on a timer from index.js. */
export async function purgeStaleTokens() {
  const { rowCount } = await query(
    `DELETE FROM refresh_tokens
      WHERE expires_at < now() - interval '7 days'
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')`,
  )
  return rowCount
}

export function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? 'none' : 'lax',
    domain: config.auth.cookieDomain,
    path: config.auth.cookiePath,
    expires: expiresAt,
  }
}
