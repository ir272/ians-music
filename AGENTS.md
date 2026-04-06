# AGENTS.md

## Purpose

Minimum context for contributors and coding agents to work effectively in OpenMusic without rediscovering constraints.

## Project Summary

OpenMusic is a hosted music platform for enthusiasts. It lets users import music from any URL (YouTube, Spotify, TikTok, SoundCloud), clip tracks, and build playlists.

- **Frontend**: Vercel — Next.js 14 app
- **Backend**: Fly.io — FastAPI + bgutil PO token server
- **Storage**: Fly.io persistent volume at `/data` (SQLite + audio cache + cookie file)

Read these first:

1. `docs/product-vision.md` — what the product is becoming
2. `docs/system-design.md` — current live architecture
3. `CLAUDE.md` — coding conventions and project brief

## Key Files

```
frontend/src/app/page.tsx                  — main archive view and URL ingestion
frontend/src/app/nexus/page.tsx            — Nexus view
frontend/src/app/studio/                   — Studio / clip editor views
frontend/src/lib/PlayerContext.tsx         — global playback state
frontend/src/components/RevampPlaybackBar.tsx — bottom player bar
frontend/src/components/SettingsModal.tsx  — YouTube cookie upload UI
frontend/src/lib/api.ts                    — all backend API calls

backend/app/routers/resolve.py             — URL ingestion and Spotify matching
backend/app/routers/audio.py              — cached audio serving
backend/app/routers/settings.py           — cookie file upload/delete
backend/app/services/ytdlp_service.py     — yt-dlp wrapper (search, extract, download)
backend/app/services/spotify_service.py   — Spotify API client
backend/app/services/cache_manager.py     — LRU eviction
backend/app/db.py                         — schema and migrations
backend/Dockerfile                        — builds bgutil + Deno cache + Python deps
backend/start.sh                          — starts bgutil server then uvicorn
backend/fly.toml                          — Fly deployment config (1GB RAM required)
```

## Current Stack

- Frontend: Next.js 14, React 18, Tailwind CSS 3, Geist, Phosphor Icons
- Backend: FastAPI, Python 3.11, aiosqlite, yt-dlp, httpx
- YouTube bypass: bgutil-ytdlp-pot-provider (Deno HTTP server on :4416)
- Storage: SQLite + disk audio cache

## Implementation Constraints

- 1GB RAM minimum on Fly.io — bgutil's Deno + canvas FFI requires it (OOM kills at 512MB)
- YouTube search uses `extract_flat=True` — full player extraction per result triggers bot checks
- Audio is downloaded fully before serving — no simultaneous stream-and-cache
- Single HTML `<audio>` element — no Web Audio API graph yet
- No in-app search endpoint
- No playlist import flow from external platforms
- No speed/volume/transition editing
- Spotify tracks resolve to a matched YouTube URL stored in `spotify_youtube_map`
- Cookie file lives at `/data/yt_cookies.txt` (Fly.io persistent volume)

## Product Pillars

- Universal music intake from any platform
- Seamless migration from existing services
- Creative control over tracks and playlists
- AI-assisted editing and curation (future)
- Music modes beyond plain playback (future)

## Collaboration Rules

- Keep `docs/system-design.md` updated when architecture changes
- Keep `docs/product-vision.md` as the product source of truth
- Don't make roadmap features sound implemented
- Don't add local setup instructions — the app is hosted only
- The product name is OpenMusic everywhere
