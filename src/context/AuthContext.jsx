import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setAccessToken, setUnauthenticatedHandler } from '../lib/apiClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading') // loading | authenticated | anonymous

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus('anonymous')
  }, [])

  // A refresh that fails anywhere in the app drops straight back to the sign-in screen.
  useEffect(() => {
    setUnauthenticatedHandler(clearSession)
    return () => setUnauthenticatedHandler(null)
  }, [clearSession])

  // On a cold load the access token is gone but the refresh cookie may not be,
  // so try once to restore the session before showing the sign-in screen.
  useEffect(() => {
    let cancelled = false

    api
      .refresh()
      .then((data) => {
        if (cancelled) return
        setUser(data.user)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!cancelled) clearSession()
      })

    return () => {
      cancelled = true
    }
  }, [clearSession])

  // Access tokens are short-lived; rotate ahead of expiry so a long session
  // never shows the user an avoidable interruption.
  useEffect(() => {
    if (status !== 'authenticated') return undefined

    const timer = setInterval(
      () => {
        api
          .refresh()
          .then((data) => setUser(data.user))
          .catch(clearSession)
      },
      10 * 60 * 1000,
    )

    return () => clearInterval(timer)
  }, [status, clearSession])

  const adopt = useCallback((data) => {
    setAccessToken(data.accessToken)
    setUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      login: async (credentials) => adopt(await api.login(credentials)),
      register: async (payload) => adopt(await api.register(payload)),
      logout: async () => {
        await api.logout().catch(() => {})
        clearSession()
      },
      updateProfile: async (payload) => {
        const { user: updated } = await api.updateProfile(payload)
        setUser(updated)
        return updated
      },
    }),
    [user, status, adopt, clearSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.')
  return context
}
