import logging
import mimetypes
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.db import get_db
from app.services import ytdlp_service
from app.services.cache_manager import cache_manager
from app.services.media_prepare import classify_media_error
from app.services.media_state import upsert_media_asset, upsert_media_job
from app.services.ytdlp_service import AudioStreamInfo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["audio"])

# Map common audio extensions to MIME types
_EXT_TO_MIME: dict[str, str] = {
    ".webm": "audio/webm",
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
}

def _detect_mime(path: Path) -> str:
    """Detect MIME type from file extension, falling back to audio/webm."""
    ext = path.suffix.lower()
    if ext in _EXT_TO_MIME:
        return _EXT_TO_MIME[ext]
    guessed = mimetypes.guess_type(str(path))[0]
    return guessed or "audio/webm"


@router.get("/audio/{track_id}")
async def stream_audio(
    track_id: str,
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
):
    """Stream audio for a track. Serves from cache if available, otherwise downloads via yt-dlp first."""

    # Look up track
    cursor = await db.execute(
        "SELECT id, source_url, platform FROM tracks WHERE id = ?",
        (track_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Track not found")

    source_url: str = row["source_url"]
    platform: str = row["platform"]

    # For Spotify tracks, look up the mapped YouTube URL for audio download
    if platform == "spotify":
        yt_cursor = await db.execute(
            "SELECT youtube_url FROM spotify_youtube_map WHERE spotify_url = ?",
            (source_url,),
        )
        yt_row = await yt_cursor.fetchone()
        if yt_row is not None:
            source_url = yt_row["youtube_url"]
        else:
            logger.error("No YouTube mapping found for Spotify track %s", track_id)
            raise HTTPException(status_code=502, detail="No audio source found for this Spotify track")

    # Update last_played
    now = datetime.now(timezone.utc).isoformat()
    await db.execute("UPDATE tracks SET last_played = ? WHERE id = ?", (now, track_id))
    await upsert_media_job(db, track_id, status="running")
    await db.commit()

    # Check cache
    cached_path = cache_manager.get(track_id)
    if cached_path is not None:
        await upsert_media_asset(db, track_id, cached_path)
        await db.execute(
            "UPDATE tracks SET media_state = 'ready', last_media_error = NULL, last_prepared_at = ? WHERE id = ?",
            (now, track_id),
        )
        await upsert_media_job(db, track_id, status="succeeded")
        await db.commit()
        return _serve_from_cache(cached_path, request)

    # Uncached YouTube/Spotify tracks should start playback immediately instead of
    # blocking on a full yt-dlp download. Their direct stream URLs are ephemeral and
    # often require extractor-provided headers, so proxy the upstream stream through
    # the backend on first play.
    if platform in {"youtube", "spotify"}:
        try:
            stream_info = await ytdlp_service.get_audio_stream_info(source_url)
        except Exception as exc:
            logger.error("Failed to extract direct stream URL for track %s: %s", track_id, exc)
            error_code, detail = classify_media_error(exc)
            await db.execute(
                "UPDATE tracks SET media_state = 'failed', last_media_error = ? WHERE id = ?",
                (detail, track_id),
            )
            await upsert_media_job(db, track_id, status="failed", last_error=f"{error_code}: {detail}")
            await db.commit()
            raise HTTPException(status_code=502, detail=detail) from exc

        logger.info("Proxying direct audio stream for uncached track %s", track_id)
        await db.execute(
            "UPDATE tracks SET media_state = 'ready', last_media_error = NULL, last_prepared_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), track_id),
        )
        await upsert_media_job(db, track_id, status="succeeded")
        await db.commit()
        return await _proxy_direct_stream(request, stream_info)

    # Not cached — download via yt-dlp (uses its own throttle-resistant downloader)
    return await _download_and_serve(track_id, source_url, request, db)


def _serve_from_cache(cached_path: Path, request: Request):
    """Serve a cached audio file with Range header support."""
    file_size = cached_path.stat().st_size
    content_type = _detect_mime(cached_path)

    range_header = request.headers.get("range")

    if range_header:
        range_spec = range_header.replace("bytes=", "")
        parts = range_spec.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        content_length = end - start + 1

        def iter_range():
            with open(cached_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(64 * 1024, remaining)
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iter_range(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            },
        )

    # No range — serve full file
    def iter_full():
        with open(cached_path, "rb") as f:
            while True:
                chunk = f.read(64 * 1024)
                if not chunk:
                    break
                yield chunk

    return StreamingResponse(
        iter_full(),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )


def _passthrough_headers(response: httpx.Response) -> dict[str, str]:
    headers: dict[str, str] = {}
    for name in ("content-type", "content-length", "content-range", "accept-ranges"):
        value = response.headers.get(name)
        if value:
            headers[name.title()] = value
    return headers


async def _proxy_direct_stream(request: Request, stream_info: AudioStreamInfo) -> StreamingResponse:
    headers = dict(stream_info.headers)
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient(follow_redirects=True, timeout=60.0)
    try:
        response = await client.send(
            client.build_request("GET", stream_info.url, headers=headers),
            stream=True,
        )
    except Exception as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Could not proxy upstream audio: {exc}") from exc

    if response.status_code >= 400:
        body = await response.aread()
        await response.aclose()
        await client.aclose()
        detail = body.decode(errors="ignore").strip()
        raise HTTPException(
            status_code=502,
            detail=f"Upstream audio stream failed with status {response.status_code}{f': {detail[:120]}' if detail else ''}",
        )

    async def iter_stream():
        try:
            async for chunk in response.aiter_bytes():
                if chunk:
                    yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        iter_stream(),
        status_code=response.status_code,
        media_type=response.headers.get("content-type", "audio/mpeg"),
        headers=_passthrough_headers(response),
    )


async def _download_and_serve(
    track_id: str,
    source_url: str,
    request: Request,
    db: aiosqlite.Connection,
):
    """Download audio via yt-dlp to cache, then serve from cache."""

    # yt-dlp will choose the correct extension based on the format
    output_template = str(cache_manager.cache_dir / f"{track_id}.%(ext)s")

    try:
        actual_path = await ytdlp_service.download_audio(source_url, output_template)
    except Exception as exc:
        logger.error("Failed to download audio for track %s: %s", track_id, exc)
        cache_manager.remove(track_id)
        # Fallback: proxy a fresh direct audio URL so playback can still start
        # even when yt-dlp's downloader cannot persist the file locally.
        try:
            stream_info = await ytdlp_service.get_audio_stream_info(source_url)
        except Exception as stream_exc:
            logger.error(
                "Failed to extract direct audio URL for track %s after download failure: %s",
                track_id,
                stream_exc,
            )
            error_code, detail = classify_media_error(stream_exc)
            await db.execute(
                "UPDATE tracks SET media_state = 'failed', last_media_error = ? WHERE id = ?",
                (detail, track_id),
            )
            await upsert_media_job(db, track_id, status="failed", last_error=f"{error_code}: {detail}")
            await db.commit()
            raise HTTPException(status_code=502, detail=detail) from stream_exc

        logger.warning(
            "Falling back to direct audio proxy for track %s after cache download failure",
            track_id,
        )
        await db.execute(
            "UPDATE tracks SET media_state = 'ready', last_media_error = NULL, last_prepared_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), track_id),
        )
        await upsert_media_job(db, track_id, status="succeeded")
        await db.commit()
        return await _proxy_direct_stream(request, stream_info)

    actual_path = Path(actual_path)

    # Register the downloaded file in the cache manager
    cache_manager.register(track_id, actual_path)
    await upsert_media_asset(db, track_id, actual_path)

    # Update DB
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE tracks SET cached_at = ?, media_state = 'ready', last_media_error = NULL, last_prepared_at = ? WHERE id = ?",
        (now, now, track_id),
    )
    await upsert_media_job(db, track_id, status="succeeded")
    await db.commit()

    logger.info("Cached audio for track %s at %s (%s bytes)", track_id, actual_path, actual_path.stat().st_size)

    return _serve_from_cache(actual_path, request)
