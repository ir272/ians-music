"use client";

import { useState, useCallback } from "react";
import { MusicNotes, DotsSixVertical } from "@phosphor-icons/react";
import { TrackCard, TrackCardSkeleton } from "@/components/TrackCard";
import type { Track } from "@/types";

interface TrackLibraryProps {
  tracks: Track[];
  isLoading: boolean;
  onCreateClip: (track: Track) => void;
  onDeleteTrack: (track: Track) => void;
  onReorder: (reordered: Track[]) => void;
}

export function TrackLibrary({
  tracks,
  isLoading,
  onCreateClip,
  onDeleteTrack,
  onReorder,
}: TrackLibraryProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === targetIndex) return;

      const reordered = [...tracks];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      setDragIndex(targetIndex);
      onReorder(reordered);
    },
    [dragIndex, tracks, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  if (isLoading) {
    return (
      <section aria-label="Track library loading">
        <h2 className="text-lg font-semibold tracking-tighter text-zinc-100 mb-4">
          Library
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TrackCardSkeleton />
          <TrackCardSkeleton />
          <TrackCardSkeleton />
        </div>
      </section>
    );
  }

  if (tracks.length === 0) {
    return (
      <section aria-label="Track library empty">
        <h2 className="text-lg font-semibold tracking-tighter text-zinc-100 mb-4">
          Library
        </h2>
        <div className="border border-dashed border-zinc-800 rounded-xl px-8 py-16 flex flex-col items-center gap-3">
          <MusicNotes size={40} className="text-zinc-700" />
          <p className="text-sm text-zinc-500 text-center max-w-[45ch]">
            Your library is empty. Paste a URL above to add your first track.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Track library">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold tracking-tighter text-zinc-100">
          Library
        </h2>
        <span className="text-xs font-mono text-zinc-600">
          {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
        </span>
        <span className="text-[10px] text-zinc-700 ml-1">· drag to reorder</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tracks.map((track, index) => (
          <div
            key={track.trackId}
            className={`relative group/drag transition-opacity duration-150 ${
              dragIndex === index ? "opacity-40" : ""
            }`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
          >
            {/* Drag handle — top-left, visible on hover */}
            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/drag:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-zinc-400 bg-zinc-900/80 rounded p-0.5">
              <DotsSixVertical size={16} />
            </div>
            <TrackCard
              track={track}
              onCreateClip={onCreateClip}
              onDeleteTrack={onDeleteTrack}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
