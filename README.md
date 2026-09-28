# CropGuard AI

Photograph a crop, get a diagnosis and a treatment plan, then keep asking questions.
Every diagnosis is saved to an account and can be reopened later, with the model
still holding the original photo and the whole conversation in context.

---

## Architecture

The browser never talks to Gemini. It talks to an API that owns the key, the
database and the conversation history.

```
React (Vite)  ──►  Express API  ──►  Postgres      (users, threads, messages)
                        │
                        ├──────────►  Gemini       (server-side key)
                        └──────────►  Disk         (crop photos, per user)
```

| Concern | Where it lives |
| --- | --- |
| Gemini API key | `server/.env`, never bundled |
| Session | 15-minute JWT in memory, rotating refresh token in an httpOnly cookie |
| History | Postgres, scoped to the owning user on every query |
| Crop photos | `server/uploads/<userId>/`, served only to the owner |

### How the model remembers

A conversation starts when a photo is uploaded. The server stores the photo and
the structured diagnosis. On every follow-up it rebuilds the full prompt:

1. The original photo, re-sent as inline image data.
2. The diagnosis JSON, replayed as the model's own first answer.
3. Every user and assistant turn since, in order.
4. The new question.

A fixed system instruction rides along on each call, telling the model to stay
consistent with the diagnosis it already gave and to say plainly when new
information changes its view. Because the photo is replayed rather than
summarised, a question like "look at the lower leaves again" still works on turn
twenty.

---

## Running it locally

You need Node 20 or newer and a Postgres 14 or newer database.

### 1. Install

```bash
npm run setup
```

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Fill in `server/.env`:

- `DATABASE_URL` — your Postgres connection string.
- `GEMINI_API_KEY` — from https://aistudio.google.com
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — two different random strings:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. Create the schema

```bash
npm run server:migrate
```

### 4. Start both processes

```bash
npm run server   # API on http://localhost:4000
npm run dev      # app on http://localhost:5173
```

The Vite dev server proxies `/api` to the backend, so the browser sees a single
origin and the refresh cookie stays same-site.

### 5. Check it

```bash
npm run server:test   # 11 boot-level API checks, no database needed
npm run lint
```

---

## Deploying

### Database

Any managed Postgres works. Set `DATABASE_SSL=true` for Neon, Supabase, RDS or
Render. Run `npm run server:migrate` once against the production database as
part of the release.

### API

Run `npm start` in `server/` behind TLS. Set `NODE_ENV=production`, which
switches the refresh cookie to `Secure` and `SameSite=None` and turns on
`trust proxy` so rate limits key off the real client IP rather than the load
balancer.

Set `CORS_ORIGINS` to your exact frontend origin. The API rejects any other
origin outright.

### Frontend

```bash
npm run build     # outputs dist/
```

Serve `dist/` from any static host. If the API is on a different origin, set
`VITE_API_URL` to its full base, for example `https://api.example.com/api`.
Serving both from one origin is simpler and avoids third-party cookie rules.

### Photo storage

Uploads go to local disk by default, which does not survive a container restart
and does not work across more than one instance. Mount a persistent volume, or
replace the two functions in `server/src/services/imageService.js` with S3 calls.
The rest of the code only ever sees an opaque path string.

---

## API

All conversation endpoints require `Authorization: Bearer <accessToken>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account and sign in |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/refresh` | Rotate the refresh cookie, issue a new access token |
| POST | `/api/auth/logout` | Revoke the current refresh token |
| GET | `/api/auth/me` | The signed-in user |
| PATCH | `/api/auth/me` | Change display name |
| POST | `/api/auth/change-password` | Change password, sign out other devices |
| GET | `/api/conversations` | History list, newest first, optional `q` search |
| POST | `/api/conversations` | Upload a photo, diagnose, open a thread |
| GET | `/api/conversations/:id` | The thread with all messages |
| GET | `/api/conversations/:id/image` | The crop photo |
| POST | `/api/conversations/:id/messages` | Ask a follow-up |
| PATCH | `/api/conversations/:id` | Rename |
| DELETE | `/api/conversations/:id` | Delete |

Errors are always `{ "error": { "message", "code", "details"? } }`. Validation
failures put a per-field message in `details`, which the sign-up form renders
inline.

---

## Security notes

- Passwords are bcrypt hashed at cost 12. A login against an unknown email still
  performs a comparison, so timing does not reveal which emails are registered.
- Refresh tokens are stored only as SHA-256 hashes and are rotated on every use.
  Presenting an already-rotated token revokes the whole chain, which is what a
  stolen cookie looks like.
- Access tokens are held in memory, never in `localStorage`, so an injected
  script cannot read one out of storage.
- Uploads are identified by magic bytes, not by the `Content-Type` the browser
  claims. Stored paths are re-resolved against the upload root before any read.
- Every conversation query filters on `user_id`. There is no endpoint that
  returns another account's data.
- Rate limits: 20 credential attempts per 15 minutes per IP and email, 12 model
  calls per minute per user, plus a configurable daily model-call quota.

### Not built yet

These are the gaps between this and a public launch:

- **Email verification and password reset.** Both need an email provider. The
  schema has room for the tokens; the flows are not written.
- **Streaming replies.** Answers arrive in one piece. Server-sent events on the
  messages endpoint would make long answers feel faster.
- **Thread compaction.** Very long conversations replay in full and get
  expensive. `MAX_CONVERSATION_TURNS` caps this bluntly at 40 turns.
