import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import multer from 'multer'
import { config } from './config.js'
import { AppError } from './lib/errors.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { generalLimiter } from './middleware/rateLimit.js'
import authRoutes from './routes/authRoutes.js'
import conversationRoutes from './routes/conversationRoutes.js'

export function createApp() {
  const app = express()

  // Behind a load balancer or reverse proxy, req.ip must come from the
  // forwarded header or every rate limit collapses onto one key.
  app.set('trust proxy', config.isProd ? 1 : false)
  app.disable('x-powered-by')

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }))

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin requests and server-to-server calls send no Origin header.
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true)
        callback(new AppError(403, 'This origin is not allowed.', 'cors_blocked'))
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  )

  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(generalLimiter)

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', env: config.env, uptime: Math.round(process.uptime()) })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/conversations', conversationRoutes)

  // Multer reports oversize uploads with its own error type, which would
  // otherwise surface as an opaque 500.
  app.use((err, _req, _res, next) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `That photo is larger than ${Math.round(config.limits.maxUploadBytes / 1024 / 1024)} MB.`
          : 'That upload could not be read.'
      return next(new AppError(400, message, 'upload_rejected'))
    }
    next(err)
  })

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
