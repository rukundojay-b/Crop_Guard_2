/**
 * Express 5 forwards rejected promises automatically, but wrapping keeps the
 * intent explicit and keeps the routes readable.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}
