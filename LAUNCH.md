# VORTEX AI — Go-Live Guide (Step by Step)

This guide takes the repo from "working on my machine" to "used by the public".
It is deliberately simple: one step at a time, copy-paste commands, clear
checklists. Deep technical details live in [`DEPLOY.md`](./DEPLOY.md) — this
guide tells you **what to click / run / set**, in order.

> ⏱️ Estimated total: **1–2 weeks** of focused work for a solo operator.
> Mark each step with ✅ as you finish it so you always know where you are.

---

## Accounts you need (create these first — you'll need them throughout)

| Service | Use | Sign up at |
|---|---|---|
| **Vercel** | Hosts the Next.js web app | https://vercel.com |
| **Neon** (or Supabase/RDS) | Postgres database | https://neon.tech |
| **Upstash** (or Redis Cloud) | Redis (queues + rate limiting) | https://upstash.com |
| **Railway** (or Fly.io/Render) | Hosts the FastAPI AI service | https://railway.app |
| **Cloudflare R2** (or AWS S3) | Object storage for images/video/audio | https://cloudflare.com |
| **Stripe** | Credit purchases / payments | https://stripe.com |
| **Resend** (optional) | Transactional email | https://resend.com |
| Generation providers | Kling, Runway, Hailuo, WAN, OpenAI, ElevenLabs, Suno, Stability, FLUX | their own dashboards |

---

## Phase 0 — Confirm your starting point (15 min) 🟢

The codebase is already fully built and tested. Confirm:

- [ ] `git fetch origin main` then run the CI link:
  `https://github.com/Damina24/Vortex/actions` — **last run should be green**.
- [ ] Locally, `cd apps/web` then `npm test` passes (353 tests).
- [ ] Locally, `npm run lint` shows **No ESLint warnings or errors**.

If all green, you're ready. No code changes needed for launch.

---

## Phase 1 — Database (Neon Postgres) (1–2 hrs) 🟢

1. Create a Neon project (free tier is fine to start).
2. In Neon **Dashboard → Connection Details**, copy the connection string.
   - Use the **pooled** connection string for the app.
   - Use the **direct** connection string for running migrations.
3. Create the schema by running migrations against your **direct** URL:
   ```powershell
   cd apps/web
   $env:DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
   npx prisma generate
   npx prisma migrate deploy
   ```
4. Keep both connection strings — you'll add them to Vercel in Phase 5.

- [ ] `npx prisma migrate deploy` ran without errors
- [ ] You can connect from your machine (`npx prisma studio` opens tables)

---

## Phase 2 — Redis (Upstash) (30 min) 🟢

1. Create a Redis database on Upstash.
2. Copy the **Redis connection URL** (rest or URL form).
3. That URL becomes `REDIS_URL` in Vercel later.
4. (Rate limiting is used only if configured — `UPSTASH_REDIS_REST_URL`
   and `UPSTASH_REDIS_REST_TOKEN` are optional extras from `.env.example`.)

- [ ] You have a `REDIS_URL` that abides by Upstash's allowlist (add your
      Vercel deployment IPs/region if needed)

---

## Phase 3 — Object storage (Cloudflare R2 or AWS S3) (1 hr) 🟢

1. Create a bucket (e.g. `vortex-assets`).
2. Create an access key + secret key (R2: "Manage R2 API Tokens"; S3: IAM
   user with `PutObject`/`GetObject` on the bucket).
3. Set up a **public read** URL for the bucket, OR use a custom domain with R2.
   (The app currently serves `S3_PUBLIC_URL` directly — start with public-read.)
4. Note these values (you'll set them in Vercel in Phase 5):

| Env var | Example |
|---|---|
| `S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` (S3: leave blank) |
| `S3_REGION` | `us-east-1` (R2: `auto`) |
| `S3_BUCKET` | `vortex-assets` |
| `S3_ACCESS_KEY_ID` | your key id |
| `S3_SECRET_ACCESS_KEY` | your secret |
| `S3_PUBLIC_URL` | e.g. `https://vortex-assets.example.com` |

> The app degrades gracefully: if storage is unreachable it falls back to
> inline data-URI output, so a mis-config won't hard-crash generation.

- [ ] You can upload a test file to the bucket and open it in a browser
---

## Phase 4 — AI service (FastAPI on Railway) (2–3 hrs) 🟡

The AI service powers storyboard strategy + prompt enhancement.

1. Deploy a **new Railway project → Deploy from GitHub repo**.
2. Set the **service source** to `apps/ai-service` (Railway source directory).
3. Railway auto-detects the `Dockerfile`. Confirm the start command:
   `uvicorn src.main:app --host 0.0.0.0 --port 8000`.
4. Add the AI service env vars:

| Env var | Value |
|---|---|
| `OPENAI_API_KEY` | your OpenAI key (or `ANTHROPIC_API_KEY`) |
| `ANTHROPIC_API_KEY` | optional, unused if OpenAI is set |
| `OPENAI_MODEL` | `gpt-4o-mini` (leave default) |
| `MOCK_LLM` | `false` (production) |

5. Railway gives you a URL like `https://vortex-ai.up.railway.app`.
   Test it: open `<your-url>/health` — should return OK.
6. Save this URL as `AI_SERVICE_URL` in Vercel later.

- [ ] `/health` returns OK from a browser
- [ ] You have the final `AI_SERVICE_URL` value

> You can also run it locally with Docker:
> `docker compose build ai-service && docker compose up ai-service` — but a
> public host is required for production.

---

## Phase 5 — The main event: deploy the web app on Vercel (2–4 hrs) 🔴

1. **Vercel → Add New Project → Import** the `Damina24/Vortex` repo.
2. In project settings, set:
   - **Root Directory**: `apps/web`  ← critical
   - **Framework Preset**: Next.js (auto-detected)
3. Add ALL the environment variables below (Vercel → Settings → Environment
   Variables). Grouped so you can't miss any:

**Core**
```
DATABASE_URL=<pooled Neon URL>
REDIS_URL=<Upstash URL>
NEXTAUTH_URL=https://<your-app-domain>
NEXTAUTH_SECRET=<random secret>          # see DEPLOY.md §4 for generator
```
**Auth (Google / GitHub)** — optional, from `.env.example`: `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GITHUB_CLIENT_ID`.

**AI service**
```
AI_SERVICE_URL=<railway url>
```
**Storage**
```
S3_ENDPOINT= S3_REGION= S3_BUCKET= S3_ACCESS_KEY_ID= S3_SECRET_ACCESS_KEY= S3_PUBLIC_URL=
```
**Stripe**
```
STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= NEXT_PUBLIC_APP_URL=https://<domain>
```
**Generation providers** — set each provider you want to enable, defaulting to
`mock` when you leave keys blank:
- Video: `VIDEO_PROVIDER=mock|kling|runway|hailuo|wan|ffmpeg`, `KLING_API_KEY`,
  `KLING_API_SECRET`, `RUNWAY_API_KEY`, `HAILUO_API_KEY`, `WAN_API_KEY`, plus
  model overrides (`RUNWAY_VIDEO_MODEL`, `HAILUO_MODEL`, `WAN_MODEL`).
- Audio: `AUDIO_PROVIDER=mock|openai|elevenlabs|suno`, `ELEVENLABS_API_KEY`,
  `SUNO_API_KEY` + optional model overrides.
- Image: `IMAGE_PROVIDER=mock|stability|flux|gpt-image`, `STABILITY_API_KEY`,
  `FLUX_API_KEY`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`.
**Feature flags**
```
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_PUBLISHING=false   # flip true when publishing is configured
NEXT_PUBLIC_ENABLE_TEAMS=false
```
4. Click **Deploy**. Wait for the build.
5. After it succeeds, **Settings → Domains** → add your real domain
   (e.g. `vortex.app`) and point its DNS at Vercel.
6. Update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the final domain and
   redeploy if they changed since step 3.

- [ ] `https://<domain>` loads the landing page
- [ ] `/login`, `/register`, and `/dashboard` route correctly

---

## Phase 6 — Auth (Google / GitHub sign-in) (1 hr) 🟡

Follow **DEPLOY.md sections 2–4** exactly:
1. Google Cloud Console → create OAuth client → authorized redirect URI
   `https://<domain>/api/auth/callback/google` → paste IDs/secrets into Vercel.
2. GitHub Developer Settings → OAuth App → callback
   `https://<domain>/api/auth/callback/github`.
3. Set `NEXTAUTH_SECRET` (random 32 bytes base64) if not already.

- [ ] You can sign in with email+password
- [ ] Google / GitHub buttons work (if configured)

---

## Phase 7 — Stripe billing (2–3 hrs) 🔴

1. In Stripe Dashboard → **Developers → API keys**, copy publishable + secret
   keys (start in **test mode**!).
2. Add to Vercel: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`.
3. Stripe Dashboard → **Webhooks → Add endpoint**:
   - URL: `https://<domain>/api/v1/billing/webhook`
   - Event: **`checkout.session.completed`**
   - Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`.
4. Redeploy the app.
5. Test end-to-end **in test mode**: buy a package (`/dashboard/credits`) with
   Stripe's test card `4242 4242 4242 4242`. Balance should update after the
   webhook fires.
6. Verify transactions appear at `/dashboard/credits` and balance broadcasts
   to the sidebar/header.
7. **Before going live**: activate your Stripe account, flip keys from
   `sk_test...`/`pk_test...` to `sk_live...`/`pk_live...`.

- [ ] A test card purchase adds the right number of credits (no double)
- [ ] Webhook shows `200` in Stripe Dashboard → Webhooks → recent deliveries

---

## Phase 8 — Generation providers (pick the real ones) 🔴

Use **mock providers first** to validate the flow, then enable real ones one at
a time. For each real provider you enable:

1. Get its API key.
2. Add the key + provider env to Vercel (list in Phase 5).
3. Redeploy.
4. In the app, generate something with that provider and confirm:
   - Video: Scenes page → "Generate Video" → async poll → inline MP4 player.
   - Audio: Audio Suite → voiceover/music → asset appears in Library.
   - Image: Image Suite → image appears in Library.

> The UI disables providers whose keys aren't set ("not configured"), so you
> can enable any subset at launch.

- [ ] Video renders with at least one real provider (Kling/Runway/Hailuo/WAN)
- [ ] Audio renders with at least one real provider (OpenAI/ElevenLabs/Suno)
- [ ] Images render with at least one real provider (Stability/FLUX/gpt-image)

---

## Phase 9 — Publishing to YouTube/TikTok/Meta (optional) 🟡

Only if you want the "Publish" feature turned on.

1. Set `NEXT_PUBLIC_ENABLE_PUBLISHING=true` in Vercel.
2. Add the publishing credentials from `.env.example`:
   `PUBLISHING_PROVIDER`, `YOUTUBE_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN`,
   `META_ACCESS_TOKEN`, `META_PAGE_ID`, plus client id/secret pairs
   (`YOUTUBE_CLIENT_ID/SECRET`, `TIKTOK_CLIENT_KEY/SECRET`,
   `GOOGLE_ADS_CLIENT_ID/SECRET`, `META_APP_ID/SECRET`).
3. Test publishing an A/B campaign from `/dashboard/publishing`.

- [ ] A campaign publishes to at least one platform in test/dev

---

## Phase 10 — Email (Resend, optional) 🟡

1. Create a Resend account and an API key.
2. Add to Vercel: `RESEND_API_KEY`, `EMAIL_FROM=noreply@vortex.ai` (verify your
   sending domain in Resend).
3. Where the app sends email (e.g. welcome/transactional), it will now work.

- [ ] A test email arrives in your inbox

---

## Phase 11 — Pre-launch test pass (staging) 🟢

Open **incognito** and walk the exact path a stranger takes. Use the
credits-page demo purchase only if you haven't wired Stripe yet; otherwise use a
real (live-mode) small purchase.

Checklist:
- [ ] Landing page loads; "Log in" / "Register" work
- [ ] New user registers → lands in dashboard
- [ ] Create a project → assign a Brand DNA profile
- [ ] Generate a storyboard (strategy costs credits)
- [ ] Play a video render in the Scenes page
- [ ] Generate audio in the Audio Suite (Brand Voice chip shows)
- [ ] Generate an image in the Image Suite (Brand DNA chip shows)
- [ ] Buy credits → balance updates immediately (webhook)
- [ ] Hit "Generate" with 0 credits → 402 → buy-credits CTA appears
- [ ] (If enabled) Publish an A/B campaign
- [ ] Log out / log back in; session persists on refresh
- [ ] No console errors on any page (DevTools)

---

## Phase 12 — Go live 🎉

1. **Stripe**: flip to Live mode (`sk_live...`/`pk_live...`) and run one real
   small purchase.
2. **Custom domain**: confirm `https://<your-domain>` resolves to the app.
3. **Verify** with one more incognito pass (Phase 11) on the live URL.
4. Announce/publish. 🎈

---

## Phase 13 — Post-launch ops (ongoing) 🟢

- **Watch the Stripe webhook** page for failed deliveries (credits not granted).
- **Monitor AI service**: Railway logs + `/health` uptime checks.
- **Set up error visibility** (e.g. Sentry) — the app logs to `console.error`;
  a provider is required to surface them.
- **Back up the database** nightly (Neon has point-in-time restore built in).
- **Watch usage/costs**: LLM, generation providers, and S3 egress.
- **Scale later**: add a second Vercel region, Redis on a managed tier, and
  presigned URLs for private storage when traffic grows.

---

## Troubleshooting quick-reference

| Symptom | Fix |
|---|---|
| Provider dropdown shows "(not configured)" | key env var missing in Vercel; set it + redeploy |
| Credits not added after Stripe payment | check Vercel `STRIPE_WEBHOOK_SECRET` + Stripe webhook deliveries |
| Images generate but can't be viewed | `S3_PUBLIC_URL` not publicly readable / wrong bucket |
| "402" on generation | user has 0 credits — that's the designed buy-credits gate |
| Dashboard 500s after deploy | `DATABASE_URL` wrong in Vercel; check Neon pooled URL |
| AI tools say "service unavailable" | `AI_SERVICE_URL` unreachable from Vercel; check Railway port + allowlist |