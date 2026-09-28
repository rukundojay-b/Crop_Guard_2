/** An error whose message and status are safe to send to the client. */
export class AppError extends Error {
  constructor(status, message, code = undefined, details = undefined) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
    this.expose = true
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, 'bad_request', details)
export const unauthorized = (msg = 'You are not signed in.') => new AppError(401, msg, 'unauthorized')
export const forbidden = (msg = 'You do not have access to this.') => new AppError(403, msg, 'forbidden')
export const notFound = (msg = 'Not found.') => new AppError(404, msg, 'not_found')
export const conflict = (msg) => new AppError(409, msg, 'conflict')
export const tooMany = (msg) => new AppError(429, msg, 'rate_limited')
export const upstream = (msg) => new AppError(502, msg, 'upstream_error')
