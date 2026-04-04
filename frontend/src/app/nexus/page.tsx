"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import AudioVisualizer from "@/components/AudioVisualizer";
import { RevampPlaybackBar } from "@/components/RevampPlaybackBar";
import {
  addPlaylistItem,
  createPlaylist,
  getTracks,
  isBatchResponse,
  resolveTrack,
} from "@/lib/api";
import { usePlayerContext } from "@/lib/PlayerContext";
import type { Playlist, Track } from "@/types";

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function platformLabel(platform?: string): string {
  if (!platform) return "LOCAL";
  return platform.toUpperCase();
}

export default function NexusLivePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [clockText, setClockText] = useState("");

  const {
    currentTrack,
    currentClip,
    playlist,
    currentIndex,
    isPlaying,
    currentTimeMs,
    durationMs,
    volume,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    enqueueTrack,
    playTrack,
  } = usePlayerContext();

  useEffect(() => {
    getTracks()
      .then(setTracks)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load vault"));
  }, []);

  useEffect(() => {
    const formatClock = () =>
      new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });

    setClockText(formatClock());
    const timer = setInterval(() => setClockText(formatClock()), 1000);
    return () => clearInterval(timer);
  }, []);

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

          const addedTracks = result.tracks
            .filter((track) => !track.alreadyExists)
            .map((track) => ({
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
          }

          setMessage(
            [
              importedPlaylist ? `Imported ${importedPlaylist.name}.` : null,
              addedTracks.length > 0 ? `Added ${addedTracks.length} tracks.` : null,
              result.failed.length > 0 ? `${result.failed.length} unmatched.` : null,
            ]
              .filter(Boolean)
              .join(" ") || "Nothing new to add."
          );
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
          enqueueTrack(resolvedTrack);
          setMessage(result.alreadyExists ? `Queued "${result.title}".` : `Added and queued "${result.title}".`);
        }

        setUrl("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to ingest URL");
      } finally {
        setIsResolving(false);
      }
    },
    [enqueueTrack, url]
  );

  const queueItems = useMemo(() => {
    if (playlist.length > 0) {
      return playlist.filter((_, index) => index > currentIndex);
    }
    return [];
  }, [currentIndex, playlist]);

  const progressPct = durationMs > 0 ? Math.min(100, (currentTimeMs / durationMs) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col box-border overflow-hidden bg-background-light text-primary font-body">
      <div
        className="relative flex h-screen w-full flex-col bg-[#f4f4f0] group/design-root overflow-hidden"
        style={{ fontFamily: '"Space Grotesk", "Noto Sans", sans-serif' }}
      >
        <div className="layout-container flex h-full grow flex-col">
          <div className="flex flex-1 justify-center">
            <div className="layout-content-container flex flex-col w-full flex-1 border-x border-black bg-[#f4f4f0]">
              <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-black px-6 py-3">
                <Link href="/" className="flex items-center gap-4 text-black hover:text-[#FF3366] transition-colors group">
                  <span className="material-symbols-outlined text-2xl group-hover:-translate-x-1 transition-transform">
                    arrow_back
                  </span>
                  <h2 className="font-display font-bold leading-tight tracking-[0.1em] uppercase">
                    BACK TO WORKSPACE
                  </h2>
                </Link>
              </header>

              <div className="flex h-full min-h-0 flex-row bg-transparent p-0">
                <div className="flex flex-col gap-0 w-72 shrink-0 border-r border-black bg-[#f4f4f0] overflow-hidden">
                  <div className="p-4 border-b border-black shrink-0 relative bg-black text-white">
                    <h1 className="font-mono text-sm font-bold tracking-widest uppercase">Import // Vault</h1>
                    <p className="font-sans text-[10px] text-stone-400 mt-1 uppercase">Load URLs or archive nodes</p>
                  </div>

                  <div className="p-4 border-b border-black shrink-0 bg-white">
                    <label className="text-[10px] font-bold font-mono tracking-widest mb-2 block uppercase text-stone-600">
                      URL INGEST
                    </label>
                    <form
                      onSubmit={handleResolve}
                      className="flex bg-white border border-black focus-within:border-[#FF3366] focus-within:ring-1 focus-within:ring-[#FF3366] transition-colors relative"
                    >
                      <input
                        type="text"
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          if (error) setError(null);
                          if (message) setMessage(null);
                        }}
                        placeholder="YOUTUBE, SPOTIFY, TIKTOK..."
                        className="w-full bg-transparent px-2 py-2 text-xs font-mono placeholder:text-stone-300 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isResolving || !url.trim()}
                        className="bg-black hover:bg-[#FF3366] disabled:opacity-40 text-white px-3 font-mono font-bold text-lg border-l border-black transition-colors"
                      >
                        +
                      </button>
                    </form>
                    {(error || message) && (
                      <p className={`mt-2 text-[10px] font-mono uppercase ${error ? "text-[#9e143a]" : "text-[#0f6d4e]"}`}>
                        {error ?? message}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col flex-1 overflow-hidden bg-white">
                    <div className="px-4 py-2 border-b border-black bg-stone-100 shrink-0 text-[10px] font-bold font-mono uppercase tracking-widest text-stone-600 sticky top-0">
                      Local Vault
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {tracks.map((track) => (
                        <div
                          key={track.trackId}
                          className={`p-3 border-b border-black flex justify-between items-start hover:bg-stone-50 cursor-pointer group ${
                            currentTrack?.trackId === track.trackId ? "bg-stone-100" : ""
                          }`}
                        >
                          <div onClick={() => playTrack(track)} className="flex flex-col min-w-0 flex-1">
                            <span className="text-xs font-bold font-mono uppercase truncate">{track.title}</span>
                            <span className="text-[10px] text-stone-500 mt-1 uppercase truncate">{track.artist}</span>
                          </div>
                          <button
                            onClick={() => enqueueTrack(track)}
                            className="border border-black bg-white hover:bg-[#FF3366] hover:text-white hover:border-[#FF3366] transition-colors w-6 h-6 flex items-center justify-center -mr-1"
                          >
                            <span className="material-symbols-outlined text-sm font-bold">add</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0 border-r border-black bg-white overflow-y-auto">
                  <div className="flex-1 flex flex-col items-center justify-start p-10 gap-10">
                    <div className="relative w-full max-w-[500px] flex flex-col items-center gap-6">
                      <div className="w-full aspect-square border border-black bg-black relative overflow-hidden flex items-center justify-center">
                        <button className="absolute top-2 right-2 border border-white/30 text-white/50 px-1.5 py-0.5 font-mono text-[8px] bg-black/50 z-20">
                          [ VIZ_MODE ]
                        </button>
                        <AudioVisualizer isPlaying={isPlaying} />
                      </div>

                      <div className="w-full flex items-center justify-between px-2 gap-4">
                        <button className="font-mono text-[10px] border border-black px-3 py-1 flex items-center gap-1.5 hover:bg-accent-1 hover:text-white hover:border-accent-1 transition-all text-accent-1 font-bold min-w-[85px] justify-center">
                          [ LIVE ]
                        </button>
                        <div className="text-center min-w-0">
                          <p className="font-mono text-[10px] text-muted leading-tight">
                            {currentTrack ? currentTrack.artist : "SYSTEM_IDLE"}
                          </p>
                          <p className="font-mono text-xs font-bold leading-tight truncate">
                            {currentTrack ? currentTrack.title : "NO_TRACK_LOADED"}
                          </p>
                        </div>
                        <button className="font-mono text-[10px] border border-black px-3 py-1 hover:bg-black hover:text-white transition-all font-bold min-w-[85px] justify-center">
                          [ {platformLabel(currentTrack?.platform)} ]
                        </button>
                      </div>
                    </div>

                    <div className="text-center flex flex-col gap-2">
                      <h2 className="font-mono text-5xl font-bold tracking-tighter uppercase">
                        {currentTrack ? currentTrack.title : "NEXUS_IDLE"}
                      </h2>
                      <div className="flex items-center justify-center gap-3">
                        <span className="border border-black px-1.5 py-0.5 text-[10px] font-mono font-bold">
                          [ {platformLabel(currentTrack?.platform)} ]
                        </span>
                        {currentClip ? (
                          <span className="border border-black px-1.5 py-0.5 text-[10px] font-mono">
                            {currentClip.label}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="w-full max-w-[600px] flex flex-col gap-2">
                      <div className="relative h-1 bg-black/10 w-full cursor-pointer" onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        seek(ratio * durationMs);
                      }}>
                        <div className="absolute left-0 top-0 h-full bg-black" style={{ width: `${progressPct}%` }} />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent-1 border border-black"
                          style={{ left: `${progressPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between font-mono text-[10px] text-muted">
                        <span>{formatTime(currentTimeMs)}</span>
                        <span>{formatTime(durationMs)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <button onClick={prev} className="font-mono text-xs hover:text-accent-1 transition-colors">
                        [ PREV ]
                      </button>
                      <button
                        onClick={togglePlay}
                        disabled={!currentTrack}
                        className={`w-16 h-16 border border-black flex items-center justify-center transition-all ${
                          isPlaying ? "bg-accent-1 border-accent-1 text-white" : "bg-black text-white hover:bg-accent-1 hover:border-accent-1"
                        } disabled:opacity-30`}
                      >
                        <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {isPlaying ? "pause" : "play_arrow"}
                        </span>
                      </button>
                      <button onClick={next} className="font-mono text-xs hover:text-accent-1 transition-colors">
                        [ NEXT ]
                      </button>
                    </div>

                    <div className="flex items-center gap-4 w-80 mt-4">
                      <span className="font-mono text-[10px] text-muted">VOL</span>
                      <span className="material-symbols-outlined text-sm">volume_up</span>
                      <div
                        className="flex-1 h-2 bg-black/10 relative border border-black/5 cursor-pointer"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                          setVolume(ratio);
                        }}
                      >
                        <div className="absolute top-0 left-0 h-full bg-black" style={{ width: `${Math.round(volume * 100)}%` }} />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-4 bg-black"
                          style={{ left: `${Math.round(volume * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] font-bold w-10 text-right">
                        {Math.round(volume * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-80 shrink-0 flex flex-col bg-white">
                  <div className="p-2 border-b border-black bg-black text-white font-mono text-xs flex justify-between">
                    <span>UPCOMING_NODES</span>
                    <span>[QUEUE]</span>
                  </div>
                  <div className="flex-1 flex flex-col overflow-y-auto">
                    {queueItems.length === 0 ? (
                      <div className="p-4 border-b border-black font-mono text-[10px] uppercase text-muted">
                        Queue empty. Add tracks from the vault.
                      </div>
                    ) : (
                      queueItems.map((item, index) => (
                        <div key={item.id} className="p-4 border-b border-black flex flex-col gap-1 relative group">
                          <div className="flex justify-between items-start">
                            <span className="font-mono text-[10px] text-muted">NODE_{currentIndex + index + 2}</span>
                            <span className="font-mono text-[10px] text-muted">[{platformLabel(item.track.platform)}]</span>
                          </div>
                          <p className="font-mono text-sm font-bold truncate">{item.track.title}</p>
                          <div className="flex justify-between font-mono text-[10px] text-muted">
                            <span>{item.track.artist}</span>
                            <span>{formatTime(item.track.durationMs)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-black bg-black text-white px-4 h-10 flex items-center overflow-hidden shrink-0 font-mono text-xs">
                <div className="w-full relative flex items-center">
                  <span
                    className="material-symbols-outlined text-[16px] mr-2 text-accent-2"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check
                  </span>
                  <div className="flex-1 overflow-hidden">
                    <div className="animate-ticker text-accent-2 uppercase">
                      {currentTrack
                        ? `NOW_PLAYING :: ${currentTrack.title} // ${currentTrack.artist} // ${formatTime(currentTimeMs)} / ${formatTime(durationMs)} // QUEUE_DEPTH_${queueItems.length} //`
                        : "SYSTEM_NOMINAL // NO_TRACK_LOADED // INGEST_OR_QUEUE_A_NODE //"}
                    </div>
                  </div>
                  <p className="ml-4 shrink-0 text-muted">{clockText}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RevampPlaybackBar />
    </div>
  );
}
