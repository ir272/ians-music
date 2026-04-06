from __future__ import annotations

import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from app.models.schemas import (
    MediaAssetResponse,
    MediaJobResponse,
    TrackMediaStatusResponse,
    TrackPlaybackResponse,
    TrackResponse,
)
from app.services.cache_manager import cache_manager


def infer_track_media_state(cached_path: Path | None, stored_state: str | None, last_media_error: str | None) -> str:
    if cached_path is not None:
        return "ready"
    if stored_state in {"queued", "extracting"}:
        return stored_state
    if last_media_error:
        return "failed"
    return "resolved"


def build_track_response(row: aiosqlite.Row, cached_path: Path | None) -> TrackResponse:
    media_state = infer_track_media_state(cached_path, row["media_state"], row["last_media_error"])
    return TrackResponse(
        track_id=row["id"],
        source_url=row["source_url"],
        platform=row["platform"],
        title=row["title"],
        artist=row["artist"],
        thumbnail_url=row["thumbnail_url"],
        duration_ms=row["duration_ms"],
        source_credit=row["source_credit"],
        matched_source_url=row["matched_source_url"],
        match_confidence=row["match_confidence"],
        media_state=media_state,
        is_playable=media_state == "ready",
        last_media_error=row["last_media_error"],
        created_at=row["created_at"],
    )


def _detect_mime(path: Path) -> str:
    guessed = mimetypes.guess_type(str(path))[0]
    return guessed or "application/octet-stream"


async def upsert_media_job(
    db: aiosqlite.Connection,
    track_id: str,
    *,
    status: str,
    last_error: str | None = None,
    job_type: str = "prepare_playback_asset",
) -> str:
    cursor = await db.execute(
        """
        SELECT id, attempt_count
        FROM media_jobs
        WHERE track_id = ? AND job_type = ?
        ORDER BY datetime(updated_at) DESC
        LIMIT 1
        """,
        (track_id, job_type),
    )
    existing = await cursor.fetchone()

    if existing is None:
        job_id = str(uuid.uuid4())
        attempt_count = 1 if status in {"running", "failed"} else 0
        await db.execute(
            """
            INSERT INTO media_jobs (id, track_id, job_type, status, attempt_count, last_error, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                track_id,
                job_type,
                status,
                attempt_count,
                last_error,
                datetime.now(timezone.utc).isoformat(),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        return job_id

    attempt_count = existing["attempt_count"]
    if status in {"running", "failed"}:
        attempt_count += 1

    await db.execute(
        """
        UPDATE media_jobs
        SET status = ?, attempt_count = ?, last_error = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            status,
            attempt_count,
            last_error,
            datetime.now(timezone.utc).isoformat(),
            existing["id"],
        ),
    )
    return existing["id"]


async def fetch_active_media_job(db: aiosqlite.Connection, track_id: str) -> MediaJobResponse | None:
    cursor = await db.execute(
        """
        SELECT id, track_id, job_type, status, attempt_count, last_error, created_at, updated_at
        FROM media_jobs
        WHERE track_id = ?
        ORDER BY datetime(updated_at) DESC
        LIMIT 1
        """,
        (track_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

    return MediaJobResponse(
        id=row["id"],
        track_id=row["track_id"],
        job_type=row["job_type"],
        status=row["status"],
        attempt_count=row["attempt_count"],
        last_error=row["last_error"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def upsert_media_asset(
    db: aiosqlite.Connection,
    track_id: str,
    path: Path,
    *,
    storage_kind: str = "cache",
) -> MediaAssetResponse:
    now = datetime.now(timezone.utc).isoformat()
    asset_id = str(uuid.uuid4())
    mime_type = _detect_mime(path)
    file_size = path.stat().st_size
    file_path = str(path)

    cursor = await db.execute(
        """
        SELECT id, created_at
        FROM media_assets
        WHERE track_id = ? AND storage_kind = ?
        LIMIT 1
        """,
        (track_id, storage_kind),
    )
    existing = await cursor.fetchone()

    if existing is None:
        await db.execute(
            """
            INSERT INTO media_assets (id, track_id, storage_kind, file_path, mime_type, file_size, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (asset_id, track_id, storage_kind, file_path, mime_type, file_size, now, now),
        )
        created_at = now
    else:
        asset_id = existing["id"]
        created_at = existing["created_at"]
        await db.execute(
            """
            UPDATE media_assets
            SET file_path = ?, mime_type = ?, file_size = ?, updated_at = ?
            WHERE id = ?
            """,
            (file_path, mime_type, file_size, now, asset_id),
        )

    return MediaAssetResponse(
        id=asset_id,
        track_id=track_id,
        storage_kind=storage_kind,
        file_path=file_path,
        mime_type=mime_type,
        file_size=file_size,
        created_at=created_at,
        updated_at=now,
    )


async def fetch_media_asset(db: aiosqlite.Connection, track_id: str) -> MediaAssetResponse | None:
    cursor = await db.execute(
        """
        SELECT id, track_id, storage_kind, file_path, mime_type, file_size, created_at, updated_at
        FROM media_assets
        WHERE track_id = ?
        ORDER BY datetime(updated_at) DESC
        LIMIT 1
        """,
        (track_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

    return MediaAssetResponse(
        id=row["id"],
        track_id=row["track_id"],
        storage_kind=row["storage_kind"],
        file_path=row["file_path"],
        mime_type=row["mime_type"],
        file_size=row["file_size"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def build_track_media_status(db: aiosqlite.Connection, track_id: str) -> TrackMediaStatusResponse:
    cursor = await db.execute(
        """
        SELECT id, media_state, last_media_error
        FROM tracks
        WHERE id = ?
        """,
        (track_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise ValueError("Track not found")

    cached_path = cache_manager.get(track_id)
    media_state = infer_track_media_state(cached_path, row["media_state"], row["last_media_error"])
    active_job = await fetch_active_media_job(db, track_id)

    return TrackMediaStatusResponse(
        track_id=track_id,
        media_state=media_state,
        is_playable=media_state == "ready",
        active_job=active_job,
        last_media_error=row["last_media_error"],
        cached_path=str(cached_path) if cached_path is not None else None,
    )


async def build_track_playback_response(db: aiosqlite.Connection, track_id: str) -> TrackPlaybackResponse:
    cursor = await db.execute(
        """
        SELECT id, media_state, last_media_error
        FROM tracks
        WHERE id = ?
        """,
        (track_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise ValueError("Track not found")

    cached_path = cache_manager.get(track_id)
    asset = await fetch_media_asset(db, track_id)
    if cached_path is not None:
        asset = await upsert_media_asset(db, track_id, cached_path)

    media_state = infer_track_media_state(cached_path, row["media_state"], row["last_media_error"])
    return TrackPlaybackResponse(
        track_id=track_id,
        media_state=media_state,
        is_playable=media_state == "ready",
        playback_url=f"/api/audio/{track_id}" if media_state == "ready" else None,
        last_media_error=row["last_media_error"],
        asset=asset,
    )
