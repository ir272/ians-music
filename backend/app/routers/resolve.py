import logging
import uuid

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.db import get_db
from app.models.schemas import (
    ResolveRequest,
    ResolveResponse,
    BatchResolveResponse,
    ResolveCollectionResponse,
    TrackResponse,
    ReorderItemsRequest,
    TrackMixSettingsResponse,
    UpdateTrackMixSettingsRequest,
)
from app.services import ytdlp_service
from app.services.cache_manager import cache_manager
from app.services.spotify_service import (
    is_spotify_url,
    parse_spotify_url,
    spotify_client,
    SpotifyTrackInfo,
    SpotifyCollectionInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["resolve"])


def _is_youtube_auth_gate_error(message: str) -> bool:
    lowered = message.lower()
    return (
        "sign in to confirm you’re not a bot" in lowered
        or "sign in to confirm you're not a bot" in lowered
        or "page needs to be reloaded" in lowered
        or "--cookies-from-browser" in lowered
    )


@router.get("/tracks", response_model=list[TrackResponse])
async def list_tracks(
    db: aiosqlite.Connection = Depends(get_db),
) -> list[TrackResponse]:
    """List all tracks in the library."""
    cursor = await db.execute(
        "SELECT id, source_url, platform, title, artist, thumbnail_url, duration_ms, source_credit, "
        "matched_source_url, match_confidence, created_at "
        "FROM tracks ORDER BY position ASC"
    )
    rows = await cursor.fetchall()
    return [
        TrackResponse(
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
            created_at=row["created_at"],
        )
        for row in rows
    ]


@router.delete("/tracks/{track_id}", status_code=204)
async def delete_track(
    track_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> None:
    """Delete a track and its cached audio. Clips and playlist items cascade-delete via SQLite."""
    cursor = await db.execute("SELECT id FROM tracks WHERE id = ?", (track_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Track not found")

    await db.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    await db.commit()

    cache_manager.remove(track_id)


@router.patch("/tracks/reorder", status_code=204)
async def reorder_tracks(
    body: ReorderItemsRequest,
    db: aiosqlite.Connection = Depends(get_db),
) -> None:
    """Update track positions in the archive."""
    for item in body.items:
        await db.execute(
            "UPDATE tracks SET position = ? WHERE id = ?",
            (item.position, item.id),
        )
    await db.commit()


@router.get("/tracks/{track_id}/mix-settings", response_model=TrackMixSettingsResponse)
async def get_track_mix_settings(
    track_id: str,
    db: aiosqlite.Connection = Depends(get_db),
) -> TrackMixSettingsResponse:
    cursor = await db.execute("SELECT id FROM tracks WHERE id = ?", (track_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Track not found")

    cursor = await db.execute(
        "SELECT track_id, playback_rate, gain, updated_at FROM track_mix_settings WHERE track_id = ?",
        (track_id,),
    )
    row = await cursor.fetchone()

    if row is None:
        return TrackMixSettingsResponse(track_id=track_id, playback_rate=1.0, gain=1.0)

    return TrackMixSettingsResponse(
        track_id=row["track_id"],
        playback_rate=row["playback_rate"],
        gain=row["gain"],
        updated_at=row["updated_at"],
    )


@router.put("/tracks/{track_id}/mix-settings", response_model=TrackMixSettingsResponse)
async def update_track_mix_settings(
    track_id: str,
    body: UpdateTrackMixSettingsRequest,
    db: aiosqlite.Connection = Depends(get_db),
) -> TrackMixSettingsResponse:
    cursor = await db.execute("SELECT id FROM tracks WHERE id = ?", (track_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(status_code=404, detail="Track not found")

    cursor = await db.execute(
        "SELECT track_id, playback_rate, gain FROM track_mix_settings WHERE track_id = ?",
        (track_id,),
    )
    existing = await cursor.fetchone()

    playback_rate = body.playback_rate if body.playback_rate is not None else (
        existing["playback_rate"] if existing is not None else 1.0
    )
    gain = body.gain if body.gain is not None else (
        existing["gain"] if existing is not None else 1.0
    )

    if playback_rate <= 0:
        raise HTTPException(status_code=422, detail="playbackRate must be greater than 0")
    if gain < 0:
        raise HTTPException(status_code=422, detail="gain must be greater than or equal to 0")

    await db.execute(
        """
        INSERT INTO track_mix_settings (track_id, playback_rate, gain, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(track_id)
        DO UPDATE SET
          playback_rate = excluded.playback_rate,
          gain = excluded.gain,
          updated_at = datetime('now')
        """,
        (track_id, playback_rate, gain),
    )
    await db.commit()

    cursor = await db.execute(
        "SELECT track_id, playback_rate, gain, updated_at FROM track_mix_settings WHERE track_id = ?",
        (track_id,),
    )
    row = await cursor.fetchone()
    return TrackMixSettingsResponse(
        track_id=row["track_id"],
        playback_rate=row["playback_rate"],
        gain=row["gain"],
        updated_at=row["updated_at"],
    )


@router.post("/resolve")
async def resolve_url(
    body: ResolveRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    """Resolve a URL to track metadata. Creates track record(s) if new.

    For single tracks (YouTube, TikTok, single Spotify track): returns ResolveResponse.
    For Spotify albums/playlists: returns BatchResolveResponse with multiple tracks.
    """

    # --- Spotify URLs ---
    if is_spotify_url(body.url):
        url_type, spotify_id = parse_spotify_url(body.url)

        if url_type == "track" and spotify_id:
            # Check if already exists
            cursor = await db.execute(
                "SELECT id, source_url, platform, title, artist, duration_ms, thumbnail_url "
                "FROM tracks WHERE source_url = ?",
                (f"https://open.spotify.com/track/{spotify_id}",),
            )
            row = await cursor.fetchone()
            if row is not None:
                return ResolveResponse(
                    track_id=row["id"],
                    title=row["title"],
                    artist=row["artist"],
                    duration_ms=row["duration_ms"],
                    thumbnail_url=row["thumbnail_url"],
                    platform=row["platform"],
                    already_exists=True,
                )

            sp_track = await _get_spotify_track(spotify_id)
            result = await _resolve_single_spotify_track(sp_track, db)
            return result

        elif url_type == "album" and spotify_id:
            return await _resolve_spotify_collection(
                await spotify_client.get_album_tracks(spotify_id), db
            )

        elif url_type == "playlist" and spotify_id:
            return await _resolve_spotify_collection(
                await spotify_client.get_playlist_tracks(spotify_id), db
            )

        else:
            raise HTTPException(
                status_code=422,
                detail="Unsupported Spotify URL type. Paste a track, album, or playlist link.",
            )

    # --- TikTok sound/music page detection ---
    # TikTok sound pages list videos using a sound but yt-dlp can't extract them.
    # Short links (tiktok.com/t/...) may redirect to sound pages, so resolve them first.
    resolved_url = body.url
    if "tiktok.com/" in body.url:
        resolved_url = await _resolve_tiktok_redirect(body.url)
    if "tiktok.com/music/" in resolved_url:
        raise HTTPException(
            status_code=422,
            detail="TikTok sound pages aren't supported yet. "
                   "Instead, paste the URL of a specific TikTok video that uses this sound.",
        )

    # --- All other URLs: use yt-dlp directly ---

    # Check if already exists
    cursor = await db.execute(
        "SELECT id, source_url, platform, title, artist, duration_ms, thumbnail_url "
        "FROM tracks WHERE source_url = ?",
        (body.url,),
    )
    row = await cursor.fetchone()

    if row is not None:
        return ResolveResponse(
            track_id=row["id"],
            title=row["title"],
            artist=row["artist"],
            duration_ms=row["duration_ms"],
            thumbnail_url=row["thumbnail_url"],
            platform=row["platform"],
            already_exists=True,
        )

    try:
        info = await ytdlp_service.extract_info(body.url)
    except Exception as exc:
        logger.error("yt-dlp extraction failed for %s: %s", body.url, exc)
        raise HTTPException(status_code=422, detail=f"Could not resolve URL: {exc}")

    track_id = str(uuid.uuid4())

    # Shift all existing tracks down to make room at position 0
    await db.execute("UPDATE tracks SET position = position + 1")
    await db.execute(
        "INSERT INTO tracks (id, source_url, platform, title, artist, duration_ms, thumbnail_url, source_credit, position) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
        (
            track_id,
            body.url,
            info.platform,
            info.title,
            info.artist,
            info.duration_ms,
            info.thumbnail_url,
            info.source_credit,
        ),
    )
    await db.commit()

    return ResolveResponse(
        track_id=track_id,
        title=info.title,
        artist=info.artist,
        duration_ms=info.duration_ms,
        thumbnail_url=info.thumbnail_url,
        platform=info.platform,
    )


# ---------------------------------------------------------------------------
# Spotify helpers
# ---------------------------------------------------------------------------

async def _resolve_tiktok_redirect(url: str) -> str:
    """Follow TikTok short link redirects to get the final URL."""
    try:
        import httpx
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            resp = await client.head(url, headers={
                "User-Agent": "facebookexternalhit/1.1",
            })
            return str(resp.url)
    except Exception:
        return url


async def _get_spotify_track(spotify_id: str) -> SpotifyTrackInfo:
    """Fetch a single Spotify track's metadata."""
    try:
        return await spotify_client.get_track(spotify_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("Spotify API error for track %s: %s", spotify_id, exc)
        raise HTTPException(
            status_code=422,
            detail=f"Failed to fetch Spotify track info: {exc}",
        )


async def _resolve_single_spotify_track(
    sp_track: SpotifyTrackInfo,
    db: aiosqlite.Connection,
) -> ResolveResponse:
    """Resolve a single Spotify track: find YouTube match, store in DB."""

    # Check if this specific Spotify track URL already exists
    cursor = await db.execute(
        "SELECT id, title, artist, duration_ms, thumbnail_url, matched_source_url, match_confidence "
        "FROM tracks WHERE source_url = ?",
        (sp_track.spotify_track_url,),
    )
    row = await cursor.fetchone()
    if row is not None:
        return ResolveResponse(
            track_id=row["id"],
            title=row["title"],
            artist=row["artist"],
            duration_ms=row["duration_ms"],
            thumbnail_url=row["thumbnail_url"],
            platform="spotify",
            matched_source_url=row["matched_source_url"],
            match_confidence=row["match_confidence"],
            already_exists=True,
        )

    logger.info(
        "Resolving Spotify track: '%s' by %s (%dms)",
        sp_track.title, sp_track.artist, sp_track.duration_ms,
    )

    # Search YouTube for matching audio
    try:
        match = await ytdlp_service.find_best_youtube_match(
            title=sp_track.title,
            artist=sp_track.artist,
            duration_ms=sp_track.duration_ms,
        )
    except Exception as exc:
        logger.error("YouTube search failed for '%s - %s': %s", sp_track.artist, sp_track.title, exc)
        message = str(exc)
        if "youtube" in message.lower() or _is_youtube_auth_gate_error(message):
            raise HTTPException(
                status_code=422,
                detail=(
                    "YouTube blocked automated lookup on this machine. "
                    "Sign into YouTube in Chrome, then set "
                    "YTDLP_COOKIES_FROM_BROWSER=chrome in backend/.env and retry."
                ),
            )
        raise HTTPException(
            status_code=422,
            detail=f"Could not find this track on YouTube: {message}",
        )

    if match is None:
        raise HTTPException(
            status_code=422,
            detail=f"Could not find a reliable YouTube match for '{sp_track.artist} - {sp_track.title}'",
        )

    # Store track with Spotify metadata
    track_id = str(uuid.uuid4())

    # Shift all existing tracks down to make room at position 0
    await db.execute("UPDATE tracks SET position = position + 1")
    await db.execute(
        "INSERT INTO tracks (id, source_url, platform, title, artist, duration_ms, thumbnail_url, matched_source_url, match_confidence, position) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
        (
            track_id,
            sp_track.spotify_track_url,
            "spotify",
            sp_track.title,
            sp_track.artist,
            sp_track.duration_ms,
            sp_track.thumbnail_url,
            match.url,
            match.match_confidence,
        ),
    )

    # Store YouTube URL mapping for audio download
    await db.execute(
        "INSERT OR REPLACE INTO spotify_youtube_map (spotify_url, youtube_url) VALUES (?, ?)",
        (sp_track.spotify_track_url, match.url),
    )
    await db.commit()

    logger.info(
        "Spotify track resolved: '%s' by %s -> YouTube: %s (score in logs above)",
        sp_track.title, sp_track.artist, match.url,
    )

    return ResolveResponse(
        track_id=track_id,
        title=sp_track.title,
        artist=sp_track.artist,
        duration_ms=sp_track.duration_ms,
        thumbnail_url=sp_track.thumbnail_url,
        platform="spotify",
        matched_source_url=match.url,
        match_confidence=match.match_confidence,
    )


async def _resolve_spotify_collection(
    collection: SpotifyCollectionInfo,
    db: aiosqlite.Connection,
) -> BatchResolveResponse:
    """Resolve multiple Spotify tracks (from an album or playlist)."""

    resolved: list[ResolveResponse] = []
    failed: list[str] = []

    for sp_track in collection.tracks:
        try:
            result = await _resolve_single_spotify_track(sp_track, db)
            resolved.append(result)
        except HTTPException as exc:
            logger.warning(
                "Failed to resolve Spotify track '%s': %s",
                sp_track.title, exc.detail,
            )
            failed.append(f"{sp_track.artist} - {sp_track.title}")
        except Exception as exc:
            logger.warning(
                "Failed to resolve Spotify track '%s': %s",
                sp_track.title, exc,
            )
            failed.append(f"{sp_track.artist} - {sp_track.title}")

    if not resolved and failed:
        raise HTTPException(
            status_code=422,
            detail=f"Could not resolve any tracks. Failed: {', '.join(failed[:5])}",
        )

    return BatchResolveResponse(
        tracks=resolved,
        failed=failed,
        collection=ResolveCollectionResponse(
            type=collection.type,
            platform="spotify",
            name=collection.name,
            source_url=collection.spotify_url,
        ),
    )
