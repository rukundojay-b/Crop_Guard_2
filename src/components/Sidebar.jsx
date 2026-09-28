import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { CloseIcon, LeafIcon, PencilIcon, TrashIcon } from './Icons.jsx'

const DAY = 86_400_000

/** Groups threads the way a reader scans them: today, then this week, then older. */
function groupByRecency(conversations) {
  const now = Date.now()
  const buckets = new Map([
    ['Today', []],
    ['Previous 7 days', []],
    ['Previous 30 days', []],
    ['Older', []],
  ])

  for (const item of conversations) {
    const age = now - new Date(item.lastMessageAt).getTime()
    const key =
      age < DAY ? 'Today' : age < 7 * DAY ? 'Previous 7 days' : age < 30 * DAY ? 'Previous 30 days' : 'Older'
    buckets.get(key).push(item)
  }

  return [...buckets.entries()].filter(([, items]) => items.length > 0)
}

const severityDot = (severity) =>
  severity === 'high'
    ? 'bg-red'
    : severity === 'medium'
      ? 'bg-amber'
      : severity === 'none'
        ? 'bg-t3'
        : 'bg-lime'

export default function Sidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onRename,
  onDelete,
  search,
  onSearchChange,
  open,
  onClose,
}) {
  const { user, logout } = useAuth()
  const grouped = useMemo(() => groupByRecency(conversations), [conversations])

  return (
    <>
      {/* On narrow screens the sidebar slides over the thread, so it needs a scrim. */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col border-r border-b1 bg-bg2 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-b1 px-4 py-3.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-b from-lime2 to-lime text-ink">
            <LeafIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-bold text-ink">CropGuard AI</div>
            <div className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-t3">
              Crop disease detection
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-t2 hover:bg-bg3 lg:hidden"
            aria-label="Close history"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5 px-3 py-3">
          <button onClick={onNew} className="btn btn-primary w-full">
            + New diagnosis
          </button>
          <input
            className="field text-[0.82rem]"
            type="search"
            placeholder="Search history"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search your diagnoses"
          />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {loading && conversations.length === 0 && (
            <div className="space-y-2 px-1 pt-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skel h-11 w-full" />
              ))}
            </div>
          )}

          {!loading && conversations.length === 0 && (
            <p className="px-3 pt-6 text-center text-xs leading-relaxed text-t3">
              {search
                ? 'Nothing matches that search.'
                : 'Your saved diagnoses will appear here once you analyse a photo.'}
            </p>
          )}

          {grouped.map(([label, items]) => (
            <div key={label} className="mb-3">
              <div className="px-3 pb-1.5 pt-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-t3">
                {label}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <ConversationRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    onSelect={onSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-b1 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-bg3 text-xs font-bold uppercase text-lime2">
              {(user?.displayName ?? '?').slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[0.82rem] font-semibold text-ink">
                {user?.displayName}
              </div>
              <div className="truncate text-[0.7rem] text-t3">{user?.email}</div>
            </div>
            <button
              onClick={logout}
              className="rounded-lg px-2 py-1.5 text-[0.72rem] font-semibold text-t2 hover:bg-bg3 hover:text-red"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

function ConversationRow({ item, active, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    const title = draft.trim()
    setEditing(false)
    if (title && title !== item.title) onRename(item.id, title)
    else setDraft(item.title)
  }

  if (editing) {
    return (
      <li>
        <input
          ref={inputRef}
          className="field text-[0.82rem]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(item.title)
              setEditing(false)
            }
          }}
        />
      </li>
    )
  }

  return (
    <li>
      <div
        className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
          active ? 'bg-bg3 ring-1 ring-b2' : 'hover:bg-bg3'
        }`}
      >
        <button
          onClick={() => onSelect(item.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={`h-1.5 w-1.5 flex-none rounded-full ${severityDot(item.severity)}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.82rem] font-medium text-ink">{item.title}</span>
            <span className="block text-[0.68rem] text-t3">
              {item.messageCount} message{item.messageCount === 1 ? '' : 's'}
            </span>
          </span>
        </button>

        <div className="flex flex-none items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={() => setEditing(true)}
            className="grid h-6 w-6 place-items-center rounded text-[0.7rem] text-t2 hover:text-lime2"
            aria-label={`Rename ${item.title}`}
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(item.id, item.title)}
            className="grid h-6 w-6 place-items-center rounded text-t2 hover:text-red"
            aria-label={`Delete ${item.title}`}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  )
}
