/**
 * Boot-level checks that need no database: routing, auth gating, validation,
 * CORS and the error shape the frontend depends on.
 *
 * Run with:  npm test
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough'
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough'
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
process.env.GEMINI_API_KEY ??= 'test-key'
process.env.CORS_ORIGINS ??= 'http://localhost:5173'

const { createApp } = await import('../src/app.js')

let server
let base

before(async () => {
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => server?.close())

describe('routing', () => {
  it('reports health', async () => {
    const response = await fetch(`${base}/api/health`)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).status, 'ok')
  })

  it('answers an unknown route with a structured 404', async () => {
    const response = await fetch(`${base}/api/nope`)
    assert.equal(response.status, 404)
    assert.equal((await response.json()).error.code, 'not_found')
  })
})

describe('authentication gate', () => {
  it('rejects an unauthenticated request for conversations', async () => {
    const response = await fetch(`${base}/api/conversations`)
    assert.equal(response.status, 401)
    assert.equal((await response.json()).error.code, 'unauthorized')
  })

  it('rejects a forged bearer token', async () => {
    const response = await fetch(`${base}/api/conversations`, {
      headers: { Authorization: 'Bearer not.a.real.token' },
    })
    assert.equal(response.status, 401)
  })

  it('treats a missing refresh cookie as unauthenticated, not a crash', async () => {
    const response = await fetch(`${base}/api/auth/refresh`, { method: 'POST' })
    assert.equal(response.status, 401)
  })

  it('lets logout succeed even with no session', async () => {
    const response = await fetch(`${base}/api/auth/logout`, { method: 'POST' })
    assert.equal(response.status, 204)
  })
})

describe('registration validation', () => {
  it('returns a message per invalid field', async () => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nope', password: 'short', displayName: 'A' }),
    })

    assert.equal(response.status, 400)
    const { error } = await response.json()
    assert.deepEqual(Object.keys(error.details).sort(), ['displayName', 'email', 'password'])
  })

  it('rejects a long password with no digit', async () => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'grower@example.com',
        password: 'alllettersnodigits',
        displayName: 'Grower',
      }),
    })

    assert.equal(response.status, 400)
    assert.ok((await response.json()).error.details.password)
  })
})

describe('cross-origin policy', () => {
  it('blocks an origin that is not configured', async () => {
    const response = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    })
    assert.equal(response.status, 403)
  })

  it('allows the configured origin with credentials', async () => {
    const response = await fetch(`${base}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
  })
})

describe('hardening', () => {
  it('sends helmet headers and hides the framework', async () => {
    const response = await fetch(`${base}/api/health`)
    assert.ok(response.headers.get('x-content-type-options'))
    assert.equal(response.headers.get('x-powered-by'), null)
  })
})
