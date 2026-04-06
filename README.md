# OpenMusic

OpenMusic is the music platform for music enthusiasts — a better home for serious music fans than mainstream streaming platforms.

Import from YouTube, Spotify, TikTok, and SoundCloud. Clip tracks, build playlists, and own your archive.

## What's Built

- Multi-platform URL ingestion (YouTube, Spotify, TikTok, SoundCloud)
- Spotify track, album, and playlist import via metadata + YouTube matching
- Archive with drag-reorder, source attribution, and per-track detail
- Clip editor with tap-to-mark, timestamp editing, and draggable in/out markers
- Playlists built from full tracks or clips, with drag reorder
- Persistent bottom player with clip boundary enforcement and loop modes
- Per-track mix settings (playback rate, gain)
- Cookie-based YouTube authentication via settings UI
- Disk-backed audio cache with LRU eviction

## What's Not Built Yet

- Playlist import from external platforms
- Speed / volume / transition editing UI
- In-app search
- Waveform visualization
- Karaoke / lyric / video modes
- AI-assisted clip suggestions
- Crossfade or gapless playback
- Auth, sharing, import/export, offline mode

## Stack

- Frontend: Next.js 14, React 18, Tailwind CSS 3, Geist, Phosphor Icons
- Backend: FastAPI, Python 3.11, aiosqlite, yt-dlp, httpx
- Database: SQLite
- Audio cache: local disk with LRU eviction

## Deployment

- Frontend: Vercel
- Backend: Fly.io (1GB RAM — required for bgutil Deno + canvas FFI)
- Storage: Fly.io persistent volume at `/data`

## Docs

- [Product vision](docs/product-vision.md)
- [System design](docs/system-design.md)
- [Feature research](docs/feature-research.md)
- [Collaborator guide](AGENTS.md)
