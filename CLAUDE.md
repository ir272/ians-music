# CLAUDE.md — OpenMusic

## What This Is

OpenMusic is the music platform for music enthusiasts.

The product direction now goes beyond the older framing of a personal clip-aware player. The broader goal is to become a better home for serious music fans than mainstream streaming platforms are today.

Core themes:

1. Universal intake from multiple source platforms
2. Migration from mainstream services without painful rebuilding
3. Creative control over tracks and playlists
4. AI-assisted editing and curation
5. Expanded music experiences such as karaoke and video-backed modes

## Current Product State

The live codebase is still an earlier foundation layer for that vision. It already includes:

- Multi-platform URL resolve through the backend
- Spotify track, album, and playlist ingestion via Spotify metadata plus YouTube matching
- TikTok title cleanup and source attribution support
- Archive ordering with drag-and-drop persistence
- Playlist creation, deletion, add/remove item flows, and drag reorder
- Clip creation with tap-to-mark, timestamp editing, and draggable in/out markers
- A persistent player with playlist playback, next/prev, and loop modes
- Disk-backed audio caching with LRU eviction

Still not implemented:

- Playlist import from external platforms
- Speed, per-track volume, and transition editing
- In-app search
- Waveform visualization
- Karaoke or lyric/video modes
- AI-assisted clip suggestions
- Crossfade or gapless playback work beyond the single HTML audio element
- Auth, sharing, import/export, offline mode

## Read First

- [Product vision](docs/product-vision.md)
- [System design](docs/system-design.md)
- [Feature research](docs/feature-research.md)

## Tech Stack

- Frontend: Next.js 14 App Router, React 18, Tailwind CSS 3, Geist, Phosphor Icons
- Backend: FastAPI, Python 3.11+, aiosqlite, yt-dlp, httpx
- Database: SQLite
- Audio cache: local disk with size-based LRU eviction

## Project Structure

```text
OpenMusic/
├── CLAUDE.md
├── README.md
├── docs/
│   ├── product-vision.md
│   ├── system-design.md
│   └── feature-research.md
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       └── types/
└── backend/
    ├── requirements.txt
    ├── scripts/
    └── app/
        ├── main.py
        ├── db.py
        ├── models/
        ├── routers/
        └── services/
```

## Core Concepts

- Track: a stored source entry in the archive. For Spotify imports, the stored source URL is the Spotify URL, while playback uses a matched YouTube URL behind the scenes.
- Clip: a saved segment of a track with `startMs`, optional `endMs`, and a label.
- Playlist item: a position in a playlist that points to a track, and optionally a clip.

These are still the core primitives of the current app, but they should now be viewed as the beginning of a larger music platform, not the end state.

The playback rule is simple:

- If a playlist item has no clip, play the full track.
- If it has a clip, start at `startMs` and stop or advance at `endMs`.

## Backend Contract

Primary routes in active use:

- `GET /api/health`
- `GET /api/tracks`
- `DELETE /api/tracks/{track_id}`
- `PATCH /api/tracks/reorder`
- `POST /api/resolve`
- `GET /api/audio/{track_id}`
- `POST /api/clips`
- `GET /api/clips`
- `PATCH /api/clips/{clip_id}`
- `DELETE /api/clips/{clip_id}`
- `POST /api/playlists`
- `GET /api/playlists`
- `GET /api/playlists/{playlist_id}`
- `DELETE /api/playlists/{playlist_id}`
- `POST /api/playlists/{playlist_id}/items`
- `PATCH /api/playlists/{playlist_id}/items`
- `DELETE /api/playlists/{playlist_id}/items/{item_id}`

There is no search endpoint in the current implementation.

## Frontend Behavior To Preserve

- The clip editor replaces the archive view rather than rendering inline above the library.
- The archive is the default main view; playlists render in the main panel and the sidebar remains visible.
- The bottom player is global and persistent across views.
- Archive track order and playlist item order are user-managed and persisted.

## Environment And Config

- `DB_PATH` defaults to `openmusic.db` in the repo root
- `CACHE_DIR` defaults to `~/.openmusic/cache`
- `MAX_CACHE_SIZE_GB` defaults to `2`
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` enable Spotify URL support

## Coding Conventions

- Keep frontend responses and types camelCase at the API boundary
- Keep FastAPI routes async
- Wrap yt-dlp and remote API failures in useful 4xx/5xx responses
- Do not add dependencies without checking the existing package manifest first
- Preserve the current local-first architecture; do not introduce auth or cloud persistence casually

## Notes On Drift From Older Docs

Older planning docs referenced:

- search endpoints
- audio normalization
- simultaneous stream-and-cache behavior
- future Supabase migration details as if they were current

Those are not the live system today. Treat [product-vision.md](docs/product-vision.md) as the product reference and [system-design.md](docs/system-design.md) as the current technical reference.
