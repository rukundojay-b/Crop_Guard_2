import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

const shared = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { message: 'Too many requests. Wait a moment and try again.', code: 'rate_limited' },
  },
}

// ipKeyGenerator collapses an IPv6 address to its /64 prefix. Without it a
// single client could rotate through its own subnet and evade the limit.
const byIp = (req) => ipKeyGenerator(req.ip)

/** Brute-force guard on the credential endpoints, keyed by IP and email. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `${byIp(req)}:${String(req.body?.email ?? '').toLowerCase()}`,
})

/** Model calls are the expensive path, so they get their own tighter budget. */
export const modelLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1000,
  limit: 12,
  keyGenerator: (req) => req.user?.id ?? byIp(req),
})

export const generalLimiter = rateLimit({ ...shared, windowMs: 60 * 1000, limit: 240 })
