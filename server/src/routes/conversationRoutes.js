import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { config } from '../config.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { badRequest, notFound, tooMany } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { modelLimiter } from '../middleware/rateLimit.js'
import * as repo from '../repositories/conversationRepo.js'
import { continueConversation, diagnose, titleFromDiagnosis } from '../services/geminiService.js'
import { deleteImage, readImage, storeImage } from '../services/imageService.js'

const router = Router()
router.use(requireAuth)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.maxUploadBytes, files: 1 },
})

const uuid = z.string().uuid('That conversation id is not valid.')

function parseId(value) {
  const result = uuid.safeParse(value)
  if (!result.success) throw badRequest(result.error.issues[0].message)
  return result.data
}

async function assertQuota(userId) {
  const used = await repo.countUsageToday(userId)
  if (used >= config.limits.maxMessagesPerDay) {
    throw tooMany(
      `You have reached the daily limit of ${config.limits.maxMessagesPerDay} model requests. It resets 24 hours after your first request.`,
    )
  }
}

async function loadOwned(req) {
  const conversation = await repo.getOwned(parseId(req.params.id), req.user.id)
  if (!conversation) throw notFound('That conversation does not exist.')
  return conversation
}

const serialiseMessage = (m) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  report: m.payload?.report ?? null,
  model: m.model,
  createdAt: m.created_at,
})

const serialiseConversation = (c) => ({
  id: c.id,
  title: c.title,
  model: c.model,
  diagnosis: c.diagnosis,
  imageUrl: `/api/conversations/${c.id}/image`,
  messageCount: c.message_count,
  createdAt: c.created_at,
  lastMessageAt: c.last_message_at,
})

/** GET /api/conversations - sidebar history, newest first. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await repo.listForUser(req.user.id, {
      limit: Number.parseInt(req.query.limit ?? '40', 10) || 40,
      before: req.query.before || null,
      search: typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : null,
    })

    res.json({
      conversations: items.map((c) => ({
        id: c.id,
        title: c.title,
        diseaseName: c.disease_name,
        severity: c.severity,
        confidence: c.confidence,
        messageCount: c.message_count,
        model: c.model,
        lastMessageAt: c.last_message_at,
        createdAt: c.created_at,
      })),
      nextCursor: items.length ? items[items.length - 1].last_message_at : null,
    })
  }),
)

/** POST /api/conversations - upload a photo, diagnose it, open a thread. */
router.post(
  '/',
  modelLimiter,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Attach a crop photo.')
    await assertQuota(req.user.id)

    const stored = await storeImage(req.user.id, req.file.buffer)
    const conversation = await repo.createConversation({
      userId: req.user.id,
      title: 'Analysing...',
      imagePath: stored.relativePath,
      imageMime: stored.mime,
      imageBytes: stored.bytes,
    })

    try {
      const { report, usage, model } = await diagnose({
        imageBase64: req.file.buffer.toString('base64'),
        mimeType: stored.mime,
      })

      const updated = await repo.saveDiagnosis(conversation.id, {
        diagnosis: report,
        model,
        title: titleFromDiagnosis(report),
      })

      const message = await repo.appendMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: report.about || report.urgent_action || 'Diagnosis complete.',
        payload: { report },
        model,
      })

      await repo.recordUsage({
        userId: req.user.id,
        conversationId: conversation.id,
        kind: 'diagnosis',
        model,
        usage,
      })

      res.status(201).json({
        conversation: serialiseConversation({ ...updated, message_count: updated.message_count + 1 }),
        messages: [serialiseMessage(message)],
      })
    } catch (err) {
      // A failed diagnosis should not leave an empty thread in the sidebar.
      await repo.softDelete(conversation.id, req.user.id)
      await deleteImage(stored.relativePath)
      throw err
    }
  }),
)

/** GET /api/conversations/:id - the full thread, for resuming later. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const conversation = await loadOwned(req)
    const messages = await repo.getMessages(conversation.id)

    res.json({
      conversation: serialiseConversation(conversation),
      messages: messages.map(serialiseMessage),
    })
  }),
)

/** GET /api/conversations/:id/image - the photo, served only to its owner. */
router.get(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const conversation = await loadOwned(req)
    if (!conversation.image_path) throw notFound('This conversation has no photo.')

    const buffer = await readImage(conversation.image_path)
    res.set('Content-Type', conversation.image_mime)
    res.set('Cache-Control', 'private, max-age=86400')
    res.send(buffer)
  }),
)

/**
 * POST /api/conversations/:id/messages - a follow-up question.
 * The photo and every earlier turn are replayed, so the answer stays consistent
 * with the diagnosis the model already gave in this thread.
 */
router.post(
  '/:id/messages',
  modelLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ content: z.string().trim().min(1, 'Type a question.').max(4000) })
      .safeParse(req.body)
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message)

    const conversation = await loadOwned(req)
    await assertQuota(req.user.id)

    const history = await repo.getMessages(conversation.id)
    if (history.length >= config.limits.maxConversationTurns * 2) {
      throw badRequest('This conversation has reached its length limit. Start a new diagnosis.')
    }

    const userMessage = await repo.appendMessage({
      conversationId: conversation.id,
      role: 'user',
      content: parsed.data.content,
    })

    const imageBuffer = await readImage(conversation.image_path)

    const { answer, usage, model } = await continueConversation({
      imageBase64: imageBuffer.toString('base64'),
      mimeType: conversation.image_mime,
      diagnosis: conversation.diagnosis,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      question: parsed.data.content,
    })

    const assistantMessage = await repo.appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: answer,
      model,
    })

    await repo.recordUsage({
      userId: req.user.id,
      conversationId: conversation.id,
      kind: 'follow_up',
      model,
      usage,
    })

    res
      .status(201)
      .json({ messages: [serialiseMessage(userMessage), serialiseMessage(assistantMessage)] })
  }),
)

/** PATCH /api/conversations/:id - rename a thread. */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ title: z.string().trim().min(1, 'Enter a title.').max(120) })
      .safeParse(req.body)
    if (!parsed.success) throw badRequest(parsed.error.issues[0].message)

    const updated = await repo.rename(parseId(req.params.id), req.user.id, parsed.data.title)
    if (!updated) throw notFound('That conversation does not exist.')
    res.json({ conversation: { id: updated.id, title: updated.title } })
  }),
)

/** DELETE /api/conversations/:id - soft delete plus photo removal. */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const conversation = await loadOwned(req)
    await repo.softDelete(conversation.id, req.user.id)
    await deleteImage(conversation.image_path)
    res.status(204).end()
  }),
)

export default router
