"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPlaylist, getPlaylists } from "@/lib/api";
import type { Playlist } from "@/types";

interface PlaylistRailProps {
  activePlaylistId?: string | null;
  compact?: boolean;
}

export function PlaylistRail({ activePlaylistId = null, compact = false }: PlaylistRailProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const loadPlaylists = useCallback(async () => {
    const loaded = await getPlaylists();
    setPlaylists(loaded);
  }, []);

  useEffect(() => {
    loadPlaylists().catch(() => undefined);
  }, [loadPlaylists]);

  useEffect(() => {
    const handleChanged = () => {
      loadPlaylists().catch(() => undefined);
    };
    window.addEventListener("playlists:changed", handleChanged);
    return () => window.removeEventListener("playlists:changed", handleChanged);
  }, [loadPlaylists]);

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const playlist = await createPlaylist({ name: trimmed });
    setNewName("");
    setIsCreating(false);
    window.dispatchEvent(new Event("playlists:changed"));
    window.location.href = `/playlists/${playlist.id}`;
  }, [newName]);

  return (
    <aside className={`border-l border-black bg-[#0f0f12] text-white ${compact ? "w-[280px]" : "w-[320px]"} shrink-0`}>
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-6">
        <h2 className="text-[14px] font-bold tracking-tight">Playlists</h2>
        <button
          type="button"
          onClick={() => setIsCreating((prev) => !prev)}
          className="text-white/80 hover:text-white text-xl leading-none"
          aria-label="Create playlist"
        >
          +
        </button>
      </div>

      <div className="p-4 space-y-3">
        {isCreating ? (
          <div className="space-y-2">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleCreate().catch(() => undefined);
                }
              }}
              placeholder="Playlist name"
              className="w-full rounded-md border border-white/10 bg-[#1b1b20] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCreate().catch(() => undefined)}
                className="rounded-md bg-[#53b37c] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white disabled:opacity-40"
                disabled={!newName.trim()}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewName("");
                }}
                className="rounded-md border border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/70"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <nav className="space-y-1">
          {playlists.map((playlist) => {
            const active = playlist.id === activePlaylistId;
            return (
              <Link
                key={playlist.id}
                href={`/playlists/${playlist.id}`}
                className={`block rounded-xl px-4 py-3 text-sm transition-colors ${
                  active
                    ? "bg-white/12 text-white"
                    : "text-white/80 hover:bg-white/6 hover:text-white"
                }`}
              >
                {playlist.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
