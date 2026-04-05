"use client";

import Image from "next/image";
import { useCallback, useRef, type MouseEvent } from "react";
import { usePlayerContext } from "@/lib/PlayerContext";

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function RevampPlaybackBar() {
  const {
    currentTrack,
    currentClip,
    isPlaying,
    isBuffering,
    currentTimeMs,
    durationMs,
    volume,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
  } = usePlayerContext();

  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || !currentTrack) return;
      const rect = progressRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seek(ratio * durationMs);
    },
    [currentTrack, durationMs, seek]
  );

  const handleVolume = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!volumeRef.current) return;
      const rect = volumeRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setVolume(ratio);
    },
    [setVolume]
  );

  const progressPct = durationMs > 0 ? Math.min(100, (currentTimeMs / durationMs) * 100) : 0;
  const volumePct = Math.round(volume * 100);
  const title = currentTrack?.title ?? "Nothing playing";
  const subtitle = currentClip?.label ?? currentTrack?.artist ?? "OpenMusic queue idle";

  return (
    <div className="w-full h-[80px] bg-[#18181A] flex flex-col shrink-0 z-50 relative bottom-0">
      <div
        ref={progressRef}
        onClick={handleSeek}
        className="w-full h-[5px] bg-[#2A2A2D] cursor-pointer group absolute top-0"
      >
        <div
          className="h-full bg-primary group-hover:bg-[#ff4d79] transition-colors relative"
          style={{ width: `${progressPct}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2" />
        </div>
      </div>

      <div className="flex-1 flex items-center px-3 sm:px-4 justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 sm:w-1/3 sm:flex-none">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-gray-700 to-gray-900 rounded overflow-hidden flex items-center justify-center shrink-0 border border-white/5 relative group cursor-pointer shadow-md">
            {currentTrack?.thumbnailUrl ? (
              <Image
                fill
                sizes="56px"
                src={currentTrack.thumbnailUrl}
                alt=""
                unoptimized
                className="object-cover"
              />
            ) : (
              <span className="material-symbols-outlined text-white/20 text-3xl">music_note</span>
            )}
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <span className="text-sm font-bold text-white leading-tight truncate">{title}</span>
            <span className="text-xs font-medium text-white/60 leading-tight mt-0.5 truncate">
              {subtitle}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 shrink-0 sm:w-1/3 sm:max-w-[400px]">
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              onClick={prev}
              disabled={!currentTrack}
              className="text-white/70 hover:text-white transition-colors cursor-pointer material-symbols-outlined text-[22px] sm:text-[28px] disabled:opacity-30"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              skip_previous
            </button>
            <button
              onClick={togglePlay}
              disabled={!currentTrack}
              className="w-8 h-8 sm:w-9 sm:h-9 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform cursor-pointer shadow-lg disabled:opacity-30"
            >
              <span
                className={`material-symbols-outlined text-black text-xl sm:text-2xl ${isBuffering ? "animate-pulse" : ""}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
            <button
              onClick={next}
              disabled={!currentTrack}
              className="text-white/70 hover:text-white transition-colors cursor-pointer material-symbols-outlined text-[22px] sm:text-[28px] disabled:opacity-30"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              skip_next
            </button>
          </div>
        </div>

        <div className="hidden sm:flex items-center justify-end gap-4 w-1/3 text-white/50">
          <span className="text-xs font-mono font-medium mx-2">
            {currentTrack
              ? `${formatTime(currentTimeMs)} / ${formatTime(durationMs)}`
              : "--:-- / --:--"}
          </span>
          <div className="flex items-center gap-2 w-24 group">
            <button className="hover:text-white transition-colors cursor-pointer material-symbols-outlined text-[20px] group-hover:text-white">
              volume_up
            </button>
            <div
              ref={volumeRef}
              onClick={handleVolume}
              className="flex-1 h-1.5 bg-[#2A2A2D] rounded-full overflow-hidden cursor-pointer relative"
            >
              <div
                className="absolute top-0 left-0 h-full bg-white group-hover:bg-primary transition-colors"
                style={{ width: `${volumePct}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-mono font-medium w-10 text-right">{volumePct}%</span>
        </div>
      </div>
    </div>
  );
}
