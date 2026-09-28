import { unauthorized, forbidden } from '../lib/errors.js'
import { verifyAccessToken } from '../services/tokenService.js'
import { findById } from '../repositories/userRepo.js'

/** Requires a valid bearer access token and loads the user onto `req.user`. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.get('authorization') ?? ''
    if (!header.startsWith('Bearer ')) throw unauthorized()

    const claims = verifyAccessToken(header.slice(7).trim())
    const user = await findById(claims.sub)
    if (!user) throw unauthorized('This account no longer exists.')
    if (!user.is_active) throw forbidden('This account is disabled.')

    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}
