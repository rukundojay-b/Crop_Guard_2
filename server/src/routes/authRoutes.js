import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { badRequest, conflict, unauthorized } from '../lib/errors.js'
import { authLimiter } from '../middleware/rateLimit.js'
import { requireAuth } from '../middleware/auth.js'
import * as users from '../repositories/userRepo.js'
import { burnPasswordTime, hashPassword, verifyPassword } from '../services/passwordService.js'
import {
  issueRefreshToken,
  refreshCookieOptions,
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../services/tokenService.js'

const router = Router()

const password = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.')
  .refine((v) => /[a-z]/i.test(v) && /[0-9]/.test(v), 'Include at least one letter and one number.')

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  password,
  displayName: z.string().trim().min(2, 'Enter your name.').max(80),
})

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

function parse(schema, payload) {
  const result = schema.safeParse(payload)
  if (!result.success) {
    const details = {}
    for (const issue of result.error.issues) details[issue.path.join('.') || '_'] = issue.message
    throw badRequest('Check the highlighted fields.', details)
  }
  return result.data
}

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  displayName: u.display_name,
  role: u.role,
  createdAt: u.created_at,
})

const requestContext = (req) => ({
  userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  ip: req.ip ?? null,
})

async function startSession(req, res, user, status = 200) {
  const { raw, expiresAt } = await issueRefreshToken(user.id, { context: requestContext(req) })
  res.cookie(config.auth.cookieName, raw, refreshCookieOptions(expiresAt))
  res.status(status).json({
    user: publicUser(user),
    accessToken: signAccessToken(user),
  })
}

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password: plain, displayName } = parse(registerSchema, req.body)

    if (await users.findByEmail(email)) {
      throw conflict('An account with that email already exists.')
    }

    const user = await users.createUser({
      email,
      passwordHash: await hashPassword(plain),
      displayName,
    })
    await startSession(req, res, user, 201)
  }),
)

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password: plain } = parse(loginSchema, req.body)
    const user = await users.findByEmail(email)

    // Always spend comparable time so a missing account is not distinguishable.
    if (!user) {
      await burnPasswordTime()
      throw unauthorized('That email or password is not correct.')
    }
    if (!(await verifyPassword(plain, user.password_hash))) {
      throw unauthorized('That email or password is not correct.')
    }
    if (!user.is_active) throw unauthorized('This account is disabled.')

    await startSession(req, res, user)
  }),
)

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const presented = req.cookies?.[config.auth.cookieName]
    const { raw, expiresAt, user } = await rotateRefreshToken(presented, requestContext(req))

    res.cookie(config.auth.cookieName, raw, refreshCookieOptions(expiresAt))
    res.json({ user: publicUser(user), accessToken: signAccessToken(user) })
  }),
)

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeRefreshToken(req.cookies?.[config.auth.cookieName])
    res.clearCookie(config.auth.cookieName, refreshCookieOptions(new Date(0)))
    res.status(204).end()
  }),
)

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) })
  }),
)

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { displayName } = parse(
      z.object({ displayName: z.string().trim().min(2).max(80) }),
      req.body,
    )
    res.json({ user: publicUser(await users.updateProfile(req.user.id, { displayName })) })
  }),
)

router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ currentPassword: z.string().min(1), newPassword: password }),
      req.body,
    )

    const hash = await users.getPasswordHash(req.user.id)
    if (!(await verifyPassword(body.currentPassword, hash))) {
      throw unauthorized('Your current password is not correct.')
    }

    await users.updatePassword(req.user.id, await hashPassword(body.newPassword))

    // Changing a password signs out every other device, then re-issues here.
    await revokeAllForUser(req.user.id)
    await startSession(req, res, req.user)
  }),
)

export default router
