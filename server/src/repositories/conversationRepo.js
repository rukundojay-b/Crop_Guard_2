import { query, withTransaction } from '../db/pool.js'

const LIST_COLUMNS = `
  id, title, model, message_count, image_mime,
  diagnosis -> 'disease_name'  AS disease_name,
  diagnosis -> 'severity'      AS severity,
  diagnosis -> 'confidence'    AS confidence,
  last_message_at, created_at
`

export async function listForUser(userId, { limit = 40, before = null, search = null } = {}) {
  const { rows } = await query(
    `SELECT ${LIST_COLUMNS}
       FROM conversations
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND ($2::timestamptz IS NULL OR last_message_at < $2)
        AND ($3::text IS NULL OR title ILIKE '%' || $3 || '%')
      ORDER BY last_message_at DESC
      LIMIT $4`,
    [userId, before, search, Math.min(limit, 100)],
  )
  return rows
}

export async function getOwned(conversationId, userId) {
  const { rows } = await query(
    `SELECT * FROM conversations
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [conversationId, userId],
  )
  return rows[0] ?? null
}

export async function getMessages(conversationId) {
  const { rows } = await query(
    `SELECT id, role, content, payload, model, created_at
       FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC, id ASC`,
    [conversationId],
  )
  return rows
}

export async function createConversation({ userId, title, imagePath, imageMime, imageBytes }) {
  const { rows } = await query(
    `INSERT INTO conversations (user_id, title, image_path, image_mime, image_bytes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, title, imagePath, imageMime, imageBytes],
  )
  return rows[0]
}

/** Stores a message and moves the conversation to the top of the sidebar atomically. */
export async function appendMessage({ conversationId, role, content, payload = null, model = null }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO messages (conversation_id, role, content, payload, model)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, role, content, payload, model, created_at`,
      [conversationId, role, content, payload, model],
    )
    await client.query(
      `UPDATE conversations
          SET message_count = message_count + 1,
              last_message_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [conversationId],
    )
    return rows[0]
  })
}

export async function saveDiagnosis(conversationId, { diagnosis, model, title }) {
  const { rows } = await query(
    `UPDATE conversations
        SET diagnosis = $2, model = $3, title = COALESCE($4, title), updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [conversationId, diagnosis, model, title],
  )
  return rows[0]
}

export async function rename(conversationId, userId, title) {
  const { rows } = await query(
    `UPDATE conversations SET title = $3, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING ${LIST_COLUMNS}`,
    [conversationId, userId, title],
  )
  return rows[0] ?? null
}

/** Soft delete, so a mis-click is recoverable and the image cleanup can be batched. */
export async function softDelete(conversationId, userId) {
  const { rowCount } = await query(
    `UPDATE conversations SET deleted_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [conversationId, userId],
  )
  return rowCount > 0
}

export async function recordUsage({ userId, conversationId, kind, model, usage }) {
  await query(
    `INSERT INTO usage_events (user_id, conversation_id, kind, model, prompt_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      conversationId,
      kind,
      model ?? null,
      usage?.promptTokenCount ?? null,
      usage?.candidatesTokenCount ?? null,
    ],
  )
}

export async function countUsageToday(userId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM usage_events
      WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
    [userId],
  )
  return rows[0].n
}
