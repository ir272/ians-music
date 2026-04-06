# OpenMusic — System Design

> Updated 04/06/2026.

Current implementation reference. For product direction, see [product-vision.md](product-vision.md).

## Deployment

OpenMusic is hosted, not local-first.

- **Frontend**: Vercel (Next.js)
- **Backend**: Fly.io — 1GB RAM shared CPU, single machine with auto-stop/auto-start
- **Storage**: Fly.io persistent volume mounted at `/data`
  - SQLite database: `/data/openmusic.db`
  - Audio cache: `/data/cache`
  - YouTube cookie file: `/data/yt_cookies.txt`

The backend starts via `start.sh`, which launches the bgutil PO token server on `:4416` before starting uvicorn.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Frontend: Next.js 14 / React 18 / Tailwind CSS 3        │
│  Archive view  │  Clip editor  │  Playlist view          │
│  Persistent bottom player (PlayerContext)                │
└────────────────────────┬────────────────────────────────┘
                         │ /api/* (proxied via next.config)
┌────────────────────────┴────────────────────────────────┐
│ Backend: FastAPI (uvicorn, port 8000)                   │
│  resolve router   clips router   playlists router        │
│  audio router     settings router                        │
│  yt-dlp service   Spotify service   cache manager        │
├────────────────────────────────────────────────────────-┤
│ bgutil HTTP server (Deno, port 4416)                    │
│  Generates YouTube PO tokens for bot-check bypass       │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │  /data (Fly.io volume)      │
          │  openmusic.db (SQLite)      │
          │  cache/ (audio files)       │
          │  yt_cookies.txt             │
          └─────────────────────────────┘
```

## Data Model

### `tracks`

```sql
CREATE TABLE IF NOT EXISTS tracks (
  id                TEXT PRIMARY KEY,
  source_url        TEXT NOT NULL UNIQUE,
  platform          TEXT NOT NULL,
  title             TEXT,
  artist            TEXT,
  thumbnail_url     TEXT,
  duration_ms       INTEGER,
  source_credit     TEXT,           -- "via @username" for TikTok
  matched_source_url TEXT,          -- YouTube URL for Spotify tracks
  match_confidence  REAL,           -- scoring result for Spotify matches
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now'))
);
```

### `clips`

```sql
CREATE TABLE IF NOT EXISTS clips (
  id          TEXT PRIMARY KEY,
  track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  start_ms    INTEGER NOT NULL DEFAULT 0,
  end_ms      INTEGER,
  fade_in_ms  INTEGER NOT NULL DEFAULT 0,
  fade_out_ms INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);
```

### `playlists`

```sql
CREATE TABLE IF NOT EXISTS playlists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
```

### `playlist_items`

```sql
CREATE TABLE IF NOT EXISTS playlist_items (
  id          TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  clip_id     TEXT REFERENCES clips(id) ON DELETE SET NULL,
  position    INTEGER NOT NULL
);
```

### `spotify_youtube_map`

```sql
CREATE TABLE IF NOT EXISTS spotify_youtube_map (
  spotify_url TEXT PRIMARY KEY,
  youtube_url TEXT NOT NULL
);
```

### `track_mix_settings`

```sql
CREATE TABLE IF NOT EXISTS track_mix_settings (
  track_id      TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  playback_rate REAL NOT NULL DEFAULT 1.0,
  gain          REAL NOT NULL DEFAULT 1.0,
  updated_at    TEXT
);
```

## API Surface

```
GET  /api/health

GET    /api/tracks
DELETE /api/tracks/{track_id}
PATCH  /api/tracks/reorder
GET    /api/tracks/{track_id}/mix-settings
PUT    /api/tracks/{track_id}/mix-settings

POST   /api/resolve

GET    /api/audio/{track_id}

POST   /api/clips
GET    /api/clips
PATCH  /api/clips/{clip_id}
DELETE /api/clips/{clip_id}

POST   /api/playlists
GET    /api/playlists
GET    /api/playlists/{playlist_id}
DELETE /api/playlists/{playlist_id}
POST   /api/playlists/{playlist_id}/items
PATCH  /api/playlists/{playlist_id}/items
DELETE /api/playlists/{playlist_id}/items/{item_id}

GET    /api/settings/cookies
POST   /api/settings/cookies
DELETE /api/settings/cookies
```

## YouTube Bot Bypass Stack

Getting YouTube to work from a datacenter IP requires multiple layers:

1. **bgutil HTTP server** — persistent Deno process running `bgutil-ytdlp-pot-provider` at `:4416`. Generates PO (Proof-of-Origin) tokens that yt-dlp attaches to YouTube player API requests. Requires 1GB RAM (Deno + canvas FFI).

2. **Cookie file** — user uploads Netscape-format cookies exported from a logged-in YouTube session. Stored at `/data/yt_cookies.txt`. Managed via the settings UI at `/api/settings/cookies`.

3. **extract_flat=True for search** — YouTube search uses `extract_flat=True` to get metadata (title, duration, views, channel) from search results without fetching each video's player endpoint. Fetching player endpoints per result triggers bot checks on datacenter IPs.

The bgutil server starts before uvicorn in `start.sh`. Its Deno dependencies are pre-cached in the Docker image at `/root/bgutil-ytdlp-pot-provider/.deno`.

## Resolve Flow

**Direct URL (YouTube, TikTok, SoundCloud):**
1. Check if track already exists by `source_url`
2. If not, call `ytdlp_service.extract_info(url)`
3. Insert track row at position 0, shift existing tracks down
4. Return `ResolveResponse`

**Spotify track:**
1. Fetch track metadata from Spotify Web API
2. Search YouTube with two queries using `extract_flat=True`
3. Score results by duration similarity, channel quality, view count, title similarity
4. Store track row with Spotify URL + matched YouTube URL in `spotify_youtube_map`
5. Return `ResolveResponse` with `matchedSourceUrl` and `matchConfidence`

**Spotify album/playlist:**
- Resolves each track individually via the Spotify track flow
- Returns `BatchResolveResponse` with succeeded and failed tracks
- Creates a playlist and adds all resolved tracks if a collection name is available

**TikTok:**
- Short links are followed first (HEAD request to resolve redirect)
- Sound pages (`/music/`) are explicitly rejected with a 422

## Audio Serving

`GET /api/audio/{track_id}`:

1. Look up the track; resolve the playback URL (YouTube URL for Spotify tracks via `spotify_youtube_map`)
2. Check cache for an existing file whose stem matches `track_id`
3. If cached: serve directly with Range support
4. If not cached: run `yt-dlp` download to `CACHE_DIR/{track_id}.%(ext)s`, then serve
5. After serving, run LRU eviction if cache exceeds `MAX_CACHE_SIZE_GB`

Cache defaults: `CACHE_DIR=/data/cache`, `MAX_CACHE_SIZE_GB=1`.

## Playback Model

Single `<audio>` element managed by `PlayerContext.tsx`.

- `playTrack(track, clip?)` — plays one track or clip
- `playPlaylist(items, startIndex)` — ordered playlist playback with prev/next
- Clip playback seeks to `startMs`, stops or advances at `endMs`
- Loop modes: `none`, `track`, `playlist`

## Caching Strategy

1. On each audio request, find a cached file matching `{track_id}.*`
2. If hit: serve it, update access time
3. If miss: yt-dlp download → register → serve
4. After every serve: evict least-recently-accessed files above the size cap

## Current Feature Inventory

Implemented:
- Multi-source URL ingestion
- Spotify track/album/playlist ingestion with YouTube matching
- TikTok short-link resolution and sound-page rejection with `source_credit`
- Archive drag reorder
- Clip creation, editing, fade settings
- Playlist CRUD
- Playlist item add/remove/reorder
- Persistent player with clip boundary enforcement and loop modes
- Per-track mix settings (playback rate, gain)
- YouTube cookie upload via settings UI
- Backend audio cache with LRU eviction
- Track and playlist deletion

Not implemented:
- Playlist import from external platforms
- Speed/volume/transition editing UI
- In-app search endpoint
- Waveform visualization
- Karaoke / lyric / video modes
- AI-assisted clip suggestions
- Crossfade or gapless playback
- Auth, sharing, import/export, offline mode
