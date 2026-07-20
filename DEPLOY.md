# VORTEX AI — Deployment & Setup Guide

## 1) Vercel Environment Variables

Go to your Vercel project **Settings → Environment Variables** and add these:

### Required
- `DATABASE_URL` — your Postgres connection string
- `NEXTAUTH_URL` — your live domain, e.g. `https://vortex-ai.vercel.app`
- `NEXTAUTH_SECRET` — a strong random secret
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `NEXT_PUBLIC_GITHUB_CLIENT_ID` — from GitHub Developer Settings
- `GITHUB_CLIENT_SECRET` — from GitHub Developer Settings

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

## 6) Verify

- Visit `/register` to create an account
- Visit `/login` to sign in with email/password
- Google/GitHub buttons should appear after adding OAuth env vars
- After login, you should redirect to `/dashboard`