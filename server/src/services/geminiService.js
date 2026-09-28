import { config } from '../config.js'
import { upstream, badRequest } from '../lib/errors.js'

/**
 * The system instruction is sent on every call, including follow-ups, so the
 * model keeps the same persona and constraints across a long thread.
 */
const SYSTEM_INSTRUCTION = `You are CropGuard, an expert agronomist and plant pathologist advising smallholder farmers.

Rules that apply to every reply in this conversation:
- The photo attached to this conversation is the subject. Re-examine it whenever a question refers to the plant.
- Stay consistent with the diagnosis you already gave in this thread. If new information from the farmer changes your view, say plainly what changed and why.
- Favour remedies that are low cost and locally available. Name concrete products, rates and intervals where you can.
- Never invent certainty. If the photo cannot settle a question, say what the farmer should look for or measure next.
- Answer in the language the farmer writes in.`

const DIAGNOSIS_PROMPT = `Analyse the crop in this photo and reply with ONLY a JSON object, no markdown fence, using exactly these keys:
{
  "disease_name": string,
  "scientific_name": string,
  "severity": "none" | "low" | "medium" | "high",
  "confidence": number (0-100),
  "cause": string,
  "spread_risk": string,
  "urgent_action": string,
  "about": string,
  "protection": string[],
  "treatment": string[],
  "organic_alternatives": string[],
  "ai_note": string
}
Keep each list item to one actionable sentence. Favour low-cost remedies available to smallholder farmers.`

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  properties: {
    disease_name: { type: 'string' },
    scientific_name: { type: 'string' },
    severity: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
    confidence: { type: 'number' },
    cause: { type: 'string' },
    spread_risk: { type: 'string' },
    urgent_action: { type: 'string' },
    about: { type: 'string' },
    protection: { type: 'array', items: { type: 'string' } },
    treatment: { type: 'array', items: { type: 'string' } },
    organic_alternatives: { type: 'array', items: { type: 'string' } },
    ai_note: { type: 'string' },
  },
  required: ['disease_name', 'severity', 'confidence', 'cause', 'urgent_action', 'treatment'],
}

async function callOnce(model, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.gemini.timeoutMs)

  let response
  try {
    response = await fetch(`${config.gemini.endpoint}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.gemini.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    const wrapped = new Error(
      err.name === 'AbortError' ? 'The model took too long to answer.' : 'Could not reach the model.',
    )
    wrapped.retryable = true
    throw wrapped
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    const err = new Error(detail?.error?.message || `Model request failed (${response.status}).`)
    err.retryable = [408, 429, 404, 500, 502, 503, 504].includes(response.status)
    err.status = response.status
    throw err
  }

  const data = await response.json()
  const candidate = data.candidates?.[0]

  if (candidate?.finishReason === 'SAFETY') {
    throw Object.assign(new Error('The model declined to answer this request.'), { retryable: false })
  }

  // Reasoning models emit thought parts first; only the non-thought text is the answer.
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim()

  if (!text) {
    throw Object.assign(new Error('The model returned an empty response.'), { retryable: true })
  }

  return { text, usage: data.usageMetadata ?? null }
}

/** Walks the configured model list, falling through on retryable failures only. */
async function callWithFallback(body) {
  let lastError = null
  for (const model of config.gemini.models) {
    try {
      const result = await callOnce(model, body)
      return { ...result, model }
    } catch (err) {
      lastError = err
      if (!err.retryable) break
    }
  }
  throw upstream(lastError?.message ?? 'No model was available.')
}

function parseJsonReport(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw upstream('The model did not return a readable report.')
    try {
      return JSON.parse(match[0])
    } catch {
      throw upstream('The model returned a malformed report.')
    }
  }
}

/** First turn: image in, structured diagnosis out. */
export async function diagnose({ imageBase64, mimeType }) {
  const { text, usage, model } = await callWithFallback({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: DIAGNOSIS_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 1600,
      responseMimeType: 'application/json',
      responseSchema: DIAGNOSIS_SCHEMA,
    },
  })

  return { report: parseJsonReport(text), usage, model }
}

/**
 * Follow-up turn. The original photo and every prior message are replayed, so
 * the model answers with the same context it had when it made the diagnosis.
 */
export async function continueConversation({ imageBase64, mimeType, diagnosis, history, question }) {
  if (!question?.trim()) throw badRequest('Ask a question first.')

  const contents = [
    {
      role: 'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: 'This is the crop photo for this conversation. Diagnose it.' },
      ],
    },
    {
      role: 'model',
      parts: [
        {
          text: diagnosis
            ? `Diagnosis report (JSON):\n${JSON.stringify(diagnosis)}`
            : 'No structured diagnosis was produced for this photo.',
        },
      ],
    },
  ]

  for (const message of history) {
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })
  }

  contents.push({ role: 'user', parts: [{ text: question.trim() }] })

  const { text, usage, model } = await callWithFallback({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents,
    generationConfig: { temperature: 0.4, topP: 0.95, maxOutputTokens: 1400 },
  })

  return { answer: text, usage, model }
}

/** A short sidebar label, derived without a second model call. */
export function titleFromDiagnosis(report, fallback = 'Crop diagnosis') {
  const name = String(report?.disease_name ?? '').trim()
  if (!name) return fallback
  return name.length > 70 ? `${name.slice(0, 67)}…` : name
}
