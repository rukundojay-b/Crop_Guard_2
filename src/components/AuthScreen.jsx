import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { LeafIcon } from './Icons.jsx'

const BLANK = { displayName: '', email: '', password: '' }

export default function AuthScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(BLANK)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'

  const update = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register')
    setFieldErrors({})
    setFormError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setFormError(null)
    setFieldErrors({})

    try {
      if (isRegister) {
        await register({
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          password: form.password,
        })
      } else {
        await login({ email: form.email.trim(), password: form.password })
      }
    } catch (err) {
      // The API returns per-field messages for validation failures and a single
      // message for everything else.
      if (err.details && typeof err.details === 'object') setFieldErrors(err.details)
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-lime2 to-lime text-ink shadow-[0_12px_30px_-14px_rgba(122,191,58,0.9)]">
            <LeafIcon className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-ink">CropGuard AI</h1>
          <p className="mt-1.5 text-sm text-t2">
            {isRegister
              ? 'Create an account to keep every diagnosis and pick up any conversation later.'
              : 'Sign in to reach your saved diagnoses and continue where you left off.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="panel space-y-4 p-6" noValidate>
          {isRegister && (
            <div>
              <label className="label" htmlFor="displayName">
                Your name
              </label>
              <input
                id="displayName"
                className="field"
                autoComplete="name"
                placeholder="Amina Nkurunziza"
                value={form.displayName}
                onChange={update('displayName')}
                aria-invalid={Boolean(fieldErrors.displayName)}
                required
              />
              {fieldErrors.displayName && <FieldError>{fieldErrors.displayName}</FieldError>}
            </div>
          )}

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="field"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
              aria-invalid={Boolean(fieldErrors.email)}
              required
            />
            {fieldErrors.email && <FieldError>{fieldErrors.email}</FieldError>}
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="field"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              placeholder={isRegister ? 'At least 10 characters' : 'Your password'}
              value={form.password}
              onChange={update('password')}
              aria-invalid={Boolean(fieldErrors.password)}
              required
            />
            {fieldErrors.password && <FieldError>{fieldErrors.password}</FieldError>}
            {isRegister && !fieldErrors.password && (
              <p className="mt-1.5 text-xs text-t3">
                At least 10 characters, including a letter and a number.
              </p>
            )}
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-[rgba(224,92,74,0.28)] bg-[rgba(224,92,74,0.08)] px-3.5 py-2.5 text-sm text-red"
            >
              {formError}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Working…' : isRegister ? 'Create account' : 'Sign in'}
          </button>

          <p className="pt-1 text-center text-sm text-t2">
            {isRegister ? 'Already have an account?' : 'New to CropGuard?'}{' '}
            <button
              type="button"
              onClick={switchMode}
              className="font-semibold text-lime2 underline-offset-4 hover:underline"
            >
              {isRegister ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-t3">
          Guidance is advisory. Confirm with a local agricultural officer before treating at scale.
        </p>
      </div>
    </div>
  )
}

const FieldError = ({ children }) => <p className="mt-1.5 text-xs text-red">{children}</p>
