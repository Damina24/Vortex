# VORTEX AI Service

FastAPI microservice for **LLM-powered creative operations** behind the VORTEX
web app. It is provider-agnostic (OpenAI + Anthropic) with a deterministic
offline `MockProvider` for development/testing.

## Endpoints

| Method | Path                         | Purpose                                                                   |
| ------ | ---------------------------- | ------------------------------------------------------------------------- |
| `GET`  | `/health`                    | Liveness + which LLM provider is active                                   |
| `POST` | `/v1/ai/storyboard-strategy` | Generate a full creative strategy + scene plan from a storyboard brief    |
| `POST` | `/v1/ai/enhance-prompt`      | Enrich a raw scene prompt into a production-ready video generation prompt |

## Running locally

> **Requires Python 3.9 – 3.12.** The pinned `pydantic==2.7.4` (and its
> `pydantic-core`) does not provide prebuilt wheels or build on Python 3.13+.
> On Windows, create the venv with a compatible interpreter:
> `py -3.12 -m venv .venv`.

```bash
# one-time setup
python -m venv .venv && . .venv/bin/activate   # or .venv/Scripts/Activate.ps1 on Windows
pip install -r requirements-dev.txt

# development (mock mode = no API keys required)
MOCK_LLM=true uvicorn src.main:app --reload

# with real providers
export OPENAI_API_KEY=...
# or
export ANTHROPIC_API_KEY=...
uvicorn src.main:app --reload
```

## Configuration

See `.env.example`. The service resolves a provider in this priority order:
Mock (`MOCK_LLM=true`) → OpenAI (`OPENAI_API_KEY`) → Anthropic
(`ANTHROPIC_API_KEY`). If none is configured, the AI endpoints return `503`.

## Testing

```bash
pytest            # offline, uses MockProvider
```

## Architecture

```
src/
  __init__.py
  main.py          # FastAPI app: CORS, /health, router inclusion
  config.py        # pydantic-settings config + lru-cached get_settings()
  schemas.py        # request/response models (pydantic)
  llm.py            # LLMProvider ABC + OpenAI/Anthropic/Mock providers + JSON extraction
  prompts.py        # system prompts + user-prompt builders
  services.py       # business logic wiring providers <-> prompts <-> schemas
  routers.py        # APIRouter for /v1/ai/*
```

All LLM calls return structured JSON (via `response_format`/`extract_json`) and
are validated back into the response models, so downstream clients always
receive schema-compliant payloads.

## Docker

The service is wired into `docker-compose.yml` as the `ai-service` container
(listening on `8000`), backed by Postgres and Redis.
