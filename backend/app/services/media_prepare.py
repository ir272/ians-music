from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from app.db import DB_PATH
from app.services import ytdlp_service
from app.services.cache_manager import cache_manager
from app.services.media_state import upsert_media_asset, upsert_media_job

logger = logging.getLogger(__name__)

_COOKIE_ERROR_MESSAGE = (
    "YouTube blocked playback for this track. Upload a fresh cookies.txt file from a logged-in "
    "YouTube session in Settings and try again."
)


def classify_media_error(exc: Exception) -> tuple[str, str]:
    message = str(exc)
    lowered = message.lower()
    if (
        "sign in to confirm you’re not a bot" in lowered
        or "sign in to confirm you're not a bot" in lowered
        or "--cookies-from-browser" in lowered
        or "--cookies" in lowered
    ):
        return "cookie_required", _COOKIE_ERROR_MESSAGE
    if "timed out" in lowered or "timeout" in lowered:
        return "upstream_timeout", "The source platform timed out while preparing audio for this track."
    return "upstream_error", f"Could not fetch audio: {message}"


async def _open_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    return db


async def _resolve_playback_source(db: aiosqlite.Connection, track_id: str) -> tuple[str, str]:
    cursor = await db.execute(
        "SELECT source_url, platform FROM tracks WHERE id = ?",
        (track_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise ValueError("Track not found")

    source_url = row["source_url"]
    platform = row["platform"]

    if platform == "spotify":
        yt_cursor = await db.execute(
            "SELECT youtube_url FROM spotify_youtube_map WHERE spotify_url = ?",
            (source_url,),
        )
        yt_row = await yt_cursor.fetchone()
        if yt_row is None:
            raise ValueError("No audio source found for this Spotify track")
        source_url = yt_row["youtube_url"]

    return source_url, platform


async def prepare_track_media(track_id: str) -> None:
    db = await _open_db()
    try:
        cached_path = cache_manager.get(track_id)
        now = datetime.now(timezone.utc).isoformat()
        if cached_path is not None:
            await upsert_media_asset(db, track_id, cached_path)
            await db.execute(
                "UPDATE tracks SET media_state = 'ready', last_media_error = NULL, last_prepared_at = ? WHERE id = ?",
                (now, track_id),
            )
            await upsert_media_job(db, track_id, status="succeeded")
            await db.commit()
            return

        try:
            source_url, _platform = await _resolve_playback_source(db, track_id)
        except Exception as exc:
            error_code, detail = classify_media_error(exc)
            await db.execute(
                "UPDATE tracks SET media_state = 'failed', last_media_error = ? WHERE id = ?",
                (detail, track_id),
            )
            await upsert_media_job(db, track_id, status="failed", last_error=f"{error_code}: {detail}")
            await db.commit()
            return

        await db.execute(
            "UPDATE tracks SET media_state = 'extracting', last_media_error = NULL WHERE id = ?",
            (track_id,),
        )
        await upsert_media_job(db, track_id, status="running")
        await db.commit()

        output_template = str(cache_manager.cache_dir / f"{track_id}.%(ext)s")

        try:
            actual_path = await ytdlp_service.download_audio(source_url, output_template)
        except Exception as exc:
            logger.error("Background preparation failed for track %s: %s", track_id, exc)
            error_code, detail = classify_media_error(exc)
            cache_manager.remove(track_id)
            await db.execute(
                "UPDATE tracks SET media_state = 'failed', last_media_error = ? WHERE id = ?",
                (detail, track_id),
            )
            await upsert_media_job(db, track_id, status="failed", last_error=f"{error_code}: {detail}")
            await db.commit()
            return

        actual_path = Path(actual_path)
        cache_manager.register(track_id, actual_path)
        await upsert_media_asset(db, track_id, actual_path)
        finished_at = datetime.now(timezone.utc).isoformat()
        await db.execute(
            """
            UPDATE tracks
            SET cached_at = ?, media_state = 'ready', last_media_error = NULL, last_prepared_at = ?
            WHERE id = ?
            """,
            (finished_at, finished_at, track_id),
        )
        await upsert_media_job(db, track_id, status="succeeded")
        await db.commit()
    finally:
        await db.close()
