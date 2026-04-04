"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClip, deleteClip, getClips, getTracks, updateClip } from "@/lib/api";
import { usePlayerContext } from "@/lib/PlayerContext";
import { RevampPlaybackBar } from "@/components/RevampPlaybackBar";
import type { Clip, Track } from "@/types";

function msToTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${min}:${sec.toString().padStart(2, "0")}.${hundredths.toString().padStart(2, "0")}`;
}

function timestampToMs(input: string): number | null {
  const match = input.match(/^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const hundredths = match[3] ? parseInt(match[3], 10) : 0;
  if (seconds >= 60) return null;
  return minutes * 60000 + seconds * 1000 + hundredths * 10;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function buildDraft(clip?: Clip | null) {
  return {
    label: clip?.label ?? "",
    startMs: clip?.startMs ?? 0,
    endMs: clip?.endMs ?? null,
    fadeInMs: clip?.fadeInMs ?? 0,
    fadeOutMs: clip?.fadeOutMs ?? 0,
    startText: msToTimestamp(clip?.startMs ?? 0),
    endText: clip?.endMs !== null && clip?.endMs !== undefined ? msToTimestamp(clip.endMs) : "",
  };
}

function SurgeryPageContent() {
  const searchParams = useSearchParams();
  const initialTrackId = searchParams.get("trackId");
  const initialClipId = searchParams.get("clipId");

  const [tracks, setTracks] = useState<Track[]>([]);
  const [isTracksLoading, setIsTracksLoading] = useState(true);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(initialTrackId);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(initialClipId);
  const [draft, setDraft] = useState(buildDraft());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    currentTrack,
    currentTimeMs,
    durationMs,
    isPlaying,
    playTrack,
    togglePlay,
    seek,
  } = usePlayerContext();

  useEffect(() => {
    getTracks()
      .then((loadedTracks) => {
        setTracks(loadedTracks);
        setSelectedTrackId((current) => current ?? loadedTracks[0]?.trackId ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tracks"))
      .finally(() => setIsTracksLoading(false));
  }, []);

  const selectedTrack = useMemo(() => {
    if (!selectedTrackId) return currentTrack ?? tracks[0] ?? null;
    return tracks.find((track) => track.trackId === selectedTrackId) ?? currentTrack ?? tracks[0] ?? null;
  }, [currentTrack, selectedTrackId, tracks]);

  useEffect(() => {
    if (!selectedTrack) return;

    let cancelled = false;
    getClips(selectedTrack.trackId)
      .then((loadedClips) => {
        if (cancelled) return;
        setClips(loadedClips);
        setSelectedClipId((current) => {
          if (current && loadedClips.some((clip) => clip.id === current)) return current;
          return loadedClips[0]?.id ?? null;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load clips");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTrack]);

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedClipId) ?? null,
    [clips, selectedClipId]
  );

  useEffect(() => {
    setDraft(buildDraft(selectedClip));
  }, [selectedClip, selectedTrack?.trackId]);

  useEffect(() => {
    if (selectedTrack && currentTrack?.trackId !== selectedTrack.trackId) {
      playTrack(selectedTrack);
    }
  }, [currentTrack?.trackId, playTrack, selectedTrack]);

  const resolvedDuration = selectedTrack?.trackId === currentTrack?.trackId ? durationMs : selectedTrack?.durationMs ?? 0;
  const playheadPct = resolvedDuration > 0 ? Math.min(100, (currentTimeMs / resolvedDuration) * 100) : 0;
  const startPct = resolvedDuration > 0 ? Math.min(100, (draft.startMs / resolvedDuration) * 100) : 0;
  const endValue = draft.endMs ?? resolvedDuration;
  const endPct = resolvedDuration > 0 ? Math.min(100, (endValue / resolvedDuration) * 100) : 100;
  const clipDuration = Math.max(0, endValue - draft.startMs);

  const applyDraft = useCallback((partial: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...partial }));
  }, []);

  const handleAutoEdit = useCallback(() => {
    if (!selectedTrack) return;
    const suggestedStart = Math.floor(selectedTrack.durationMs * 0.18);
    const suggestedEnd = Math.floor(selectedTrack.durationMs * 0.62);
    applyDraft({
      label: draft.label.trim() ? draft.label : "Peak segment",
      startMs: suggestedStart,
      endMs: suggestedEnd,
      startText: msToTimestamp(suggestedStart),
      endText: msToTimestamp(suggestedEnd),
      fadeInMs: 120,
      fadeOutMs: 120,
    });
    setMessage("Peak segment suggested.");
    setError(null);
  }, [applyDraft, draft.label, selectedTrack]);

  const handlePreview = useCallback(() => {
    if (!selectedTrack) return;

    const previewClip: Clip = {
      id: selectedClip?.id ?? "preview",
      trackId: selectedTrack.trackId,
      label: draft.label || "Preview",
      startMs: draft.startMs,
      endMs: draft.endMs,
      fadeInMs: draft.fadeInMs,
      fadeOutMs: draft.fadeOutMs,
    };

    if (currentTrack?.trackId !== selectedTrack.trackId) {
      playTrack(selectedTrack, previewClip);
      return;
    }

    seek(draft.startMs);
    if (!isPlaying) togglePlay();
  }, [currentTrack?.trackId, draft, isPlaying, playTrack, seek, selectedClip?.id, selectedTrack, togglePlay]);

  const refreshClips = useCallback(async (trackId: string, preferClipId?: string | null) => {
    const nextClips = await getClips(trackId);
    setClips(nextClips);
    const nextSelection =
      (preferClipId && nextClips.find((clip) => clip.id === preferClipId)?.id) ??
      nextClips[0]?.id ??
      null;
    setSelectedClipId(nextSelection);
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedTrack) return;
    if (!draft.label.trim()) {
      setError("Clip label is required.");
      return;
    }
    if (draft.endMs !== null && draft.endMs <= draft.startMs) {
      setError("OUT point must be after IN point.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = selectedClip
        ? await updateClip(selectedClip.id, {
            label: draft.label.trim(),
            startMs: draft.startMs,
            endMs: draft.endMs ?? undefined,
            fadeInMs: draft.fadeInMs,
            fadeOutMs: draft.fadeOutMs,
          })
        : await createClip({
            trackId: selectedTrack.trackId,
            label: draft.label.trim(),
            startMs: draft.startMs,
            endMs: draft.endMs ?? undefined,
            fadeInMs: draft.fadeInMs,
            fadeOutMs: draft.fadeOutMs,
          });

      setMessage(selectedClip ? `Updated "${saved.label}".` : `Saved "${saved.label}".`);
      await refreshClips(selectedTrack.trackId, saved.id);
      window.dispatchEvent(new Event("clips:changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save clip");
    } finally {
      setIsSaving(false);
    }
  }, [draft, refreshClips, selectedClip, selectedTrack]);

  const handleDelete = useCallback(async () => {
    if (!selectedTrack || !selectedClip) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      await deleteClip(selectedClip.id);
      setDraft(buildDraft());
      setMessage(`Deleted "${selectedClip.label}".`);
      await refreshClips(selectedTrack.trackId, null);
      window.dispatchEvent(new Event("clips:changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete clip");
    } finally {
      setIsSaving(false);
    }
  }, [refreshClips, selectedClip, selectedTrack]);

  if (isTracksLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col bg-[#F4F4F0]">
        <div className="flex-1 flex items-center justify-center font-mono uppercase">
          Loading editor...
        </div>
        <RevampPlaybackBar />
      </div>
    );
  }

  if (!selectedTrack) {
    return (
      <div className="min-h-screen w-full flex flex-col bg-[#F4F4F0]">
        <div className="flex-1 flex items-center justify-center font-mono uppercase">
          No track available for editing.
        </div>
        <RevampPlaybackBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#F4F4F0] text-black">
      <div className="flex-1 flex flex-col min-h-0">
        <header className="h-14 shrink-0 border-b border-black bg-[#F4F4F0] flex items-center justify-between px-6">
          <Link href="/studio" className="flex items-center gap-2 text-black hover:text-[#FF3366] transition-colors">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
            <span className="font-display font-bold tracking-[0.12em] uppercase text-sm">Back To Mixer</span>
          </Link>

          <nav className="flex items-center gap-6 text-xs uppercase font-bold">
            <Link href="/studio" className="h-14 flex items-center hover:text-[#FF3366]">
              Mixer
            </Link>
            <span className="border-b-2 border-[#FF3366] text-[#FF3366] h-14 flex items-center">
              Editing
            </span>
          </nav>
        </header>

        <main className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_360px]">
          <aside className="border-r border-black bg-white flex flex-col min-h-0">
            <div className="p-4 border-b border-black">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] mb-3">Track Vault</div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {tracks.map((track) => {
                  const active = selectedTrack.trackId === track.trackId;
                  return (
                    <button
                      key={track.trackId}
                      onClick={() => setSelectedTrackId(track.trackId)}
                      className={`w-full border px-3 py-3 text-left text-xs uppercase ${
                        active ? "border-black bg-black text-white" : "border-black bg-[#F4F4F0] hover:bg-white"
                      }`}
                    >
                      <div className="font-bold truncate">{track.title}</div>
                      <div className={active ? "text-white/70 mt-1" : "text-black/50 mt-1"}>{track.artist}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-4 border-b border-black bg-black text-white text-[10px] uppercase tracking-[0.22em] font-bold">
                Saved Clips
              </div>
              {clips.length === 0 ? (
                <div className="p-4 text-xs uppercase text-black/50">No clips for this track yet</div>
              ) : (
                clips.map((clip) => {
                  const active = selectedClip?.id === clip.id;
                  return (
                    <button
                      key={clip.id}
                      onClick={() => setSelectedClipId(clip.id)}
                      className={`w-full border-b border-black px-4 py-4 text-left ${
                        active ? "bg-[#ffe7ee]" : "bg-white hover:bg-[#f5f2ee]"
                      }`}
                    >
                      <div className="text-xs font-bold uppercase">{clip.label}</div>
                      <div className="mt-2 text-[10px] uppercase text-black/50">
                        {msToTimestamp(clip.startMs)} → {clip.endMs !== null ? msToTimestamp(clip.endMs) : "END"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="border-r border-black min-h-0 flex flex-col">
            <div className="p-8 border-b border-black bg-white">
              <div className="flex items-start gap-6">
                <div className="relative h-28 w-28 border-2 border-black bg-black shrink-0 overflow-hidden">
                  {selectedTrack.thumbnailUrl ? (
                    <Image fill sizes="112px" src={selectedTrack.thumbnailUrl} alt="" unoptimized className="object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-black/50 mb-3">Clip Surgery</div>
                  <h1 className="text-3xl font-black uppercase tracking-tight leading-none">{selectedTrack.title}</h1>
                  <p className="mt-3 text-sm uppercase text-black/60">{selectedTrack.artist}</p>
                  <div className="mt-4 flex items-center gap-3 text-[10px] font-bold uppercase">
                    <span className="border border-black px-2 py-1">{selectedTrack.platform}</span>
                    <span className="border border-black px-2 py-1">{formatDuration(selectedTrack.durationMs)}</span>
                    <span className="border border-black px-2 py-1">{clips.length} clips</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 p-8">
              <div className="h-full border border-black bg-white flex flex-col">
                <div className="px-6 py-4 border-b border-black flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em]">Timeline / Preview</div>
                  <div className="text-xs uppercase text-black/50">
                    Playhead {msToTimestamp(currentTimeMs)}
                  </div>
                </div>

                <div className="flex-1 p-6 flex flex-col gap-6">
                  <div className="relative h-56 border border-dashed border-black/30 bg-[linear-gradient(#00000012_1px,transparent_1px),linear-gradient(90deg,#00000012_1px,transparent_1px)] bg-[size:20px_20px] overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 bg-[#ffe7ee]"
                      style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
                    />
                    <div className="absolute top-0 bottom-0 border-l border-dashed border-black" style={{ left: `${startPct}%` }}>
                      <span className="absolute top-2 left-2 bg-black text-white px-2 py-1 text-[10px] uppercase">In</span>
                    </div>
                    <div className="absolute top-0 bottom-0 border-l border-dashed border-black" style={{ left: `${endPct}%` }}>
                      <span className="absolute top-2 -translate-x-full -ml-2 bg-black text-white px-2 py-1 text-[10px] uppercase">Out</span>
                    </div>
                    <div className="absolute inset-y-0 w-[2px] bg-[#FF3366]" style={{ left: `${playheadPct}%` }} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex flex-col gap-2 text-xs uppercase font-bold">
                      In Point
                      <input
                        className="border border-black px-3 py-3 bg-[#F4F4F0] outline-none"
                        value={draft.startText}
                        onChange={(e) => {
                          const nextText = e.target.value;
                          applyDraft({ startText: nextText });
                          const nextValue = timestampToMs(nextText);
                          if (nextValue !== null) {
                            applyDraft({ startMs: nextValue });
                          }
                        }}
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-xs uppercase font-bold">
                      Out Point
                      <input
                        className="border border-black px-3 py-3 bg-[#F4F4F0] outline-none"
                        value={draft.endText}
                        onChange={(e) => {
                          const nextText = e.target.value;
                          applyDraft({ endText: nextText });
                          if (!nextText.trim()) {
                            applyDraft({ endMs: null });
                            return;
                          }
                          const nextValue = timestampToMs(nextText);
                          if (nextValue !== null) {
                            applyDraft({ endMs: nextValue });
                          }
                        }}
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-xs uppercase font-bold">
                      Fade In (ms)
                      <input
                        type="number"
                        min="0"
                        className="border border-black px-3 py-3 bg-[#F4F4F0] outline-none"
                        value={draft.fadeInMs}
                        onChange={(e) => applyDraft({ fadeInMs: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </label>

                    <label className="flex flex-col gap-2 text-xs uppercase font-bold">
                      Fade Out (ms)
                      <input
                        type="number"
                        min="0"
                        className="border border-black px-3 py-3 bg-[#F4F4F0] outline-none"
                        value={draft.fadeOutMs}
                        onChange={(e) => applyDraft({ fadeOutMs: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
                    <label className="flex flex-col gap-2 text-xs uppercase font-bold">
                      Clip Label
                      <input
                        className="border border-black px-3 py-3 bg-[#F4F4F0] outline-none"
                        value={draft.label}
                        onChange={(e) => applyDraft({ label: e.target.value })}
                        placeholder="Peak segment // chorus // drop"
                      />
                    </label>

                    <div className="border border-black px-4 py-3 text-xs uppercase bg-[#F4F4F0]">
                      Duration {formatDuration(clipDuration)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="bg-white min-h-0 flex flex-col">
            <div className="p-4 border-b border-black bg-black text-white text-[10px] uppercase tracking-[0.22em] font-bold">
              Actions / Clip Control
            </div>

            <div className="p-6 border-b border-black flex flex-col gap-3">
              <button
                onClick={() => applyDraft({ startMs: currentTimeMs, startText: msToTimestamp(currentTimeMs) })}
                className="border border-black px-4 py-3 text-xs font-bold uppercase hover:bg-black hover:text-white transition-colors"
              >
                Mark In From Playhead
              </button>
              <button
                onClick={() =>
                  applyDraft({
                    endMs: currentTimeMs,
                    endText: msToTimestamp(currentTimeMs),
                  })
                }
                className="border border-black px-4 py-3 text-xs font-bold uppercase hover:bg-black hover:text-white transition-colors"
              >
                Mark Out From Playhead
              </button>
              <button
                onClick={handlePreview}
                className="border border-black px-4 py-3 text-xs font-bold uppercase bg-black text-white hover:bg-[#FF3366] hover:border-[#FF3366] transition-colors"
              >
                {isPlaying && currentTrack?.trackId === selectedTrack.trackId ? "Preview Playing" : "Preview Clip"}
              </button>
              <button
                onClick={handleAutoEdit}
                className="border border-black px-4 py-3 text-xs font-bold uppercase hover:bg-[#ffe7ee] transition-colors"
              >
                Auto Suggest
              </button>
            </div>

            <div className="p-6 flex flex-col gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="border border-black px-4 py-3 text-xs font-bold uppercase bg-[#FF3366] text-white hover:bg-black disabled:opacity-40 transition-colors"
              >
                {isSaving ? "Saving..." : selectedClip ? "Update Clip" : "Save Clip"}
              </button>
              <button
                onClick={() => {
                  setSelectedClipId(null);
                  setDraft(buildDraft());
                  setMessage("New clip draft ready.");
                  setError(null);
                }}
                className="border border-black px-4 py-3 text-xs font-bold uppercase hover:bg-black hover:text-white transition-colors"
              >
                New Clip Draft
              </button>
              <button
                onClick={handleDelete}
                disabled={!selectedClip || isSaving}
                className="border border-black px-4 py-3 text-xs font-bold uppercase hover:bg-black hover:text-white disabled:opacity-30 transition-colors"
              >
                Delete Clip
              </button>
            </div>

            <div className="mt-auto border-t border-black p-4 text-xs uppercase bg-[#F4F4F0] min-h-[74px]">
              {error ? (
                <span className="text-[#9e143a]">{error}</span>
              ) : message ? (
                <span className="text-[#0f6d4e]">{message}</span>
              ) : (
                "Editor ready"
              )}
            </div>
          </aside>
        </main>
      </div>

      <RevampPlaybackBar />
    </div>
  );
}

export default function SurgeryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#F4F4F0] font-mono uppercase">
          Loading editor...
        </div>
      }
    >
      <SurgeryPageContent />
    </Suspense>
  );
}
