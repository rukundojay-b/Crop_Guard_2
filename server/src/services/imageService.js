import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import { badRequest } from '../lib/errors.js'

// Magic-byte signatures. The declared Content-Type from a browser is a hint,
// not a fact, so the bytes decide what the file actually is.
const SIGNATURES = [
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
]

export function detectImageType(buffer) {
  if (!buffer || buffer.length < 16) throw badRequest('That file is empty or too small to be an image.')
  const match = SIGNATURES.find((s) => s.test(buffer))
  if (!match) throw badRequest('Only JPG, PNG and WEBP photos are accepted.')
  return match
}

/** Writes the photo under a per-user directory and returns a repo-relative path. */
export async function storeImage(userId, buffer) {
  const { mime, ext } = detectImageType(buffer)
  const dir = path.join(config.limits.uploadDir, userId)
  await fs.mkdir(dir, { recursive: true })

  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`
  await fs.writeFile(path.join(dir, name), buffer)

  return { relativePath: path.posix.join(userId, name), mime, bytes: buffer.length }
}

/**
 * Reads a stored photo. The path is re-resolved and checked against the upload
 * root so a doctored database row cannot escape the directory.
 */
export async function readImage(relativePath) {
  const absolute = path.resolve(config.limits.uploadDir, relativePath)
  const root = path.resolve(config.limits.uploadDir)
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw badRequest('Invalid image path.')
  }
  return fs.readFile(absolute)
}

export async function deleteImage(relativePath) {
  if (!relativePath) return
  try {
    const absolute = path.resolve(config.limits.uploadDir, relativePath)
    const root = path.resolve(config.limits.uploadDir)
    if (absolute.startsWith(root + path.sep)) await fs.unlink(absolute)
  } catch {
    // A missing file is not worth failing a delete over.
  }
}
