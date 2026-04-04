"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getAllClips, getPlaylist, getTracks } from "@/lib/api";
import { PlaylistDetailView } from "@/components/PlaylistDetailView";
import { PlaylistRail } from "@/components/PlaylistRail";
import { RevampPlaybackBar } from "@/components/RevampPlaybackBar";
import type { Clip, Track } from "@/types";

export default function PlaylistPage() {
  const params = useParams<{ playlistId: string }>();
  const playlistId = params?.playlistId ?? "";
  const [playlistName, setPlaylistName] = useState("Playlist");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!playlistId) return;
    Promise.all([getPlaylist(playlistId), getTracks(), getAllClips()])
      .then(([playlist, loadedTracks, loadedClips]) => {
        setPlaylistName(playlist.name);
        setTracks(loadedTracks);
        setClips(loadedClips);
      })
      .finally(() => setIsLoading(false));
  }, [playlistId]);

  return (
    <div className="min-h-screen bg-[#0c0c0f] text-white flex flex-col">
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-h-0 flex flex-col">
          <header className="h-16 border-b border-white/10 px-8 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 text-white/90 hover:text-white">
              <span className="material-symbols-outlined">arrow_back</span>
              <span className="font-semibold tracking-tight">OpenMusic</span>
            </Link>
            <Link href="/" className="text-sm text-white/60 hover:text-white">
              Archive
            </Link>
          </header>

          <main className="flex-1 min-h-0 overflow-auto px-8 py-8">
            {isLoading ? (
              <div className="text-sm text-white/50">Loading playlist...</div>
            ) : (
              <PlaylistDetailView
                playlistId={playlistId}
                playlistName={playlistName}
                tracks={tracks}
                clips={clips}
              />
            )}
          </main>
        </div>

        <PlaylistRail activePlaylistId={playlistId} compact />
      </div>

      <RevampPlaybackBar />
    </div>
  );
}
