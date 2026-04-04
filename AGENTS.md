# AGENTS.md

## Purpose

This file gives contributors and coding agents the minimum context needed to work effectively in OpenMusic without rediscovering product direction or current implementation constraints.

## Project Summary

OpenMusic is the music platform for music enthusiasts.

Current reality:

- The live codebase is still a local-first foundation
- It already supports multi-source ingestion, clips, playlists, and playback
- It does not yet implement the full platform vision around migration, richer editing, AI assistance, karaoke, or video-backed modes

Read these first, in order:

1. `docs/product-vision.md`
2. `docs/system-design.md`
3. `docs/feature-research.md`
4. `README.md`

## Active Product Framing

Optimize decisions around these pillars:

- Universal music intake
- Seamless migration from existing platforms
- Creative control over tracks and playlists
- AI-assisted editing and curation
- Music-centered modes beyond plain playback

If a change does not support one of those pillars or strengthen the current foundation toward them, question whether it belongs.

## Current Stack

- Frontend: Next.js 14, React 18, Tailwind CSS 3
- Backend: FastAPI, Python, aiosqlite, yt-dlp, httpx
- Storage: SQLite plus local disk cache

## Repo Layout

```text
OpenMusic/
├── AGENTS.md
├── README.md
├── CLAUDE.md
├── docs/
├── frontend/
└── backend/
```

Important areas:

- `frontend/src/app/page.tsx`: main app shell and view switching
- `frontend/src/lib/PlayerContext.tsx`: playback state and clip boundary behavior
- `frontend/src/components/ClipEditor.tsx`: current clip editing UI
- `frontend/src/components/PlaylistDetailView.tsx`: active playlist UI
- `backend/app/routers/resolve.py`: source ingestion and Spotify matching flow
- `backend/app/routers/audio.py`: cached audio serving
- `backend/app/services/cache_manager.py`: cache location and eviction
- `backend/app/db.py`: schema and default DB path

## Collaboration Rules

- Do not assume the product is still called Roybal. The active name is OpenMusic everywhere.
- Treat `docs/product-vision.md` as the product source of truth.
- Treat `docs/system-design.md` as the current implementation source of truth.
- Keep docs updated when product framing or implementation changes materially.
- Do not make speculative roadmap ideas sound implemented.
- Prefer additive, reviewable changes over sweeping rewrites unless the task clearly calls for it.

## Current Implementation Constraints

- Playback currently uses one HTML audio element, not a Web Audio graph
- There is no in-app search endpoint yet
- There is no playlist import flow yet
- There is no speed/volume/transition editing yet
- There is no karaoke/lyrics/video mode yet
- Spotify ingestion works by matching to YouTube audio behind the scenes
- Cache defaults to `~/.openmusic/cache`
- DB defaults to `openmusic.db`

## Design Collaboration Notes

If a teammate is working on design:

- Keep proposed UI aligned with `docs/product-vision.md`
- Preserve the current app’s useful primitives: track, clip, playlist item
- Favor workflows that make migration and editing feel easier, not more abstract
- Document whether a design is for:
  - current implementation
  - near-term roadmap
  - future concept

If a design references Figma, use the design context workflow rather than eyeballing from screenshots only.

## Recommended Agent Skills / Workflows

If working with a coding agent that supports skills, these are the most useful:

- `workflow-orchestration`: for any non-trivial implementation or refactor
- `figma` or `figma-implement-design`: when implementing design handoff from Figma
- `screenshot`: for UI review or before/after comparison
- `openai-docs`: only when OpenAI product integration or API guidance is relevant

## Setup Notes

Backend:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Environment Defaults

See `backend/.env.example`.

Current defaults:

- `CACHE_DIR=~/.openmusic/cache`
- `DB_PATH=./openmusic.db`
- `MAX_CACHE_SIZE_GB=2`

## What To Update When Features Land

If you implement a major feature, update:

- `README.md` for high-level scope
- `docs/system-design.md` for live architecture changes
- `docs/feature-research.md` if research assumptions become obsolete
- `docs/product-vision.md` only if the product direction itself changes
