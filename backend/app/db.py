import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import aiosqlite
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "..", "openmusic.db"))

_SCHEMA = """
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
  matched_source_url TEXT,
  match_confidence REAL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clips (
  id         TEXT PRIMARY KEY,
  track_id   TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  start_ms   INTEGER NOT NULL DEFAULT 0,
  end_ms     INTEGER,
  fade_in_ms INTEGER NOT NULL DEFAULT 0,
  fade_out_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS track_mix_settings (
  track_id       TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  playback_rate  REAL NOT NULL DEFAULT 1.0,
  gain           REAL NOT NULL DEFAULT 1.0,
  updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id          TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  clip_id     TEXT REFERENCES clips(id) ON DELETE SET NULL,
  position    INTEGER NOT NULL,
  UNIQUE(playlist_id, position)
);

-- Add source_credit column if it doesn't exist (for TikTok "via @user" attribution)
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we handle this in init_db()

CREATE TABLE IF NOT EXISTS spotify_youtube_map (
  spotify_url TEXT PRIMARY KEY,
  youtube_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_jobs (
  id            TEXT PRIMARY KEY,
  track_id      TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL,
  status        TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
"""


async def init_db() -> None:
    """Create all tables if they don't exist."""
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.executescript(_SCHEMA)

        # Migrations: add columns that didn't exist in the original schema
        cursor = await db.execute("PRAGMA table_info(tracks)")
        columns = {row[1] for row in await cursor.fetchall()}

        if "source_credit" not in columns:
            await db.execute("ALTER TABLE tracks ADD COLUMN source_credit TEXT")

        if "position" not in columns:
            await db.execute("ALTER TABLE tracks ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
            # Initialize positions from created_at DESC (newest track = position 0)
            cursor = await db.execute("SELECT id FROM tracks ORDER BY created_at DESC")
            rows = await cursor.fetchall()
            for i, row in enumerate(rows):
                await db.execute("UPDATE tracks SET position = ? WHERE id = ?", (i, row[0]))

        if "matched_source_url" not in columns:
            await db.execute("ALTER TABLE tracks ADD COLUMN matched_source_url TEXT")

        if "match_confidence" not in columns:
            await db.execute("ALTER TABLE tracks ADD COLUMN match_confidence REAL")

        if "media_state" not in columns:
            await db.execute("ALTER TABLE tracks ADD COLUMN media_state TEXT NOT NULL DEFAULT 'resolved'")

        if "last_media_error" not in columns:
            await db.execute("ALTER TABLE tracks ADD COLUMN last_media_error TEXT")

        if "last_prepared_at" not in columns:
            await db.execute("ALTER TABLE tracks ADD COLUMN last_prepared_at TEXT")

        cursor = await db.execute("PRAGMA table_info(clips)")
        clip_columns = {row[1] for row in await cursor.fetchall()}

        if "fade_in_ms" not in clip_columns:
            await db.execute("ALTER TABLE clips ADD COLUMN fade_in_ms INTEGER NOT NULL DEFAULT 0")

        if "fade_out_ms" not in clip_columns:
            await db.execute("ALTER TABLE clips ADD COLUMN fade_out_ms INTEGER NOT NULL DEFAULT 0")

        await db.commit()


async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    """FastAPI dependency that yields an async SQLite connection."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
    finally:
        await db.close()
