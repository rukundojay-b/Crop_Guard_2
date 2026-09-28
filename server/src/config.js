import 'dotenv/config'
import path from 'node:path'

function required(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable ${name}. Copy server/.env.example to server/.env and fill it in.`,
    )
  }
  return value.trim()
}

function optional(name, fallback) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : fallback
}

function int(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer.`)
  return parsed
}

const isProd = optional('NODE_ENV', 'development') === 'production'

// Only the database is needed at import time. The migration runner imports this
// module too, and it has no business demanding a Gemini key or JWT secrets.
// Everything the running server needs is checked by assertRuntimeConfig below.
const accessSecret = optional('JWT_ACCESS_SECRET', '')
const refreshSecret = optional('JWT_REFRESH_SECRET', '')

export const config = {
  isProd,
  env: optional('NODE_ENV', 'development'),
  port: int('PORT', 4000),
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  db: {
    connectionString: required('DATABASE_URL'),
    ssl: optional('DATABASE_SSL', 'false') === 'true' ? { rejectUnauthorized: false } : false,
  },

  auth: {
    accessSecret,
    refreshSecret,
    accessTtl: optional('ACCESS_TOKEN_TTL', '15m'),
    refreshTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 30),
    cookieName: 'cg_refresh',
    cookieDomain: optional('COOKIE_DOMAIN', undefined),
    cookiePath: '/api/auth',
  },

  gemini: {
    apiKey: optional('GEMINI_API_KEY', ''),
    models: optional('GEMINI_MODELS', 'gemini-3.8-flash,gemini-3.5-flash,gemini-2.5-flash')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    timeoutMs: int('GEMINI_TIMEOUT_MS', 60000),
  },

  limits: {
    uploadDir: path.resolve(process.cwd(), optional('UPLOAD_DIR', './uploads')),
    maxUploadBytes: int('MAX_UPLOAD_BYTES', 6 * 1024 * 1024),
    maxMessagesPerDay: int('MAX_MESSAGES_PER_DAY', 120),
    maxConversationTurns: int('MAX_CONVERSATION_TURNS', 40),
  },
}

/**
 * Checked when the API actually starts, not when this module is imported, so
 * `npm run migrate` needs nothing beyond DATABASE_URL.
 */
export function assertRuntimeConfig() {
  const missing = []
  if (!config.auth.accessSecret) missing.push('JWT_ACCESS_SECRET')
  if (!config.auth.refreshSecret) missing.push('JWT_REFRESH_SECRET')
  if (!config.gemini.apiKey) missing.push('GEMINI_API_KEY')

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy server/.env.example to server/.env and fill it in.',
    )
  }

  if (config.auth.accessSecret === config.auth.refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.')
  }

  if (isProd && (config.auth.accessSecret.length < 32 || config.auth.refreshSecret.length < 32)) {
    throw new Error('In production both JWT secrets must be at least 32 characters.')
  }
}
