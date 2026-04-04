# OpenMusic
OpenMusic is the music platform for music enthusiasts.

The long-term goal is not to compete with mainstream streaming services on licensed catalog size. It is to give users better access, better migration tools, and far more creative control over the music they collect and the playlists they build.

Today, the codebase is still in an earlier local-first phase: a multi-source music archive and clip-aware playlist player that serves as the foundation for that broader product direction.

## Product Direction

OpenMusic is being built around these pillars:

- Universal music intake from the platforms users already use
- Seamless migration from existing services and playlists
- Creative control over tracks, clips, and playlist flow
- AI-assisted editing and curation tools
- Music-centered experiences beyond plain playback, such as karaoke and video-backed modes

Read [product-vision.md](docs/product-vision.md) for the full direction.

## Current Scope

- Resolve and save tracks from YouTube, TikTok, SoundCloud, and Spotify URLs
- Support Spotify track, album, and playlist links by fetching Spotify metadata and matching each song to YouTube audio
- Store tracks, clips, playlists, and playlist items in SQLite
- Stream audio through the FastAPI backend with on-disk caching
- Create clips with manual timestamps, tap-to-mark controls, and draggable in/out markers
- Build playlists from either full tracks or clips
- Reorder both archive tracks and playlist items from the UI
- Respect clip boundaries during playback, with loop modes for single track or whole playlist

## Stack

- Frontend: Next.js 14, React 18, Tailwind CSS 3, Geist, Phosphor Icons
- Backend: FastAPI, aiosqlite, yt-dlp, httpx
- Storage: SQLite plus local disk audio cache

## Run Locally

```bash
# backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
# frontend
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:3000` and rewrites `/api/*` requests to the backend on `http://localhost:8000`.

## Important Config

- `DB_PATH`: SQLite database path, defaults to `openmusic.db` at the repo root
- `CACHE_DIR`: audio cache directory, defaults to `~/.openmusic/cache`
- `MAX_CACHE_SIZE_GB`: cache limit before LRU eviction, defaults to `2`
- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`: required for Spotify URL support

## Docs

- [Agent / collaborator guide](AGENTS.md)
- [Project brief](CLAUDE.md)
- [Product vision](docs/product-vision.md)
- [System design](docs/system-design.md)
- [Feature research](docs/feature-research.md)
