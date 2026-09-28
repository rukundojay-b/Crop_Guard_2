import fs from 'node:fs/promises'
import { createApp } from './app.js'
import { assertRuntimeConfig, config } from './config.js'
import { pool } from './db/pool.js'
import { purgeStaleTokens } from './services/tokenService.js'

async function main() {
  assertRuntimeConfig()

  await fs.mkdir(config.limits.uploadDir, { recursive: true })

  // Fail fast at boot rather than on the first user request.
  await pool.query('SELECT 1')

  const server = createApp().listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port} (${config.env})`)
  })

  const sweep = setInterval(
    () => {
      purgeStaleTokens()
        .then((n) => n > 0 && console.log(`[tokens] purged ${n} stale refresh token(s)`))
        .catch((err) => console.error('[tokens] purge failed', err.message))
    },
    6 * 60 * 60 * 1000,
  )
  sweep.unref()

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down`)
    server.close(async () => {
      await pool.end().catch(() => {})
      process.exit(0)
    })
    // Do not let a hung connection block the deploy.
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[server] failed to start:', err.message)
  process.exit(1)
})
