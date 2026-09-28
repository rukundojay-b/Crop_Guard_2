import { config } from '../config.js'
import { AppError } from '../lib/errors.js'

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'That endpoint does not exist.', 'not_found'))
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(err, req, res, _next) {
  const status = err instanceof AppError ? err.status : (err.status ?? 500)

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err)
  }

  const body = {
    error: {
      message:
        err instanceof AppError || status < 500
          ? err.message
          : 'Something went wrong on our side. Try again in a moment.',
      code: err.code ?? 'server_error',
    },
  }
  if (err.details) body.error.details = err.details
  if (!config.isProd && status >= 500) body.error.stack = err.stack

  res.status(status).json(body)
}
