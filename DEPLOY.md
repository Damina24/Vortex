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

AI call usage credits (atomic debit + a `credit_transactions` "usage" row):
**5 credits** per storyboard strategy, **1 credit** per prompt enhancement,
**10 credits** per video render, **5 credits** per voiceover, **8 credits**
per background music track. New accounts start with a 100-credit signup bonus.
Users with insufficient credits get a `402 Payment Required` response with a
clear message.

## 9) Billing (credit purchases via Stripe)

Users buy credit packages (Starter 250 / $19, Pro 1000 / $49, Business
5000 / $149) to refill their balance. The two endpoints and the shared
package/ledger logic live in `apps/web/src`:

- `POST /api/v1/billing/checkout` — creates a Stripe Checkout Session and
  returns its URL. Prices/credits are read from the single-source-of-truth
  `src/lib/billing/packages.ts`.
- `POST /api/v1/billing/webhook` — verifies the Stripe signature and, on
  `checkout.session.completed`, atomically:
  1. inserts a `credit_transactions` row of type `purchase` (`+N` credits),
  2. increments the user's `creditsBalance` and bumps `subscriptionTier`.
     The transaction primary key is derived deterministically (UUID v5) from the
     Stripe session id, so **retried deliveries are idempotent** — duplicate
     events collide on the primary key and are skipped instead of double-crediting.
- `GET /api/v1/billing/transactions` — last 25 ledger rows shown on the
  credits page (`/dashboard/credits`), which also shows the live balance.

### Environment variables (web app)

- `STRIPE_SECRET_KEY` — Stripe secret key.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the webhook.
- `NEXT_PUBLIC_APP_URL` — absolute public URL used in success/cancel URLs.

### Demo / no-payment mode

When `STRIPE_SECRET_KEY` is **not** set, `POST /api/v1/billing/checkout`
completes the purchase immediately (same `addPurchaseCredits` helper the
webhook uses, recorded as a "Demo purchase" transaction) so the full flow works
locally without payment keys. On the credits page such purchases are confirmed
in place: the ledger refreshes, the balance broadcast updates the
header/sidebar/dashboard stats immediately, and no Stripe redirect happens.
Set the keys above to switch to real payments.

### Purchase verification after Stripe payment

After a real Stripe payment the user is redirected back to
`/dashboard/credits?checkout=success`, but the webhook can lag a few seconds
behind. The credits page therefore polls
`GET /api/v1/billing/transactions` (every 1.5s, up to ~60s) until a
`purchase` ledger row created around page-load appears, then shows the
confirmation toast and broadcasts the balance update — so the UI never claims
credits were added before the webhook actually granted them.

### Stripe webhook setup

1. In the Stripe Dashboard → _Webhooks_, add an endpoint pointing at
   `{NEXT_PUBLIC_APP_URL}/api/v1/billing/webhook`.
2. Subscribe to the **`checkout.session.completed`** event (others can be
   safely ignored).
3. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

The legacy `POST /api/v1/billing/credits` endpoint (which granted credits with
no payment) has been removed.

## 10) Video generation (mock-first pipeline)

Scene renders follow the same provider-agnostic architecture as the AI service:
a `VideoGenerationProvider` interface with a deterministic offline
`MockVideoProvider` that ships with the app, so the **entire flow works without
any external API keys**.

### How it works

- `POST /api/v1/generation-jobs` `{ sceneId }` — validates scene ownership,
  charges **10 credits** up front, creates a `generation_jobs` row (video), and
  drives it through `queued → processing → completed | failed`.
- On success it persists the output file(s) to object storage
  (`src/lib/generation/storage.ts`, MinIO/S3 with an inline-data-URI fallback),
  creates a video `Asset`, links it to the scene's `generated_video_id`, and
  keeps the storyboard status in sync (`generating` → `completed` once all
  scenes are done).
- `GET /api/v1/generation-jobs/[id]` — returns the job status, ready for
  polling once real (asynchronous) render providers are plugged in.
- UI: the **Scenes** page (`/dashboard/storyboards/[id]/scenes`) shows a
  "Generate Video · 10 credits" button per scene, a rendering state, an inline
  preview for completed renders, a retry state on failure, and the standard
  buy-credits alert on `402`.

### Config

- `VIDEO_PROVIDER=mock` (default) — the only built-in provider. Set
  `MOCK_RENDER_DELAY_MS` to tune the simulated render latency (0 for instant).
- Real providers (Kling, Runway, Hailuo, WAN, …) implement
  `VideoGenerationProvider` in `apps/web/src/lib/generation/providers.ts`,
  register in `PROVIDER_REGISTRY`, and set `VIDEO_PROVIDER=<name>`.
- **Provider availability UX** — the Scenes page computes availability
  server-side (`getVideoProviderAvailability` in `providers.ts`, driven by the
  credential env vars) and passes it to the scene generator. Providers whose
  keys aren't configured show as *"(not configured)"*, are disabled in the
  dropdown, and block the Generate button with an explanatory hint. The
  catalog (`VIDEO_PROVIDER_CATALOG` in `providers-catalog.ts`) is the shared
  source of truth for the dropdown labels.
- **Async (two-phase) providers** — real render providers don't return
  synchronously, so the pipeline supports async providers via `submit()`
  (returns a `providerJobId` immediately) and `retrieve(providerJobId, params)`
  (`processing` | `succeeded` | `failed`). `createVideoGenerationJob` submits
  and returns the still-`processing` job; `GET /api/v1/generation-jobs/[id]`
  calls `completeVideoGenerationJob`, which advances a `processing` job to
  completion (persists files, creates the video `Asset`, syncs scene/storyboard)
  once the provider reports it is done — so clients just poll the GET route.
- `VIDEO_PROVIDER=mock-async` is a stateless simulation of an async provider
  (tune latency with `MOCK_ASYNC_LATENCY_MS`) that exercises the full
  submit → poll → complete flow offline; `mock` completes synchronously and
  remains the default.
- In mock mode the "video" is an SVG poster card derived from the scene prompt
  so the pipeline is exercisable end-to-end locally (Docker/Postgres optional —
  the routes also tolerate S3 being down).
- Every credit spend is a `credit_transactions` "usage" row linked to the job,
  and `related_job_id` preserves the job → transaction link.

### Real provider: Kling AI (`VIDEO_PROVIDER=kling`)

An optional **real** video provider backed by the Kling AI text-to-video API.

- Set `VIDEO_PROVIDER=kling` and provide `KLING_API_KEY` + `KLING_API_SECRET`
  (from the Kling AI developer console). Optionally set `KLING_MODEL` (default
  `kling-v1`) and `KLING_MODE` via the provider config (`std` | `pro`,
  default `std`).
- Auth uses Kling's access-key/secret signing: the `Api-Key`, `Api-Secret`,
  `Timestamp` (Unix seconds), and `Signature` (hex HMAC-SHA256 of the timestamp
  keyed by the secret) headers.
- Kling renders asynchronously, so the provider implements the two-phase
  interface: `submit()` creates a task (`POST /v1/videos/text2video`,
  `duration` is rounded to Kling's supported `5`/`10` clips) and
  `retrieve(providerJobId, params)` polls `GET /v1/videos/text2video/{id}`,
  returning `processing` while queued and, once `succeed`, downloading the
  finished MP4 and wrapping it in a `GenerationResult` (real `video/mp4`
  asset). Failed renders surface Kling's `task_status_msg` as the job error.
- The provider is wired through the exact same submit → poll → complete flow as
  `mock-async` (documented above), so no pipeline changes were required —
  clients already poll `GET /api/v1/generation-jobs/[id]`.
- **Brand DNA auto-enforcement** - when a project has a brand profile
  assigned, video generation honors it end-to-end. `enrichScenePrompts`
  (`src/lib/brand-dna.ts`) appends the profile's visual style guide (brand
  colors, accent colors, heading/body fonts, logo placement and minimum size)
  to the render prompt and moves forbidden colors/words into the negative
  prompt - applied both in `createVideoGenerationJob` and when the async
  completion path (`completeVideoGenerationJob`) polls a provider. The
  enriched prompts are stored in the job's `inputParams`, so the audit trail
  matches what the provider actually rendered. The storyboard/scenes pages
  show the active profile as a "Brand DNA" chip, and the new-storyboard page
  surfaces whether a profile will apply to the project.

### Real provider: Runway (`VIDEO_PROVIDER=runway`)

An optional **real** video provider backed by the Runway text-to-video API.

- Set `VIDEO_PROVIDER=runway` and provide `RUNWAY_API_KEY` (from the Runway
  developer console). Optionally set `RUNWAY_VIDEO_MODEL` (default `gen3a_turbo`).
- Auth uses a standard `Authorization: Bearer <key>` header.
- Runway renders asynchronously, so the provider implements the two-phase
  interface: `submit()` creates a task (`POST /v1/text_to_video` with
  `model`/`prompt`/`ratio`/`duration`, where `duration` is rounded to Runway's
  supported `5`/`10` clips and ratios map to Runway's `WIDTH:HEIGHT` strings)
  and `retrieve(providerJobId, params)` polls `GET /v1/text_to_video/{id}`,
  returning `processing` for `PENDING`/`RUNNING`/`THROTTLED` and, once
  `SUCCEEDED`, downloading the finished MP4 from `output` and wrapping it in a
  `GenerationResult` (real `video/mp4` asset). Failed renders surface Runway's
  `error` message as the job error.
- The provider is wired through the exact same submit → poll → complete flow as
  `mock-async` and `kling`, so no pipeline changes were required — clients
  already poll `GET /api/v1/generation-jobs/[id]`.
- Implemented against Runway's public API contract
  (developers.runwayml.com) — verify the exact request/response shape with a
  live key before going to production.

### Real provider: Hailuo (`VIDEO_PROVIDER=hailuo`)

An optional **real** video provider backed by the MiniMax Hailuo video-generation API.

- Set `VIDEO_PROVIDER=hailuo` and provide `HAILUO_API_KEY` (from the MiniMax
  platform). Optionally set `HAILUO_MODEL` (default `hailuo-02`).
- Auth uses a standard `Authorization: Bearer <key>` header.
- Hailuo renders asynchronously, so the provider implements the two-phase
  interface: `submit()` creates a task (`POST /v1/video_generation` with
  `model`/`prompt`/`aspect_ratio`/`duration`, where `duration` is rounded to
  Hailuo's supported `6`/`8` second clips) and
  `retrieve(providerJobId, params)` polls `GET /v1/query/video_generation`,
  returning `processing` for `Queueing`/`Processing` and, once `Success`,
  downloading the finished MP4 from `video_url` and wrapping it in a
  `GenerationResult` (real `video/mp4` asset). Failed renders surface MiniMax's
  `base_resp.status_msg` as the job error.
- The provider is wired through the exact same submit → poll → complete flow as
  `mock-async`, `kling`, and `runway`, so no pipeline changes were required —
  clients already poll `GET /api/v1/generation-jobs/[id]`.
- Implemented against MiniMax's public Hailuo API contract
  (platform.minimaxi.com) — verify the exact request/response shape with a live
  key before going to production.

### Real provider: WAN (`VIDEO_PROVIDER=wan`)

An optional **real** video provider backed by the DashScope (Alibaba Model
Studio) text-to-video API for the WAN models.

- Set `VIDEO_PROVIDER=wan` and provide `WAN_API_KEY` (from the Alibaba Cloud /
  DashScope console). Optionally set `WAN_MODEL` (default `wan2.2-t2v-flash`).
- Auth uses a standard `Authorization: Bearer <key>` header.
- WAN renders asynchronously, so the provider implements the two-phase
  interface: `submit()` creates a task
  (`POST /api/v1/services/aigc/text2video/image-synthesis` with
  `model`/`input.prompt`/`parameters.size`/`parameters.duration`, where
  `duration` is rounded to WAN's supported `5`/`10` second clips and ratios map
  to DashScope `WIDTH*HEIGHT` size strings) and
  `retrieve(providerJobId, params)` polls `GET /api/v1/tasks/{id}`, returning
  `processing` for `PENDING`/`RUNNING` and, once `SUCCEEDED`, downloading the
  finished MP4 from `output.video_url` and wrapping it in a `GenerationResult`
  (real `video/mp4` asset). Failed renders surface DashScope's `message` as the
  job error.
- The provider is wired through the exact same submit → poll → complete flow as
  `mock-async`, `kling`, `runway`, and `hailuo`, so no pipeline changes were
  required — clients already poll `GET /api/v1/generation-jobs/[id]`.
- Implemented against DashScope's public WAN API contract (Model Studio) —
  verify the exact request/response shape with a live key before going to
  production.

### Real provider: FFmpeg (`VIDEO_PROVIDER=ffmpeg`)

An optional **local** render provider that produces a real, playable MP4 using
the `ffmpeg` binary on the machine running the web app — no third-party API key
required.

- Set `VIDEO_PROVIDER=ffmpeg`. ffmpeg must be installed and on `PATH`, or point
  `FFMPEG_PATH` at the binary. Tune the simulated render latency with
  `FFMPEG_RENDER_DELAY_MS` (ms, default `1500`).
- **Brand DNA palette** — the frame background is driven by the brand colors the
  prompt-enrichment already injects: `extractHexColors` reads the `#hex` tokens
  appended to the render prompt (first color → background, second → accent) and
  falls back to the VORTEX gradient when none are present.
- **Async two-phase** — implements `submit()`/`retrieve()` like Kling, so it
  rides the same submit → poll → complete flow (`GET /api/v1/generation-jobs/[id]`);
  `retrieve()` shells out to ffmpeg and encodes H.264 `yuv420p` with `faststart`
  for browser/platform-safe playback (a `drawtext` overlay burns the prompt onto
  the frame).
- The pure helpers (`buildFfmpegRenderSpec`, `buildFfmpegArgs`,
  `escapeFfmpegFilterText`) are unit-tested without a real binary
  (`ffmpeg-video-provider.test.ts`); `renderMp4WithFfmpeg` and the provider are
  dependency-injected so the suite runs offline.
- **Runtime caveat** — ffmpeg needs a long-running OS process and CPU, so this
  provider is intended for a **containerized / dedicated worker** (Node), not the
  Vercel serverless runtime. On serverless, prefer `VIDEO_PROVIDER=kling` or route
  renders to a worker that has ffmpeg available. The `mock` providers remain the
  safe default when `VIDEO_PROVIDER` is unset or unknown.


### Audio generation (voiceover / music)

Audio uses the **exact same** `generation_jobs` + `credit_transactions` + `Asset`
machinery as video — it just selects a different `JobType` (`voice` or `music`)
and creates an `audio` `Asset` (populating `duration`, leaving `width`/`height`
null). No schema changes are required.

- `POST /api/v1/audio-jobs` `{ projectId, kind: "voiceover"|"music", prompt, duration }` — charges **5** or **8** credits, creates a job of type `voice`/`music`, runs it
  through `queued → processing → completed | failed`, persists the rendered
  file(s) to storage, and creates an `audio` `Asset` under the project.
- `GET /api/v1/audio-jobs/[id]` — poll-ready status (mock completes synchronously).
- Config: `AUDIO_PROVIDER=mock` (default; simulate latency with
  `MOCK_AUDIO_DELAY_MS`). Real providers implement `AudioGenerationProvider` in
  `src/lib/generation/audio-providers.ts` and register in `AUDIO_PROVIDER_REGISTRY`.
- **Provider availability UX** — the Audio Suite computes availability
  server-side (`getAudioProviderAvailability` in `audio-providers.ts`, driven by
  the credential env vars) and passes it to the suite. Providers whose keys
  aren't configured show as *"(not configured)"*, are disabled in the dropdown,
  and block the Generate button with an explanatory hint. The catalog
  (`AUDIO_PROVIDER_CATALOG` in `audio-providers-catalog.ts`) is the shared
  source of truth for dropdown labels and per-kind support (Suno is music-only,
  the TTS providers are voiceover-only), so the dropdown is filtered to
  providers that can generate the selected kind.
- The mock provider emits a valid silent PCM WAV; it is deterministic per prompt
  (same prompt + duration ⇒ identical bytes and `providerJobId`).

### Real provider: OpenAI TTS (`AUDIO_PROVIDER=openai`)

An optional real voiceover provider backed by the OpenAI Text-to-Speech API
(`POST /v1/audio/speech`), producing an MP3 asset.

- Set `AUDIO_PROVIDER=openai` and provide `OPENAI_API_KEY` (or pass
  `apiKey`/`baseUrl` to the injected `OpenAiAudioProviderConfig`).
- Voiceover only — `music` kind is rejected with a clear error.
- Defaults: voice `alloy`, model `tts-1`, response format `mp3`.
- The provider is injected (`fetchImpl`/`baseUrl`/`apiKey`) so its request
  building and response parsing are unit-tested with a stubbed `fetch`
  (`openai-audio-provider.test.ts`), and the registry entry keeps `mock` as the
  safe default when `AUDIO_PROVIDER` is unset or unknown.

### Real provider: ElevenLabs (`AUDIO_PROVIDER=elevenlabs`)

An optional real voiceover provider backed by the ElevenLabs Text-to-Speech API
(`POST /v1/text-to-speech/{voice_id}`, `xi-api-key` header), producing an MP3
asset.

- Set `AUDIO_PROVIDER=elevenlabs` and provide `ELEVENLABS_API_KEY` (from the
  ElevenLabs dashboard). Optionally set `ELEVENLABS_MODEL` (default
  `eleven_multilingual_v2`) and `ELEVENLABS_VOICE_ID` (default `21m00…ikWAM`,
  the "Rachel" library voice; `params.voice`, if supplied, wins).
- Voiceover only — `music` kind is rejected with a clear error.
- Voice settings (stability 0.5 / similarity_boost 0.75 / style 0 /
  use_speaker_boost) are sent explicitly so generations are consistent.
- The provider is injected (`fetchImpl`/`baseUrl`/`apiKey`) so its request
  building and response parsing are unit-tested with a stubbed `fetch`
  (`elevenlabs-audio-provider.test.ts`), and the registry entry keeps `mock` as
  the safe default when `AUDIO_PROVIDER` is unset or unknown.

### Real music provider: Suno (`AUDIO_PROVIDER=suno`)

An optional real music provider backed by a Suno-compatible generation gateway
(`POST /api/v1/generation` → poll `GET /api/v1/generation/{id}` →
download the finished clip's `audio_url`), producing an MP3 asset.

- Set `AUDIO_PROVIDER=suno` and provide `SUNO_API_KEY`. Optionally set
  `SUNO_MODEL` (default `chirp-v3-5`) and `SUNO_BASE_URL` (default
  `https://api.sunoapi.dev`) via the injectable `SunoAudioProviderConfig`.
- **Music only** — `voiceover` kind is rejected with a clear error.
- **Async two-phase** — unlike the TTS providers (which complete synchronously
  on `POST`), Suno's `generate()` throws: `POST /api/v1/audio-jobs` submits the
  generation and returns a `processing` job with `providerJobId`, and clients
  poll `GET /api/v1/audio-jobs/[id]`, which calls `advanceAudioJob` until the
  gateway reports finished clips (see the async video providers for the same
  submit → poll → complete flow).
- The provider is injected (`fetchImpl`/`baseUrl`/`apiKey`) so its request
  building and response parsing are unit-tested with a stubbed `fetch`
  (`suno-audio-provider.test.ts`), and the registry entry keeps `mock` as the
  safe default when `AUDIO_PROVIDER` is unset or unknown.

### Image generation

Image generation uses the **exact same** `generation_jobs` + `credit_transactions` +
`Asset` machinery as video/audio — it just selects the `JobType` `image` and
creates an `image` `Asset` (populating `width`/`height`, leaving `duration`
null). No schema changes are required.

- `POST /api/v1/image-jobs` `{ projectId, prompt, aspectRatio: "16:9"|"9:16"|"1:1"|"4:5", style?, provider? }` — charges **1** credit, creates a job of type
  `image`, runs it through `queued → processing → completed | failed`, persists
  the rendered file(s) to storage, and creates an `image` `Asset` under the
  project.
- `GET /api/v1/image-jobs/[id]` — poll-ready status (mock completes synchronously).
- Config: `IMAGE_PROVIDER=mock` (default; simulate latency with
  `MOCK_IMAGE_DELAY_MS`). Real providers implement `ImageGenerationProvider` in
  `src/lib/generation/image-providers.ts` and register in `IMAGE_PROVIDER_REGISTRY`.
- **Provider availability UX** — the Image Suite computes availability
  server-side (`getImageProviderAvailability` in `image-providers.ts`, driven by
  the credential env vars) and passes it to the suite. Providers whose keys
  aren't configured are disabled in the dropdown and block the Generate button
  with an explanatory hint. The catalog (`IMAGE_PROVIDER_CATALOG` in
  `image-providers-catalog.ts`) is the shared source of truth for dropdown
  labels and the aspect-ratio options (`IMAGE_ASPECT_RATIOS`).
- The mock provider emits a deterministic SVG poster; it is deterministic per
  prompt + aspect ratio (same inputs ⇒ identical bytes and `providerJobId`).
- **Brand DNA auto-enforcement** — when the project has a brand profile assigned,
  image generation honors it via `enrichImagePrompt` (`src/lib/brand-dna.ts`).
  Because image generation sends a single text prompt with no separate negative
  field, the profile's visual style guide (brand colors, accent colors,
  heading/body fonts, logo placement and minimum size) and its forbidden
  colors/words are both appended as guidance to the request prompt in
  `createImageGenerationJob`. The user's prompt and the job's `inputParams`
  trail always reflect the enriched render request, matching what the provider
  actually rendered.

### Real provider: Stability (`IMAGE_PROVIDER=stability`)

An optional real image provider backed by the Stability AI image-generation API
(`POST /v2beta/stable-image/generate/core`, `multipart/form-data`, Bearer key),
producing a PNG asset.

- Set `IMAGE_PROVIDER=stability` and provide `STABILITY_API_KEY` (or pass
  `apiKey`/`baseUrl` to the injected `StabilityImageProviderConfig`).
- Synchronous one-shot: `POST /api/v1/image-jobs` completes the render in one
  request and returns a `completed` job.
- The provider is injected (`fetchImpl`/`baseUrl`/`apiKey`) so its request
  building and response parsing are unit-tested with a stubbed `fetch`
  (`image-providers.test.ts`), and the registry entry keeps `mock` as the safe
  default when `IMAGE_PROVIDER` is unset or unknown.

### Real image provider: FLUX (`IMAGE_PROVIDER=flux`)

An optional real image provider backed by a FLUX-compatible generation gateway
(`POST /v1/images/generations/{model}` → poll `GET /v1/images/generations/{id}`
→ decode the result's base64 `sample`), producing a PNG asset.

- Set `IMAGE_PROVIDER=flux` and provide `FLUX_API_KEY`. Optionally set
  `FLUX_MODEL` (default `flux-schnell`) and the base URL via the injectable
  `FluxImageProviderConfig`.
- **Async two-phase** — unlike mock/stability (which complete synchronously on
  `POST`), FLUX's `generate()` throws: `POST /api/v1/image-jobs` submits the
  generation and returns a `processing` job with `providerJobId`, and clients
  poll `GET /api/v1/image-jobs/[id]`, which calls `advanceImageJob` until the
  gateway reports the image is ready (see the async audio/video providers for
  the same submit → poll → complete flow).

### Publishing (direct platform publishing)

Publishes finished video assets directly to platforms and records each publish
as a `Campaign` (+ a single `CampaignVariant`) so you can track what has gone
live. The layer mirrors the generation-provider design:

- **Provider abstraction** — `src/lib/publishing/providers.ts` defines the
  `PublishingProvider` interface (`publish(params) → PublishedResult`) and a
  registry resolved by `getPublishingProvider()` through the
  `PUBLISHING_PROVIDER` env var (default `mock`). A deterministic
  `MockPublishingProvider` ships for offline development.
- **Orchestration** — `src/lib/publishing/jobs.ts` `publishAssetToPlatform()`
  enforces ownership (project must be the caller's, asset must belong to that
  project), calls the provider, and persists the result onto a `Campaign`
  (+ `CampaignVariant`) and the asset's `published` metadata (platform id,
  shareable URL, provider, timestamp).
- **Endpoints** — `POST /api/v1/publishing`
  (`{ projectId, assetId, platform, title, description, tags, visibility }`)
  publishes; `GET /api/v1/publishing` lists the user's published campaigns;
  `GET /api/v1/publishing/[id]` fetches one; `GET /api/v1/projects/[id]/assets`
  lists a project's video assets for the picker.
- **UI** — the **Publishing** page (`/dashboard/publishing`, gated by
  `NEXT_PUBLIC_ENABLE_PUBLISHING=true`) offers a publish form and a list of
  published campaigns.
- **Real provider: YouTube** — `PUBLISHING_PROVIDER=youtube` publishes via the
  YouTube Data API v3 resumable upload: it downloads the asset bytes, obtains a
  resumable session URI (`POST …/upload/youtube/v3/videos?uploadType=resumable`),
  uploads the bytes, and returns the new video id + watch URL. Auth is a
  short-lived `YOUTUBE_ACCESS_TOKEN` (refresh/obtaining is left to your auth
  layer). The provider is fully injected (`accessToken`/`fetchImpl`/`now`) and
    unit-tested with a stubbed `fetch`.
- **Real provider: Meta** — `PUBLISHING_PROVIDER=meta` publishes to a Facebook
  Page via the Meta Graph API (`POST /{page-id}/videos`) using `file_url` pull,
  so Meta fetches the finished asset from its URL. Auth is a **Page-scoped**
  `META_ACCESS_TOKEN` plus the target `META_PAGE_ID`; privacy maps to
  Meta's `privacy.value` (public → `EVERYONE`, unlisted → `ALL_FRIENDS`,
  private → `SELF`). Returns the Graph API video id + `facebook.com/watch?v=` URL.
  Fully injected (`accessToken`/`pageId`/`fetchImpl`/`now`) and unit-tested with
  a stubbed `fetch`.
- **Real provider: TikTok** — `PUBLISHING_PROVIDER=tiktok` publishes via the
  TikTok Content Posting API (`POST …/v2/post/publish/video/init/`). It uses
  `source_info.source = "PULL_FROM_URL"`, so TikTok pulls the finished asset
  from its URL rather than receiving uploaded bytes, and returns a `publish_id`
  that is persisted as the platform id (visibility maps to TikTok's
  `privacy_level`: public → `PUBLIC_TO_EVERYONE`, unlisted → `FOLLOWERS`,
  private → `SELF_ONLY`). Auth is a `TIKTOK_ACCESS_TOKEN` with the
  `video.publish` scope. Fully injected and unit-tested with a stubbed `fetch`.
- **A/B testing** - the Publishing page gives every published campaign an
  expandable A/B panel. It reads live per-variant data from
  `GET /api/v1/publishing/[id]`, adds a second creative via
  `POST /api/v1/publishing/[id]/variants` (`addCampaignVariant`), and promotes
  a winner via `POST /api/v1/publishing/[id]/winner` (`markCampaignWinner`).
  Both endpoints return the advisory result of the pure `evaluateAbTest`
  evaluator in `src/lib/publishing/ab-test.ts` (ranked variants, winner,
  confidence, recommendation) so the UI can surface context - a human may still
  override the statistical leader.
- **Campaign A/B analytics** - the **Analytics** page (`/dashboard/analytics`)
  renders a live "A/B test results" panel from `GET /api/v1/analytics/campaigns`:
  it summarizes the user's published campaigns (`summarizeCampaigns` in
  `src/lib/publishing/campaign-ab-summary.ts`) with per-variant metrics, the
  current statistical leader, any chosen winner, confidence and the evaluator's
  recommendation — so winners surface outside the Publishing page too. Same pure
  `evaluateAbTest` evaluator, no new schema, unit-tested
  (`campaign-ab-summary.test.ts`).

