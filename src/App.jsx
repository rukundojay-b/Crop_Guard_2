import { useCallback, useEffect, useState } from 'react'
import AuthScreen from './components/AuthScreen.jsx'
import ConversationView from './components/ConversationView.jsx'
import { MenuIcon } from './components/Icons.jsx'
import Sidebar from './components/Sidebar.jsx'
import UploadPanel from './components/UploadPanel.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { api } from './lib/apiClient.js'

export default function App() {
  const { status, isAuthenticated } = useAuth()

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-b1"
          style={{ borderTopColor: 'var(--color-lime)' }}
          role="status"
          aria-label="Loading"
        />
      </div>
    )
  }

  return isAuthenticated ? <Workspace /> : <AuthScreen />
}

function Workspace() {
  const [conversations, setConversations] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [activeId, setActiveId] = useState(null)
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [threadLoading, setThreadLoading] = useState(false)

  const [analysing, setAnalysing] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const refreshList = useCallback(async (q) => {
    try {
      const { conversations: items } = await api.listConversations({ q })
      setConversations(items)
    } catch (err) {
      setError(err.message)
    } finally {
      setListLoading(false)
    }
  }, [])

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => refreshList(search), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search, refreshList])

  useEffect(() => {
    if (!activeId) {
      setActive(null)
      setMessages([])
      return undefined
    }

    let cancelled = false
    setThreadLoading(true)
    setError(null)

    api
      .getConversation(activeId)
      .then(({ conversation, messages: thread }) => {
        if (cancelled) return
        setActive(conversation)
        setMessages(thread)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setActiveId(null)
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeId])

  const startNew = () => {
    setActiveId(null)
    setActive(null)
    setMessages([])
    setError(null)
    setSidebarOpen(false)
  }

  async function handleAnalyse(file) {
    setAnalysing(true)
    setError(null)
    try {
      const { conversation, messages: thread } = await api.createConversation(file)
      setActive(conversation)
      setActiveId(conversation.id)
      setMessages(thread)
      refreshList(search)
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalysing(false)
    }
  }

  async function handleSend(content) {
    if (!activeId) return

    // Show the question immediately; the placeholder is swapped for the saved
    // rows once the server answers.
    const optimistic = {
      id: `pending-${Date.now()}`,
      role: 'user',
      content,
      report: null,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    setSending(true)
    setError(null)

    try {
      const { messages: saved } = await api.sendMessage(activeId, content)
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), ...saved])
      refreshList(search)
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  async function handleRename(id, title) {
    const previous = conversations
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
    try {
      await api.renameConversation(id, title)
    } catch (err) {
      setConversations(previous)
      setError(err.message)
    }
  }

  async function handleDelete(id, title) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return

    const previous = conversations
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (id === activeId) startNew()

    try {
      await api.deleteConversation(id)
    } catch (err) {
      setConversations(previous)
      setError(err.message)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        loading={listLoading}
        onSelect={(id) => {
          setActiveId(id)
          setSidebarOpen(false)
        }}
        onNew={startNew}
        onRename={handleRename}
        onDelete={handleDelete}
        search={search}
        onSearchChange={setSearch}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b border-b1 px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn btn-ghost px-3 py-2"
            aria-label="Open history"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-semibold text-ink">
            {active?.title ?? 'New diagnosis'}
          </span>
        </header>

        {/* The thread manages its own scroll container so the composer can stay
            pinned; the upload view scrolls normally. */}
        <main className="min-h-0 flex-1 overflow-hidden">
          {activeId ? (
            <ConversationView
              conversation={active}
              messages={messages}
              loading={threadLoading}
              sending={sending}
              error={error}
              onSend={handleSend}
              onNew={startNew}
            />
          ) : (
            <div className="mx-auto h-full max-w-3xl overflow-y-auto px-4 py-10">
              <UploadPanel
                onAnalyse={handleAnalyse}
                busy={analysing}
                error={error}
                onDismissError={() => setError(null)}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
