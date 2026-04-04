"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addPlaylistItem,
  createPlaylist,
  getAllClips,
  getPlaylists,
  getTracks,
  isBatchResponse,
  resolveTrack,
} from "@/lib/api";
import { PlaylistRail } from "@/components/PlaylistRail";
import { usePlayerContext } from "@/lib/PlayerContext";
import { RevampPlaybackBar } from "@/components/RevampPlaybackBar";
import type { Clip, Playlist, Track } from "@/types";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function platformCode(platform: string): string {
  const codes: Record<string, string> = {
    spotify: "[S]",
    apple: "[A]",
    youtube: "[Y]",
    tiktok: "[T]",
    soundcloud: "[C]",
  };
  return codes[platform.toLowerCase()] ?? "[?]";
}

function platformClass(platform: string): string {
  const colors: Record<string, string> = {
    spotify: "text-spotify",
    apple: "text-apple",
    youtube: "text-youtube",
    tiktok: "text-primary",
    soundcloud: "text-soundcloud",
  };
  return colors[platform.toLowerCase()] ?? "text-black";
}

export default function HomePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isSavingToPlaylist, setIsSavingToPlaylist] = useState(false);

  const {
    currentTrack,
    currentClip,
    currentTimeMs,
    durationMs,
    isPlaying,
    togglePlay,
    playTrack,
  } = usePlayerContext();

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedTracks, loadedClips] = await Promise.all([getTracks(), getAllClips()]);
      setTracks(loadedTracks);
      setClips(loadedClips);
      setExpandedTrackId((prev) => prev ?? loadedTracks[0]?.trackId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load archive");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const loadPlaylists = useCallback(async () => {
    try {
      const loadedPlaylists = await getPlaylists();
      setPlaylists(loadedPlaylists);
      setSelectedPlaylistId((prev) => prev ?? loadedPlaylists[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load playlists");
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    const refreshArchive = () => {
      loadLibrary();
    };

    window.addEventListener("clips:changed", refreshArchive);
    window.addEventListener("focus", refreshArchive);
    return () => {
      window.removeEventListener("clips:changed", refreshArchive);
      window.removeEventListener("focus", refreshArchive);
    };
  }, [loadLibrary]);

  useEffect(() => {
    const handlePlaylistsChanged = () => {
      loadPlaylists();
    };

    window.addEventListener("playlists:changed", handlePlaylistsChanged);
    return () => {
      window.removeEventListener("playlists:changed", handlePlaylistsChanged);
    };
  }, [loadPlaylists]);

  const expandedTrack = useMemo(
    () => tracks.find((track) => track.trackId === expandedTrackId) ?? null,
    [expandedTrackId, tracks]
  );

  const expandedTrackClips = useMemo(
    () => clips.filter((clip) => clip.trackId === expandedTrack?.trackId),
    [clips, expandedTrack?.trackId]
  );

  const handleResolve = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) return;

      setIsResolving(true);
      setError(null);
      setMessage(null);

      try {
        const result = await resolveTrack(trimmed);

        if (isBatchResponse(result)) {
          let importedPlaylist: Playlist | null = null;

          if (result.collection && result.tracks.length > 0) {
            importedPlaylist = await createPlaylist({
              name: result.collection.name,
              description: `Imported from Spotify ${result.collection.type}`,
            });

            for (const track of result.tracks) {
              await addPlaylistItem(importedPlaylist.id, { trackId: track.trackId });
            }
          }

          const addedTracks = result.tracks.filter((track) => !track.alreadyExists).map((track) => ({
            trackId: track.trackId,
            title: track.title,
            artist: track.artist,
            durationMs: track.durationMs,
            thumbnailUrl: track.thumbnailUrl,
            platform: track.platform,
            matchedSourceUrl: track.matchedSourceUrl,
            matchConfidence: track.matchConfidence,
          }));

          if (addedTracks.length > 0) {
            setTracks((prev) => [...addedTracks, ...prev.filter((track) => !addedTracks.some((added) => added.trackId === track.trackId))]);
            setExpandedTrackId(addedTracks[0].trackId);
          }

          const parts: string[] = [];
          if (importedPlaylist) parts.push(`Imported ${importedPlaylist.name}.`);
          if (addedTracks.length > 0) parts.push(`Added ${addedTracks.length} new tracks.`);
          if (result.failed.length > 0) parts.push(`${result.failed.length} tracks could not be matched.`);
          if (parts.length === 0) parts.push("Nothing new to ingest.");
          setMessage(parts.join(" "));
        } else {
          const resolvedTrack: Track = {
            trackId: result.trackId,
            title: result.title,
            artist: result.artist,
            durationMs: result.durationMs,
            thumbnailUrl: result.thumbnailUrl,
            platform: result.platform,
            matchedSourceUrl: result.matchedSourceUrl,
            matchConfidence: result.matchConfidence,
          };

          setTracks((prev) => {
            const exists = prev.some((track) => track.trackId === resolvedTrack.trackId);
            return exists ? prev : [resolvedTrack, ...prev];
          });
          setExpandedTrackId(result.trackId);
          setMessage(result.alreadyExists ? `"${result.title}" is already in archive.` : `Added "${result.title}".`);
        }

        setUrl("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to ingest URL");
      } finally {
        setIsResolving(false);
      }
    },
    [url]
  );

  const handlePlayTrack = useCallback(
    (track: Track) => {
      if (currentTrack?.trackId === track.trackId && isPlaying) {
        togglePlay();
      } else {
        playTrack(track);
      }
    },
    [currentTrack?.trackId, isPlaying, playTrack, togglePlay]
  );

  const handlePlayClip = useCallback(
    (track: Track, clip: Clip) => {
      if (
        currentTrack?.trackId === track.trackId &&
        currentClip?.id === clip.id &&
        isPlaying
      ) {
        togglePlay();
      } else {
        playTrack(track, clip);
      }
    },
    [currentClip?.id, currentTrack?.trackId, isPlaying, playTrack, togglePlay]
  );

  const handleCreatePlaylist = useCallback(async () => {
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return null;

    try {
      const playlist = await createPlaylist({ name: trimmed });
      setPlaylists((prev) => [...prev, playlist]);
      setSelectedPlaylistId(playlist.id);
      setNewPlaylistName("");
      window.dispatchEvent(new Event("playlists:changed"));
      setMessage(`Created playlist "${playlist.name}".`);
      return playlist;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create playlist");
      return null;
    }
  }, [newPlaylistName]);

  const handleAddToPlaylist = useCallback(
    async (track: Track, clip?: Clip | null) => {
      setError(null);
      setMessage(null);
      setIsSavingToPlaylist(true);

      try {
        let playlistId = selectedPlaylistId;

        if (!playlistId) {
          const created = await handleCreatePlaylist();
          playlistId = created?.id ?? null;
        }

        if (!playlistId) {
          throw new Error("Select or create a playlist first");
        }

        await addPlaylistItem(playlistId, {
          trackId: track.trackId,
          clipId: clip?.id,
        });

        const playlistName =
          playlists.find((playlist) => playlist.id === playlistId)?.name ?? "playlist";

        window.dispatchEvent(new Event("playlists:changed"));
        setMessage(
          clip
            ? `Added clip "${clip.label}" to ${playlistName}.`
            : `Added "${track.title}" to ${playlistName}.`
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add item to playlist");
      } finally {
        setIsSavingToPlaylist(false);
      }
    },
    [handleCreatePlaylist, playlists, selectedPlaylistId]
  );

  const activeTrack = expandedTrack;
  const activeDuration = activeTrack?.trackId === currentTrack?.trackId ? durationMs : activeTrack?.durationMs ?? 0;
  const activeProgressPct = activeDuration > 0 && activeTrack?.trackId === currentTrack?.trackId
    ? Math.min(100, (currentTimeMs / activeDuration) * 100)
    : 0;

  const formatClipRange = useCallback((clip: Clip, track: Track) => {
    const endMs = clip.endMs ?? track.durationMs;
    return `${formatDuration(clip.startMs)} - ${formatDuration(endMs)}`;
  }, []);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <div className="flex flex-1 w-full overflow-hidden">
        <div className="relative flex h-full w-64 flex-col bg-background-light border-r border-black shrink-0">
          <div className="flex h-full flex-col justify-between p-4">
            <div className="flex flex-col gap-4">
              <h1 className="text-black text-xl font-black uppercase tracking-widest border-b-2 border-black pb-2">
                WORKSPACE
              </h1>
              <div className="flex flex-col gap-0 mt-4">
                <Link href="/nexus">
                  <div className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-black hover:text-white transition-colors border-b border-black">
                    <span className="material-symbols-outlined">play_circle</span>
                    <p className="text-sm font-bold uppercase">Nexus</p>
                  </div>
                </Link>
                <div className="flex items-center gap-3 px-3 py-3 bg-black text-white border-b border-black">
                  <span
                    className="material-symbols-outlined text-primary"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    archive
                  </span>
                  <p className="text-sm font-bold uppercase">Archive</p>
                </div>
                <Link href="/studio">
                  <div className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-black hover:text-white transition-colors border-b border-black">
                    <span className="material-symbols-outlined">cut</span>
                    <p className="text-sm font-bold uppercase">Studio</p>
                  </div>
                </Link>
              </div>
            </div>

            <div className="text-[10px] font-bold uppercase tracking-[0.2em] border border-black px-3 py-2">
              {currentTrack ? `Now loaded :: ${currentTrack.title}` : "Archive shell online"}
            </div>
          </div>
        </div>

        <div className="flex flex-col flex-1 h-full overflow-hidden relative">
          <div className="h-14 bg-background-light border-b border-black flex items-center px-6 shrink-0">
            <div className="mono text-2xl font-black tracking-tighter text-black flex items-center gap-4">
              <span className="text-primary">SETLIST_ALPHA</span>
              <span className="text-black/20">{"//"}</span>
              <span className="opacity-80 uppercase">Archive</span>
            </div>
          </div>

          <div className="h-14 border-b border-black bg-background-light flex items-center px-6 shrink-0 relative z-20">
            <span className="material-symbols-outlined text-black mr-3">terminal</span>
            <form onSubmit={handleResolve} className="flex-1 flex items-center gap-3">
              <div className="flex-1 flex items-center">
                <span className="text-black font-black mr-2 mono">&gt;</span>
                <input
                  className="w-full bg-transparent border-none focus:ring-0 p-0 text-black font-mono font-bold placeholder-black/30 text-sm"
                  placeholder="Paste a YouTube, Spotify, TikTok, or SoundCloud URL"
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (error) setError(null);
                    if (message) setMessage(null);
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={isResolving || !url.trim()}
                className="text-[10px] uppercase tracking-[0.2em] text-black font-black bg-white border border-black px-3 py-2 disabled:opacity-40"
              >
                {isResolving ? "INGESTING" : "INGEST"}
              </button>
            </form>
            <div className="text-[10px] uppercase tracking-[0.2em] text-black font-black bg-black text-white px-2 py-1">
              {isResolving ? "Query Active" : "Query Idle"}
            </div>
          </div>

          {(error || message) && (
            <div className={`px-6 py-3 text-[11px] font-mono uppercase border-b border-black ${error ? "bg-[#ffd7df] text-[#9e143a]" : "bg-[#ecfff9] text-[#0f6d4e]"}`}>
              {error ?? message}
            </div>
          )}

          <div className="flex flex-1 overflow-hidden relative bg-background-light">
            <div className="absolute right-0 top-0 bottom-0 w-3 border-l border-black bg-background-light z-30">
              <div className="absolute top-1/4 left-0 w-full h-32 bg-black border-y border-black" />
            </div>
            <div className="flex-1 overflow-auto">
              <div className="sticky top-0 bg-black text-white border-b border-black flex w-full h-10 items-center text-[10px] font-black uppercase tracking-wider z-20 mono">
                <div className="w-16 px-4 border-r border-white/20 h-full flex items-center">SRC</div>
                <div className="flex-1 px-4 border-r border-white/20 h-full flex items-center">TRACK_NAME</div>
                <div className="flex-1 px-4 border-r border-white/20 h-full flex items-center">ARTIST</div>
                <div className="w-[180px] px-4 h-full flex items-center justify-center">ACTIONS</div>
              </div>

              <div className="flex flex-col w-full pb-32 mono text-xs font-bold">
                {isLoading ? (
                  <div className="p-6 uppercase tracking-[0.2em] text-black/50">Loading archive...</div>
                ) : tracks.length === 0 ? (
                  <div className="p-6 uppercase tracking-[0.2em] text-black/50">Archive empty. Ingest a track to begin.</div>
                ) : (
                  tracks.map((track) => {
                    const isExpanded = expandedTrackId === track.trackId;
                    const isCurrent = currentTrack?.trackId === track.trackId;

                    return (
                      <div key={track.trackId} className="flex flex-col w-full border-b border-black">
                        <div
                          className={`group flex w-full h-10 items-center transition-colors cursor-pointer ${
                            isCurrent ? "bg-black text-white" : "hover:bg-black hover:text-white"
                          }`}
                          onClick={() => setExpandedTrackId((prev) => (prev === track.trackId ? null : track.trackId))}
                        >
                          <div className={`w-16 px-4 grid-border-r h-full flex items-center font-black ${platformClass(track.platform)}`}>
                            {platformCode(track.platform)}
                          </div>
                          <div className="flex-1 px-4 grid-border-r h-full flex items-center truncate uppercase">
                            {track.title}
                          </div>
                          <div className="flex-1 px-4 grid-border-r h-full flex items-center truncate opacity-60">
                            {track.artist}
                          </div>
                          <div className="w-[180px] px-2 h-full flex items-center justify-end gap-2">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                handlePlayTrack(track);
                              }}
                              className={`h-7 w-20 border-2 text-[10px] font-black uppercase transition-colors flex items-center justify-center gap-1 ${
                                isCurrent && isPlaying
                                  ? "border-primary bg-primary text-white"
                                  : "border-black bg-white text-black hover:bg-black hover:text-white"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                {isCurrent && isPlaying ? "pause" : "play_arrow"}
                              </span>
                              {isCurrent && isPlaying ? "Pause" : "Play"}
                            </button>
                            <Link
                              href={`/studio/edit?trackId=${encodeURIComponent(track.trackId)}`}
                              onClick={(event) => event.stopPropagation()}
                              className="h-7 w-20 border-2 border-black text-[10px] font-black uppercase hover:bg-primary hover:border-primary hover:text-white transition-colors flex items-center justify-center gap-1 bg-white text-black"
                            >
                              <span className="material-symbols-outlined text-[14px]">content_cut</span>
                              Edit
                            </Link>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="relative w-full min-h-[18rem] p-8 overflow-hidden flex gap-10 z-0 border-t border-black bg-white">
                            <div
                              className="absolute inset-0 opacity-10"
                              style={{
                                backgroundImage:
                                  "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)",
                                backgroundSize: "20px 20px",
                              }}
                            />
                            <div className="relative w-56 h-56 shrink-0 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden bg-black">
                              {track.thumbnailUrl ? (
                                <Image
                                  fill
                                  sizes="224px"
                                  alt={track.title}
                                  unoptimized
                                  className="object-cover grayscale contrast-150"
                                  src={track.thumbnailUrl}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/20 text-5xl">
                                  <span className="material-symbols-outlined text-[64px]">album</span>
                                </div>
                              )}
                              <div className="absolute -top-3 -left-3 bg-black text-white text-[10px] font-black px-3 py-1 border border-white tracking-tighter">
                                {track.platform.toUpperCase()}_LOCK
                              </div>
                            </div>

                            <div className="flex-1 flex flex-col z-10 font-mono text-[12px] justify-center text-black">
                              <div className="grid grid-cols-2 gap-x-12 gap-y-6 mb-8">
                                <div className="flex flex-col border-b-2 border-black pb-2">
                                  <span className="text-[10px] font-black mb-1 opacity-40">LENGTH</span>
                                  <span className="font-black text-lg uppercase">{formatDuration(track.durationMs)}</span>
                                </div>
                                <div className="flex flex-col border-b-2 border-black pb-2">
                                  <span className="text-[10px] font-black mb-1 opacity-40">SONG_TITLE</span>
                                  <span className="font-black text-lg uppercase truncate">{track.title}</span>
                                </div>
                                <div className="flex flex-col border-b-2 border-black pb-2">
                                  <span className="text-[10px] font-black mb-1 opacity-40">DATE_ADDED</span>
                                  <span className="font-black uppercase">{formatDate(track.createdAt)}</span>
                                </div>
                                <div className="flex flex-col border-b-2 border-black pb-2">
                                  <span className="text-[10px] font-black mb-1 opacity-40">ARTIST_NAME</span>
                                  <span className="text-primary font-black uppercase">{track.artist}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 mb-6 text-[10px] uppercase">
                                <div className="border border-black px-3 py-2">
                                  <span className="opacity-50">Clips:</span> {expandedTrackClips.length}
                                </div>
                                <div className="border border-black px-3 py-2">
                                  <span className="opacity-50">Source:</span> {track.matchedSourceUrl ? "Matched" : "Native"}
                                </div>
                              </div>

                              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 mb-6 items-start">
                                <div className="space-y-2">
                                  <div className="text-[10px] font-black uppercase opacity-50">Playlist target</div>
                                  <div className="flex gap-2">
                                    <select
                                      value={selectedPlaylistId ?? ""}
                                      onChange={(event) => setSelectedPlaylistId(event.target.value || null)}
                                      className="flex-1 border border-black bg-white px-3 py-2 text-[10px] uppercase font-black"
                                    >
                                      <option value="">Select playlist</option>
                                      {playlists.map((playlist) => (
                                        <option key={playlist.id} value={playlist.id}>
                                          {playlist.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => handleAddToPlaylist(track)}
                                      disabled={isSavingToPlaylist}
                                      className="border border-black bg-black text-white px-3 py-2 text-[10px] uppercase font-black disabled:opacity-50"
                                    >
                                      Add track
                                    </button>
                                  </div>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={newPlaylistName}
                                      onChange={(event) => setNewPlaylistName(event.target.value)}
                                      placeholder="New playlist name"
                                      className="flex-1 border border-black bg-white px-3 py-2 text-[10px] uppercase font-black placeholder:text-black/30"
                                    />
                                    <button
                                      type="button"
                                      onClick={handleCreatePlaylist}
                                      disabled={!newPlaylistName.trim()}
                                      className="border border-black bg-white text-black px-3 py-2 text-[10px] uppercase font-black disabled:opacity-50"
                                    >
                                      Create
                                    </button>
                                  </div>
                                </div>
                                <div className="border border-black px-3 py-2 text-[10px] uppercase font-black bg-white">
                                  {selectedPlaylistId
                                    ? `Target :: ${playlists.find((playlist) => playlist.id === selectedPlaylistId)?.name ?? "Playlist"}`
                                    : "Target :: none"}
                                </div>
                              </div>

                              <div className="mb-6 border-2 border-black bg-white">
                                <div className="border-b border-black px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em]">
                                  Clip deck
                                </div>
                                {expandedTrackClips.length === 0 ? (
                                  <div className="px-3 py-4 text-[11px] uppercase opacity-50">
                                    No saved clips yet. Use Studio Edit to create subsegments, then manage them here.
                                  </div>
                                ) : (
                                  <div className="divide-y divide-black">
                                    {expandedTrackClips.map((clip) => {
                                      const isCurrentClip =
                                        currentTrack?.trackId === track.trackId &&
                                        currentClip?.id === clip.id;

                                      return (
                                        <div
                                          key={clip.id}
                                          className="grid grid-cols-[minmax(0,1fr)_140px_260px] gap-3 px-3 py-3 items-center"
                                        >
                                          <div className="min-w-0">
                                            <div className="truncate text-[11px] font-black uppercase">
                                              {clip.label}
                                            </div>
                                            <div className="text-[10px] uppercase opacity-50">
                                              {formatClipRange(clip, track)}
                                            </div>
                                          </div>
                                          <div className="text-[10px] uppercase">
                                            <div>Fade in: {formatDuration(clip.fadeInMs)}</div>
                                            <div>Fade out: {formatDuration(clip.fadeOutMs)}</div>
                                          </div>
                                          <div className="flex gap-2 justify-end">
                                            <button
                                              type="button"
                                              onClick={() => handlePlayClip(track, clip)}
                                              className={`border border-black px-3 py-2 text-[10px] uppercase font-black ${
                                                isCurrentClip && isPlaying
                                                  ? "bg-primary text-white border-primary"
                                                  : "bg-white text-black"
                                              }`}
                                            >
                                              {isCurrentClip && isPlaying ? "Pause clip" : "Play clip"}
                                            </button>
                                            <Link
                                              href={`/studio/edit?trackId=${encodeURIComponent(track.trackId)}&clipId=${encodeURIComponent(clip.id)}`}
                                              className="border border-black bg-white text-black px-3 py-2 text-[10px] uppercase font-black"
                                            >
                                              Edit clip
                                            </Link>
                                            <button
                                              type="button"
                                              onClick={() => handleAddToPlaylist(track, clip)}
                                              disabled={isSavingToPlaylist}
                                              className="border border-black bg-black text-white px-3 py-2 text-[10px] uppercase font-black disabled:opacity-50"
                                            >
                                              Add clip
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              <div className="mt-auto">
                                <div className="w-full h-14 bg-white border-2 border-black relative overflow-hidden flex items-center px-4">
                                  <div
                                    className="absolute inset-y-0 left-0 bg-primary/15"
                                    style={{ width: `${activeTrack?.trackId === track.trackId ? activeProgressPct : 0}%` }}
                                  />
                                  <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxwYXRoIGQ9Ik0wLDUwIEwxMCwzMCBMMjAsNzAgTDMwLDQwIEw0MCw4MCBMNTAsMjAgTDYwLDYwIEw3MCwyMCBMODAsODAgTDkwLDQwIEwxMDAsNTAiIHN0cm9rZT0iIzAwMCIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+')] bg-repeat-x bg-center" />
                                  {activeTrack?.trackId === track.trackId && (
                                    <div
                                      className="h-full w-1 bg-primary absolute"
                                      style={{ left: `${activeProgressPct}%` }}
                                    />
                                  )}
                                  <span className="text-[10px] font-black z-10 bg-black text-white px-3 py-1 border border-black uppercase">
                                    {isCurrent && isPlaying ? "PREVIEW_STREAMING" : "PREVIEW_READY"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <PlaylistRail activePlaylistId={selectedPlaylistId} />
      </div>

      <RevampPlaybackBar />
    </div>
  );
}
