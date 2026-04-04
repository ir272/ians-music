# OpenMusic — System Design

> Updated 04/04/2026 to match the current codebase.

This document describes the current implementation, not the full end-state product vision. For the broader product direction, see [product-vision.md](product-vision.md).

Today, OpenMusic is a local-first music archive and player that stores tracks from multiple source platforms, lets the user save clips from those tracks, and builds playlists from either full tracks or clips.

## Problem Statement

Music discovery happens on different platforms, but playback and organization should not be tied to any one of them. OpenMusic solves that by:

- accepting source URLs from multiple platforms
- storing a normalized local track record
- letting the user save clip boundaries on top of that track
- treating clips and full tracks as first-class playlist items

That is only part of the broader product direction. The future product also aims to support playlist migration, deeper editing, AI assistance, and music-centered modes beyond plain playback, but those are not part of the live architecture yet.

## Current Architecture

```text
┌────────────────────────────────────────────────────────────┐
│ Frontend: Next.js 14 / React 18 / Tailwind CSS 3          │
│                                                            │
│  Header                                                    │
│  Archive view: AddTrack + TrackLibrary                     │
│  Clip editor view: full-page replacement inside main pane  │
│  Playlist detail view                                      │
│  Playlist sidebar                                          │
│  Persistent bottom player                                  │
└──────────────────────────────┬─────────────────────────────┘
                               │ /api/*
┌──────────────────────────────┴─────────────────────────────┐
│ Backend: FastAPI                                           │
│                                                            │
│  resolve router      clips router      playlists router    │
│  audio router        db init           cache manager       │
│  yt-dlp service      Spotify service                        │
└──────────────────────────────┬─────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │ SQLite + local audio cache  │
                │  tracks                     │
                │  clips                      │
                │  playlists                  │
                │  playlist_items             │
                │  spotify_youtube_map        │
                └─────────────────────────────┘
```

## Frontend Flow

The frontend uses a single main page with view switching:

- Archive view
  - `AddTrack` resolves URLs
  - `TrackLibrary` shows archive items and supports drag reorder
- Clip editor view
  - replaces the archive content while editing one selected track
- Playlist view
  - shows one playlist in the main pane
  - allows adding tracks or clips, removing items, playing from any position, and reordering items
- Global player
  - owns playback state through `PlayerContext`
  - supports track playback, playlist playback, prev/next, seek, and loop modes

The frontend proxies all `/api/*` traffic to the backend through `frontend/next.config.js`.

## Data Model

### `tracks`

```sql
CREATE TABLE IF NOT EXISTS tracks (
  id            TEXT PRIMARY KEY,
  source_url    TEXT NOT NULL UNIQUE,
  platform      TEXT NOT NULL,
  title         TEXT,
  artist        TEXT,
  thumbnail_url TEXT,
  duration_ms   INTEGER,
  audio_hash    TEXT,
  cached_at     TEXT,
  last_played   TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

Current runtime migration also adds:

```sql
ALTER TABLE tracks ADD COLUMN source_credit TEXT;
ALTER TABLE tracks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
```

Notes:

- `source_credit` is used for TikTok attribution like `via @username`
- `position` controls archive ordering
- `audio_hash` exists in schema but is not currently written to by the backend

### `clips`

```sql
CREATE TABLE IF NOT EXISTS clips (
  id         TEXT PRIMARY KEY,
  track_id   TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  start_ms   INTEGER NOT NULL DEFAULT 0,
  end_ms     INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
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
  position    INTEGER NOT NULL,
  UNIQUE(playlist_id, position)
);
```

### `spotify_youtube_map`

```sql
CREATE TABLE IF NOT EXISTS spotify_youtube_map (
  spotify_url TEXT PRIMARY KEY,
  youtube_url TEXT NOT NULL
);
```

This is how Spotify items work today:

- the `tracks` row stores the Spotify URL and Spotify metadata
- playback looks up a matched YouTube URL from `spotify_youtube_map`

## API Surface

### Health

```text
GET /api/health
-> { "status": "ok" }
```

### Tracks

```text
GET    /api/tracks
DELETE /api/tracks/{track_id}
PATCH  /api/tracks/reorder
```

`GET /api/tracks` returns archive tracks ordered by `position ASC`.

### Resolve

```text
POST /api/resolve
Body: { "url": string }
```

Possible outcomes:

- normal single-track `ResolveResponse`
- batch `BatchResolveResponse` for Spotify album and playlist URLs
- `422` for unsupported or unresolvable URLs

Current resolve behavior:

- YouTube, TikTok, SoundCloud, and similar supported URLs go through yt-dlp directly
- TikTok short links are followed first
- TikTok sound pages are explicitly rejected
- Spotify track URLs resolve through Spotify metadata plus YouTube search/match
- Spotify album and playlist URLs resolve each track one by one

The resolve response does not include a direct `audioStreamUrl`. Playback uses `/api/audio/{track_id}` separately.

### Audio

```text
GET /api/audio/{track_id}
```

Behavior:

- updates `last_played`
- serves from cache if present
- otherwise downloads the source audio to cache first, then serves the cached file
- supports HTTP Range requests when serving cached files

Important implementation detail:

- the current backend does not stream from the remote source while simultaneously caching
- it performs a full yt-dlp download, registers the cached file, then serves that file

### Clips

```text
POST   /api/clips
GET    /api/clips
PATCH  /api/clips/{clip_id}
DELETE /api/clips/{clip_id}
```

`GET /api/clips` optionally supports `?trackId=...`.

### Playlists

```text
POST   /api/playlists
GET    /api/playlists
GET    /api/playlists/{playlist_id}
DELETE /api/playlists/{playlist_id}

POST   /api/playlists/{playlist_id}/items
PATCH  /api/playlists/{playlist_id}/items
DELETE /api/playlists/{playlist_id}/items/{item_id}
```

Playlist reads join item rows with their associated track and clip payloads.

## Playback Model

Playback is implemented with one HTML `<audio>` element managed by `frontend/src/lib/PlayerContext.tsx`.

Current behavior:

- `playTrack(track, clip?)` plays a single track or clip outside playlist mode
- `playPlaylist(items, startIndex)` plays ordered playlist items
- clip playback seeks to `startMs` before starting
- when `timeupdate` passes `endMs`, the player pauses and advances
- loop modes:
  - `none`
  - `track`
  - `playlist`

Not implemented in the live player:

- Web Audio API graph
- crossfade
- gapless double-buffer playback
- waveform analysis

## Caching Strategy

Cache lives on local disk, defaulting to `~/.openmusic/cache`.

Current algorithm:

1. Look for a cached file whose stem matches the `track_id`
2. If present, serve it directly and touch access time
3. If absent, download audio with yt-dlp into `CACHE_DIR/{track_id}.%(ext)s`
4. Register the resulting file path and serve it
5. Evict least-recently-used cached files by file access time if the cache exceeds `MAX_CACHE_SIZE_GB`

The cache manager supports variable file extensions and removes all files whose stem matches the track ID.

## Spotify Matching Design

Spotify support is already part of the live backend.

Pipeline:

1. Parse the Spotify URL type
2. Fetch metadata from the Spotify Web API using client credentials
3. Build YouTube searches from artist/title metadata
4. Score results by:
   - duration similarity
   - official/topic channel quality
   - view count
   - title similarity with penalties for remix/live variants
5. Store the Spotify-facing track row plus the matched YouTube URL mapping

This means the UI can preserve Spotify identity while the backend still downloads playable audio.

## Current Feature Inventory

Implemented:

- archive track ingestion by URL
- Spotify track/album/playlist ingestion
- TikTok short-link resolution and sound-page rejection
- TikTok `source_credit` attribution
- archive drag reorder
- clip creation and editing inputs
- playlist CRUD
- playlist item add/remove/reorder
- persistent player with clip boundary enforcement
- track delete and playlist delete
- backend cache with LRU eviction

Not implemented:

- in-app search endpoint
- playlist import from external music services
- speed / volume / transition editing
- waveform visualization
- metadata search UI
- karaoke or lyric/video modes
- AI-assisted clip suggestions
- crossfade or gapless playback
- auth
- import/export
- offline mode

## Risks And Constraints

1. yt-dlp reliability varies by platform, especially TikTok and YouTube over time.
2. Spotify support depends on configured Spotify API credentials and YouTube match quality.
3. The current player is intentionally simple; the new product vision will require a deeper playback and editing refactor.
4. If OpenMusic evolves from local-first utility to true platform, the current single-user architecture will eventually need user identity, migration workflows, and stronger content provenance.
5. A few legacy frontend files remain in the repo, but the main page uses `PlaylistDetailView` rather than the older `PlaylistView`.
