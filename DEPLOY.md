# VORTEX AI — Deployment & Setup Guide

## 1) Vercel Environment Variables

Go to your Vercel project **Settings → Environment Variables** and add these:

### Required
- `DATABASE_URL` — your Postgres connection string
- `NEXTAUTH_URL` — your live domain, e.g. `https://vortex-ai.vercel.app`
- `NEXTAUTH_SECRET` — a strong random secret
- `GOOGLE_CLIENT_ID` — from Google Cloud Console (server-side, used by NextAuth)
- `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `GITHUB_CLIENT_ID` — from GitHub Developer Settings (server-side, used by NextAuth)
- `GITHUB_CLIENT_SECRET` — from GitHub Developer Settings
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — from Google Cloud Console (client-side, used to show the Google sign-in button)
- `NEXT_PUBLIC_GITHUB_CLIENT_ID` — from GitHub Developer Settings (client-side, used to show the GitHub sign-in button)

### Optional
- `REDIS_URL`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `SUNO_API_KEY`, etc. from `.env.example`

After adding env vars, **redeploy** from the Vercel dashboard.

## 2) Google OAuth Setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://<your-vercel-domain>`
4. Authorized redirect URIs:
   - `https://<your-vercel-domain>/api/auth/callback/google`
5. Copy Client ID and Client Secret into Vercel env vars

## 3) GitHub OAuth Setup

1. Go to https://github.com/settings/developers
2. New OAuth App
3. Authorization callback URL:
   - `https://<your-vercel-domain>/api/auth/callback/github`
4. Copy Client ID and Client Secret into Vercel env vars

## 4) NEXTAUTH_SECRET

Generate a strong random secret:
- macOS/Linux: `openssl rand -base64 32`
- Windows PowerShell: `[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))`

Add it as `NEXTAUTH_SECRET` in Vercel Settings → Environment Variables.

## 5) Prisma Migrations

### Local setup
```bash
# Copy env
cp .env.example .env

# Update DATABASE_URL in .env to your local or remote Postgres

# Generate Prisma client
cd apps/web
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

### If no migrations folder exists
If `apps/web/prisma/migrations` is empty, create the initial migration:
```bash
cd apps/web
npx prisma migrate dev --name init
```

### Production / Vercel
- Add `DATABASE_URL` in Vercel env vars pointing to your Postgres
- Run migrations locally against the same DATABASE_URL:
```bash
cd apps/web
npx prisma migrate deploy
```

## 6) Object Storage (MinIO) — avatar & asset uploads

Local dev stores uploads in MinIO (see `docker-compose.yml`). So the browser can
load uploaded avatars, make the `avatars` prefix publicly readable:

```bash
docker exec vortex-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec vortex-minio mc mb --ignore-existing local/vortex-assets
docker exec vortex-minio mc anonymous set download local/vortex-assets/avatars
```

For production S3-compatible storage, either make the bucket (or the avatars
prefix) public, or serve objects through signed URLs / a CDN.

## 7) Verify

- Visit `/register` to create an account
- Visit `/login` to sign in with email/password
- Google/GitHub buttons should appear after adding OAuth env vars
- After login, you should redirect to `/dashboard`
## 8) AI Service (LLM-powered creative tools)

The web app delegates AI work to the FastAPI microservice in `apps/ai-service`
(strategy generation + scene prompt enhancement). Calls are proxied server-side
through the web app's `/api/v1/ai/*` routes, so LLM keys never reach the browser.

### Environment variables

On Vercel (web app):
- `AI_SERVICE_URL` — base URL of the running AI service, e.g.
  `https://ai-service.your-domain.com` (or `http://localhost:8000` locally).

On the AI service itself:
- `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` — LLM provider keys
- `MOCK_LLM=true` — deterministic offline responses (development/testing only)

Provider resolution order: Mock → OpenAI → Anthropic. If none is configured,
the AI endpoints return `503`.

### Deploying the service

Local (with Docker):
```bash
docker compose up --build ai-service    # listens on :8000
```

Without Docker:
```bash
cd apps/ai-service
python -m venv .venv && . .venv/Scripts/Activate.ps1
pip install -r requirements-dev.txt
MOCK_LLM=true uvicorn src.main:app --reload
```

For production, deploy `apps/ai-service` (it ships with a `Dockerfile`) to any
container host — Railway, Render, Fly.io, EC2, etc. — then set `AI_SERVICE_URL`
on Vercel to point at it.

### Credit costs

AI calls charge usage credits (atomic debit + a `credit_transactions` "usage"
row): **5 credits** per storyboard strategy, **1 credit** per prompt enhancement.
New accounts start with a 100-credit signup bonus. Users with insufficient
credits get a `402 Payment Required` response with a clear message.