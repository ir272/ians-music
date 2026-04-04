"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getTrackMixSettings, getTracks, updateTrackMixSettings } from "@/lib/api";
import { usePlayerContext } from "@/lib/PlayerContext";
import { RevampPlaybackBar } from "@/components/RevampPlaybackBar";
import type { Track } from "@/types";

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function sliderPercent(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}

export default function StudioPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackRateDraft, setPlaybackRateDraft] = useState(1);
  const [gainDraft, setGainDraft] = useState(1);
  const [mixStatus, setMixStatus] = useState<string | null>(null);
  const [isMixLoaded, setIsMixLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    currentTrack,
    currentTimeMs,
    durationMs,
    isPlaying,
    playTrack,
    togglePlay,
    seek,
    playlist,
    currentIndex,
    playbackRate,
    setPlaybackRate,
    trackGain,
    setTrackGain,
  } = usePlayerContext();

  useEffect(() => {
    getTracks()
      .then((loadedTracks) => {
        setTracks(loadedTracks);
        setSelectedTrackId((current) => current ?? loadedTracks[0]?.trackId ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load crate"))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredTracks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tracks;
    return tracks.filter((track) =>
      `${track.title} ${track.artist}`.toLowerCase().includes(query)
    );
  }, [search, tracks]);

  const selectedTrack =
    tracks.find((track) => track.trackId === selectedTrackId) ??
    currentTrack ??
    null;

  useEffect(() => {
    if (!selectedTrack) return;

    let cancelled = false;
    getTrackMixSettings(selectedTrack.trackId)
      .then((settings) => {
        if (cancelled) return;
        setPlaybackRateDraft(settings.playbackRate);
        setGainDraft(settings.gain);
        setIsMixLoaded(true);

        if (currentTrack?.trackId === selectedTrack.trackId) {
          setPlaybackRate(settings.playbackRate);
          setTrackGain(settings.gain);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setIsMixLoaded(false);
          setError(err instanceof Error ? err.message : "Failed to load mix settings");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.trackId, selectedTrack, setPlaybackRate, setTrackGain]);

  useEffect(() => {
    if (!selectedTrack || !isMixLoaded) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      updateTrackMixSettings(selectedTrack.trackId, {
        playbackRate: playbackRateDraft,
        gain: gainDraft,
      })
        .then(() => setMixStatus("Settings saved"))
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to save mix settings"));
    }, 250);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [gainDraft, isMixLoaded, playbackRateDraft, selectedTrack]);

  useEffect(() => {
    if (!mixStatus) return;
    const timer = setTimeout(() => setMixStatus(null), 1200);
    return () => clearTimeout(timer);
  }, [mixStatus]);

  const queueItems = playlist.length > 0 ? playlist.filter((_, index) => index > currentIndex) : [];
  const activeTrack = currentTrack?.trackId === selectedTrack?.trackId;
  const liveDuration = activeTrack ? durationMs : selectedTrack?.durationMs ?? 0;
  const liveTime = activeTrack ? currentTimeMs : 0;

  return (
    <div className="min-h-screen bg-[#F4F4F0] text-black flex flex-col">
      <div className="flex-1 flex flex-col min-h-0">
        <header className="h-14 shrink-0 border-b border-black bg-[#F4F4F0] flex items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-black hover:text-[#FF3366] transition-colors">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
            <span className="font-display font-bold tracking-[0.12em] uppercase text-sm">
              Back To Workspace
            </span>
          </Link>

          <nav className="flex items-center gap-6 text-xs uppercase font-bold">
            <span className="border-b-2 border-[#FF3366] text-[#FF3366] h-14 flex items-center">
              Mixer
            </span>
            <Link
              href={selectedTrack ? `/studio/edit?trackId=${encodeURIComponent(selectedTrack.trackId)}` : "/studio/edit"}
              className="h-14 flex items-center hover:text-[#FF3366]"
            >
              Editing
            </Link>
          </nav>
        </header>

        <main className="flex-1 min-h-0 grid grid-cols-[320px_minmax(0,1fr)_340px]">
          <aside className="border-r border-black bg-white flex flex-col min-h-0">
            <div className="p-4 border-b border-black">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] mb-3">
                Track Crate
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tracks"
                className="w-full border border-black px-3 py-2 text-xs uppercase bg-[#F4F4F0] outline-none"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-xs uppercase text-black/50">Loading crate...</div>
              ) : filteredTracks.length === 0 ? (
                <div className="p-4 text-xs uppercase text-black/50">
                  {error ?? "No tracks available"}
                </div>
              ) : (
                filteredTracks.map((track) => {
                  const selected = selectedTrack?.trackId === track.trackId;
                  return (
                    <button
                      key={track.trackId}
                      onClick={() => setSelectedTrackId(track.trackId)}
                      className={`w-full text-left p-4 border-b border-black transition-colors ${
                        selected ? "bg-black text-white" : "bg-white hover:bg-[#f1ece8]"
                      }`}
                    >
                      <div className="font-bold uppercase text-sm truncate">{track.title}</div>
                      <div className={`mt-1 text-xs truncate ${selected ? "text-white/70" : "text-black/60"}`}>
                        {track.artist}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="border-r border-black bg-[#F4F4F0] min-h-0 flex flex-col">
            <div className="p-8 border-b border-black bg-white">
              <div className="flex items-start gap-6">
                <div className="relative h-28 w-28 border-2 border-black bg-black shrink-0 overflow-hidden">
                  {selectedTrack?.thumbnailUrl ? (
                    <Image fill sizes="112px" src={selectedTrack.thumbnailUrl} alt="" unoptimized className="object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-black/50 mb-3">
                    Deck A
                  </div>
                  <h1 className="text-3xl font-black uppercase tracking-tight leading-none">
                    {selectedTrack?.title ?? "Empty Deck"}
                  </h1>
                  <p className="mt-3 text-sm uppercase text-black/60">
                    {selectedTrack?.artist ?? "No track loaded"}
                  </p>
                  {selectedTrack ? (
                    <div className="mt-4 flex items-center gap-3 text-[10px] font-bold uppercase">
                      <span className="border border-black px-2 py-1">{formatTime(selectedTrack.durationMs)}</span>
                      <span className="border border-black px-2 py-1">{selectedTrack.platform}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)_220px]">
              <div className="p-8">
                <div className="h-full border border-black bg-white p-6 flex flex-col">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-black/50 mb-4">
                    Live Deck State
                  </div>

                  <div className="flex-1 border border-dashed border-black/30 bg-[linear-gradient(#00000012_1px,transparent_1px),linear-gradient(90deg,#00000012_1px,transparent_1px)] bg-[size:20px_20px] relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 w-[2px] bg-[#FF3366]"
                      style={{
                        left: liveDuration > 0 ? `${Math.min(100, (liveTime / liveDuration) * 100)}%` : "0%",
                      }}
                    />
                  </div>

                  <div className="mt-6 flex items-center justify-between gap-8">
                    <div>
                      <div className="text-4xl font-black">{formatTime(liveTime)}</div>
                      <div className="text-sm text-black/50 mt-1">/ {formatTime(liveDuration)}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => seek(0)}
                        className="border border-black px-4 py-2 text-xs font-bold uppercase hover:bg-black hover:text-white transition-colors"
                      >
                        Cue
                      </button>
                      <button
                        onClick={() => {
                          if (!selectedTrack) return;
                          setPlaybackRate(playbackRateDraft);
                          setTrackGain(gainDraft);
                          if (activeTrack) {
                            togglePlay();
                          } else {
                            playTrack(selectedTrack);
                          }
                        }}
                        className="border border-black px-4 py-2 text-xs font-bold uppercase bg-black text-white hover:bg-[#FF3366] hover:border-[#FF3366] transition-colors"
                      >
                        {isPlaying && activeTrack ? "Pause" : "Play"}
                      </button>
                      <Link
                        href={selectedTrack ? `/studio/edit?trackId=${encodeURIComponent(selectedTrack.trackId)}` : "/studio/edit"}
                        className="border border-black px-4 py-2 text-xs font-bold uppercase hover:bg-black hover:text-white transition-colors"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-black bg-white grid grid-cols-2">
                <div className="border-r border-black p-6">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-bold mb-5">
                    <span>Speed / Rate</span>
                    <span>{playbackRateDraft.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.01"
                    value={playbackRateDraft}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setPlaybackRateDraft(next);
                      if (activeTrack) setPlaybackRate(next);
                    }}
                    className="w-full accent-[#FF3366]"
                    style={{ backgroundSize: `${sliderPercent(playbackRateDraft, 0.5, 2)} 100%` }}
                  />
                  <div className="mt-4 flex items-center justify-between text-xs uppercase text-black/60">
                    <span>Half-time</span>
                    <span>Original</span>
                    <span>Fast</span>
                  </div>
                  <div className="mt-6 border border-black p-3 text-xs uppercase text-black/60">
                    {activeTrack ? `Live rate: ${playbackRate.toFixed(2)}x` : "Select play to apply live"}
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-bold mb-5">
                    <span>Track Trim / Gain</span>
                    <span>{Math.round(gainDraft * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.01"
                    value={gainDraft}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setGainDraft(next);
                      if (activeTrack) setTrackGain(next);
                    }}
                    className="w-full accent-[#FF3366]"
                    style={{ backgroundSize: `${sliderPercent(gainDraft, 0, 1.5)} 100%` }}
                  />
                  <div className="mt-4 flex items-center justify-between text-xs uppercase text-black/60">
                    <span>Mute</span>
                    <span>Flat</span>
                    <span>Drive</span>
                  </div>
                  <div className="mt-6 flex items-center justify-between border border-black p-3 text-xs uppercase">
                    <span>{activeTrack ? `Live gain: ${Math.round(trackGain * 100)}%` : "Pending deck change"}</span>
                    <span className={mixStatus ? "text-[#0f6d4e]" : "text-black/50"}>{mixStatus ?? "Autosave armed"}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="bg-white min-h-0 flex flex-col">
            <div className="p-4 border-b border-black bg-black text-white text-[10px] uppercase tracking-[0.22em] font-bold">
              Queue / Upcoming Nodes
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {queueItems.length === 0 ? (
                <div className="p-4 text-xs uppercase text-black/50">No queued tracks</div>
              ) : (
                queueItems.map((item, index) => (
                  <div key={item.id} className="p-4 border-b border-black">
                    <div className="text-[10px] uppercase text-black/50 mb-2">Queue Slot {index + 1}</div>
                    <div className="font-bold uppercase text-sm">{item.track.title}</div>
                    <div className="text-xs text-black/60 mt-1">{item.track.artist}</div>
                    {item.clip ? (
                      <div className="mt-2 text-[10px] uppercase text-[#FF3366]">
                        Clip: {item.clip.label}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-black p-4 text-xs uppercase bg-[#F4F4F0]">
              {error ? <span className="text-[#9e143a]">{error}</span> : "Studio shell online"}
            </div>
          </aside>
        </main>
      </div>

      <RevampPlaybackBar />
    </div>
  );
}
