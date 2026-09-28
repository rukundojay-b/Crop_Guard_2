const BASE = import.meta.env.VITE_API_URL ?? '/api'

/**
 * The access token lives in memory only. localStorage would expose it to any
 * injected script; the long-lived refresh token stays in an httpOnly cookie
 * the JavaScript on this page cannot read.
 */
let accessToken = null
let onUnauthenticated = null

export const setAccessToken = (token) => {
  accessToken = token
}
export const getAccessToken = () => accessToken
export const setUnauthenticatedHandler = (fn) => {
  onUnauthenticated = fn
}

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details ?? null
  }
}

async function toError(response) {
  const body = await response.json().catch(() => null)
  return new ApiError(body?.error?.message ?? `Request failed (${response.status}).`, {
    status: response.status,
    code: body?.error?.code,
    details: body?.error?.details,
  })
}

// One refresh at a time. Without this, several parallel 401s would each start
// their own rotation and all but one would be rejected as token reuse.
let refreshInFlight = null

function refreshSession() {
  refreshInFlight ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (response) => {
      if (!response.ok) throw await toError(response)
      const data = await response.json()
      accessToken = data.accessToken
      return data
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

async function send(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const isFormData = body instanceof FormData

  const init = {
    method,
    credentials: 'include',
    signal,
    headers: {
      ...(isFormData || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: isFormData ? body : body === undefined ? undefined : JSON.stringify(body),
  }

  return fetch(`${BASE}${path}`, init)
}

/**
 * Performs a request, transparently refreshing an expired access token once
 * and replaying the original call.
 */
export async function request(path, options = {}) {
  let response = await send(path, options)

  if (response.status === 401 && !options.skipRefresh) {
    try {
      await refreshSession()
      response = await send(path, options)
    } catch (err) {
      accessToken = null
      onUnauthenticated?.()
      throw err
    }
  }

  if (!response.ok) throw await toError(response)
  if (response.status === 204) return null
  if (options.raw) return response
  return response.json()
}

export const api = {
  register: (payload) =>
    request('/auth/register', { method: 'POST', body: payload, skipRefresh: true }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, skipRefresh: true }),
  logout: () => request('/auth/logout', { method: 'POST', skipRefresh: true }),
  refresh: refreshSession,
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: payload }),

  listConversations: (params = {}) => {
    const search = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    ).toString()
    return request(`/conversations${search ? `?${search}` : ''}`)
  },
  getConversation: (id) => request(`/conversations/${id}`),
  createConversation: (file) => {
    const form = new FormData()
    form.append('image', file)
    return request('/conversations', { method: 'POST', body: form })
  },
  sendMessage: (id, content) =>
    request(`/conversations/${id}/messages`, { method: 'POST', body: { content } }),
  renameConversation: (id, title) =>
    request(`/conversations/${id}`, { method: 'PATCH', body: { title } }),
  deleteConversation: (id) => request(`/conversations/${id}`, { method: 'DELETE' }),

  /** Photos are owner-only, so they need the bearer token and cannot be a plain img src. */
  conversationImage: async (id) => {
    const response = await request(`/conversations/${id}/image`, { raw: true })
    return URL.createObjectURL(await response.blob())
  },
}
