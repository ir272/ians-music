from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from app.models.schemas import MediaJobResponse, TrackMediaStatusResponse, TrackResponse
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
