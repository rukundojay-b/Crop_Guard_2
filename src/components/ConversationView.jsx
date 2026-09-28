import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/apiClient.js'
import DiagnosisReport from './DiagnosisReport.jsx'

const SUGGESTIONS = [
  'What should I spray first, and at what rate?',
  'Can I save the rest of the field?',
  'Is this safe to eat or sell?',
  'What will this cost me?',
]

const formatTime = (value) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function ConversationView({
  conversation,
  messages,
  loading,
  sending,
  error,
  onSend,
  onNew,
}) {
  const [draft, setDraft] = useState('')
  const [imageUrl, setImageUrl] = useState(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  // Only messages that arrive after the thread is already on screen should
  // type themselves out; history loaded from the server appears instantly.
  // Reseeding during render (React's documented pattern for adjusting state
  // in response to a prop change) makes the new set available before this
  // same render decides which messages count as "new".
  const [seenIds, setSeenIds] = useState(() => new Set(messages.map((m) => m.id)))
  const [seenConversationId, setSeenConversationId] = useState(conversation?.id)
  if (seenConversationId !== conversation?.id) {
    setSeenConversationId(conversation?.id)
    setSeenIds(new Set(messages.map((m) => m.id)))
  }
  useEffect(() => {
    setSeenIds((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const m of messages) {
        if (!next.has(m.id)) {
          next.add(m.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [messages])

  // The photo is owner-only, so it is fetched with the bearer token and held as
  // an object URL rather than pointed at directly from an img src.
  useEffect(() => {
    if (!conversation?.id) return undefined

    let revoked = false
    let url = null

    api
      .conversationImage(conversation.id)
      .then((objectUrl) => {
        if (revoked) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        url = objectUrl
        setImageUrl(objectUrl)
      })
      .catch(() => setImageUrl(null))

    return () => {
      revoked = true
      setImageUrl(null)
      if (url) URL.revokeObjectURL(url)
    }
  }, [conversation?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, sending])

  // Grow the composer with its content instead of scrolling a two-line box.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  const submit = (event) => {
    event?.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setDraft('')
    onSend(content)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-8">
        <div className="skel h-40 w-full" />
        <div className="skel h-24 w-full" />
        <div className="skel h-24 w-5/6" />
      </div>
    )
  }

  const diagnosis = conversation?.diagnosis
  const followUps = messages.filter((m) => !m.report)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {imageUrl && (
            <div className="panel animate-rise overflow-hidden">
              <img
                src={imageUrl}
                alt="The crop in this conversation"
                className="max-h-[19rem] w-full object-cover"
              />
              <div className="border-t border-b1 px-4 py-2.5 text-xs text-t3">
                Analysed {formatTime(conversation.createdAt)}
              </div>
            </div>
          )}

          <DiagnosisReport report={diagnosis} model={conversation?.model} />

          {followUps.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-b1" />
                <span className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-t3">
                  Follow-up questions
                </span>
                <span className="h-px flex-1 bg-b1" />
              </div>

              {followUps.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  animate={message.role !== 'user' && !seenIds.has(message.id)}
                />
              ))}
            </div>
          )}

          {sending && (
            <div className="flex items-center gap-2 pl-1 text-sm text-t3">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-lime" />
              CropGuard is thinking…
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-[rgba(224,92,74,0.28)] bg-[rgba(224,92,74,0.08)] px-3.5 py-2.5 text-sm text-red"
            >
              {error}
            </p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="no-print border-t border-b1 bg-bg2/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {followUps.length === 0 && !sending && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  onClick={() => onSend(text)}
                  className="rounded-full border border-b1 bg-bg3 px-3 py-1.5 text-[0.75rem] text-t2 transition-colors hover:border-b2 hover:text-ink"
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              className="field max-h-[12.5rem] min-h-[2.75rem] resize-none py-3"
              rows={1}
              placeholder="Ask a follow-up about this crop…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) submit(e)
              }}
              aria-label="Ask a follow-up question"
            />
            <button type="submit" className="btn btn-primary h-11" disabled={sending || !draft.trim()}>
              Send
            </button>
          </form>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.68rem] text-t3">
            <span>CropGuard remembers this photo and every answer above. Advice is advisory.</span>
            <span className="flex gap-3">
              <button onClick={() => window.print()} className="hover:text-t2">
                Save report
              </button>
              <button onClick={onNew} className="hover:text-t2">
                New diagnosis
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Message({ message, animate }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex animate-rise ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[46rem] rounded-2xl px-4 py-3 ${
          isUser
            ? 'border border-b2 bg-[rgba(122,191,58,0.1)]'
            : 'border border-b1 bg-card'
        }`}
      >
        <div className="mb-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-t3">
          {isUser ? 'You' : 'CropGuard'}
        </div>
        <div className="prose-chat">
          {isUser ? message.content : <TypingText text={message.content} animate={animate} />}
        </div>
      </div>
    </div>
  )
}

/**
 * Reveals `text` progressively so an answer reads as generated rather than
 * dropped in as a finished block. Duration scales with length but is capped
 * so long answers don't drag the follow-up interaction out.
 */
function TypingText({ text, animate }) {
  // Committed once at mount: `animate` flips to false shortly after this
  // message is marked "seen" (see the effect above), which would otherwise
  // cancel the reveal mid-flight on an instance that's still animating.
  const [shouldAnimate] = useState(animate)
  const [shown, setShown] = useState(shouldAnimate ? 0 : text.length)

  useEffect(() => {
    if (!shouldAnimate) return undefined

    const duration = Math.min(2400, 350 + text.length * 6)
    const start = performance.now()
    let frame

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration)
      setShown(Math.round(progress * text.length))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [text, shouldAnimate])

  const done = shown >= text.length

  return (
    <>
      {text.slice(0, shown)}
      {shouldAnimate && !done && <span className="typing-cursor" aria-hidden="true" />}
    </>
  )
}
