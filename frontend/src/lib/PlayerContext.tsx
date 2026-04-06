"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import type { Track, Clip, PlaylistItem } from "@/types";
import { getTrackMediaStatus, getTrackPlayback, prepareTrack } from "@/lib/api";

type LoopMode = "none" | "track" | "playlist";

interface PlayerContextValue {
  currentTrack: Track | null;
  currentClip: Clip | null;
  playlist: PlaylistItem[];
  currentIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTimeMs: number;
  durationMs: number;
  loopMode: LoopMode;
  volume: number;
  trackGain: number;
  playbackRate: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playTrack: (track: Track, clip?: Clip | null) => void;
  playPlaylist: (items: PlaylistItem[], startIndex?: number) => void;
  enqueueTrack: (track: Track, clip?: Clip | null) => void;
  togglePlay: () => void;
  pause: () => void;
  seek: (timeMs: number) => void;
  next: () => void;
  prev: () => void;
  setLoopMode: (mode: LoopMode) => void;
  setCurrentTimeMs: (ms: number) => void;
  setVolume: (volume: number) => void;
  setTrackGain: (gain: number) => void;
  setPlaybackRate: (rate: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayerContext(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayerContext must be used within PlayerProvider");
  }
  return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const PREPARE_POLL_ATTEMPTS = 20;
  const PREPARE_POLL_INTERVAL_MS = 1500;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentClip, setCurrentClip] = useState<Clip | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [loopMode, setLoopMode] = useState<LoopMode>("none");
  const [volume, setVolumeState] = useState(0.74);
  const [trackGain, setTrackGainState] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);

  const clipRef = useRef<Clip | null>(null);
  const loopModeRef = useRef<LoopMode>("none");
  const playlistRef = useRef<PlaylistItem[]>([]);
  const currentIndexRef = useRef<number>(-1);

  useEffect(() => {
    clipRef.current = currentClip;
  }, [currentClip]);

  useEffect(() => {
    loopModeRef.current = loopMode;
  }, [loopMode]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, volume * trackGain));
  }, [trackGain, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  // Keep a ref to any pending canplay handler so we can clean it up
  const pendingCanPlayRef = useRef<(() => void) | null>(null);

  const reportPlaybackFailure = useCallback(async (track: Track | null) => {
    if (!track) return;

    try {
      const media = await getTrackMediaStatus(track.trackId);
      window.dispatchEvent(
        new CustomEvent("openmusic:track-media-status", {
          detail: media,
        })
      );
      if (media.lastMediaError) {
        window.dispatchEvent(
          new CustomEvent("openmusic:playback-error", {
            detail: {
              trackId: track.trackId,
              message: media.lastMediaError,
            },
          })
        );
      }
    } catch {
      window.dispatchEvent(
        new CustomEvent("openmusic:playback-error", {
          detail: {
            trackId: track.trackId,
            message: "Playback failed and media status could not be refreshed.",
          },
        })
      );
    }
  }, []);

  const publishTrackMediaStatus = useCallback(async (trackId: string) => {
    const media = await getTrackMediaStatus(trackId);
    window.dispatchEvent(
      new CustomEvent("openmusic:track-media-status", {
        detail: media,
      })
    );
    return media;
  }, []);

  const waitForPreparedTrack = useCallback(async (track: Track) => {
    let media = await prepareTrack(track.trackId);
    window.dispatchEvent(
      new CustomEvent("openmusic:track-media-status", {
        detail: media,
      })
    );

    if (media.isPlayable || media.mediaState === "ready") {
      return media;
    }

    for (let attempt = 0; attempt < PREPARE_POLL_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, PREPARE_POLL_INTERVAL_MS));
      media = await publishTrackMediaStatus(track.trackId);

      if (media.isPlayable || media.mediaState === "ready") {
        return media;
      }

      if (media.mediaState === "failed") {
        if (media.lastMediaError) {
          window.dispatchEvent(
            new CustomEvent("openmusic:playback-error", {
              detail: {
                trackId: track.trackId,
                message: media.lastMediaError,
              },
            })
          );
        }
        return media;
      }
    }

    window.dispatchEvent(
      new CustomEvent("openmusic:playback-error", {
        detail: {
          trackId: track.trackId,
          message: `Timed out while preparing "${track.title}" for playback.`,
        },
      })
    );
    return media;
  }, [publishTrackMediaStatus]);

  const loadAndPlay = useCallback(
    async (track: Track, clip: Clip | null) => {
      const audio = audioRef.current;
      if (!audio) return;

      // Clean up any previous pending canplay listener
      if (pendingCanPlayRef.current) {
        audio.removeEventListener("canplay", pendingCanPlayRef.current);
        pendingCanPlayRef.current = null;
      }

      setCurrentTrack(track);
      setCurrentClip(clip);
      setDurationMs(track.durationMs);
      setIsBuffering(true);

      if (!track.isPlayable && track.mediaState !== "ready") {
        const media = await waitForPreparedTrack(track);
        if (!media.isPlayable && media.mediaState !== "ready") {
          setIsBuffering(false);
          setIsPlaying(false);
          return;
        }
      } else {
        void publishTrackMediaStatus(track.trackId).catch(() => {
          // Ignore refresh failures here; audio errors are handled by the player itself.
        });
      }

      const playback = await getTrackPlayback(track.trackId);
      if (!playback.isPlayable || !playback.playbackUrl) {
        setIsBuffering(false);
        setIsPlaying(false);
        if (playback.lastMediaError) {
          window.dispatchEvent(
            new CustomEvent("openmusic:playback-error", {
              detail: {
                trackId: track.trackId,
                message: playback.lastMediaError,
              },
            })
          );
        }
        return;
      }

      const url = playback.playbackUrl;

      // audio.src normalizes to absolute after assignment, so compare against
      // the absolute form to avoid unnecessary reloads for the same track.
      const absoluteUrl = window.location.origin + url;
      if (audio.src !== absoluteUrl) {
        audio.src = url;
      }

      const startSec = clip ? clip.startMs / 1000 : 0;

      const startPlayback = () => {
        setIsBuffering(false);
        audio.playbackRate = playbackRate;
        audio.volume = Math.max(0, Math.min(1, volume * trackGain));
        audio.currentTime = startSec;
        audio.play().then(() => {
          setIsPlaying(true);
        }).catch((err) => {
          console.error("Playback failed:", err);
          setIsPlaying(false);
          void reportPlaybackFailure(track);
        });
      };

      if (audio.readyState >= 3) {
        startPlayback();
      } else {
        const onCanPlay = () => {
          audio.removeEventListener("canplay", onCanPlay);
          pendingCanPlayRef.current = null;
          startPlayback();
        };
        pendingCanPlayRef.current = onCanPlay;
        audio.addEventListener("canplay", onCanPlay);
        audio.load();
      }
    },
    [playbackRate, publishTrackMediaStatus, reportPlaybackFailure, trackGain, volume, waitForPreparedTrack]
  );

  const advanceToNext = useCallback(() => {
    const pl = playlistRef.current;
    const idx = currentIndexRef.current;
    const loop = loopModeRef.current;

    if (loop === "track") {
      const clip = clipRef.current;
      const audio = audioRef.current;
      if (audio && clip) {
        audio.currentTime = clip.startMs / 1000;
        audio.play().catch(() => setIsPlaying(false));
      } else if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => setIsPlaying(false));
      }
      return;
    }

    if (pl.length > 0 && idx >= 0) {
      let nextIdx = idx + 1;
      if (nextIdx >= pl.length) {
        if (loop === "playlist") {
          nextIdx = 0;
        } else {
          setIsPlaying(false);
          return;
        }
      }
      setCurrentIndex(nextIdx);
      const item = pl[nextIdx];
      if (item) {
        void loadAndPlay(item.track, item.clip);
      }
    } else {
      setIsPlaying(false);
    }
  }, [loadAndPlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const timeMs = audio.currentTime * 1000;
      setCurrentTimeMs(timeMs);

      const clip = clipRef.current;
      if (clip && clip.endMs !== null && timeMs >= clip.endMs) {
        audio.pause();
        advanceToNext();
      }
    };

    const handleEnded = () => {
      advanceToNext();
    };

    const handleDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDurationMs(audio.duration * 1000);
      }
    };

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleError = () => {
      console.error("Audio error:", audio.error);
      setIsBuffering(false);
      setIsPlaying(false);
      void reportPlaybackFailure(currentTrack);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("error", handleError);
    };
  }, [advanceToNext, currentTrack, reportPlaybackFailure]);

  const playTrack = useCallback(
    (track: Track, clip?: Clip | null) => {
      setPlaylist([]);
      setCurrentIndex(-1);
      void loadAndPlay(track, clip ?? null);
    },
    [loadAndPlay]
  );

  const playPlaylist = useCallback(
    (items: PlaylistItem[], startIndex: number = 0) => {
      setPlaylist(items);
      setCurrentIndex(startIndex);
      const item = items[startIndex];
      if (item) {
        void loadAndPlay(item.track, item.clip);
      }
    },
    [loadAndPlay]
  );

  const enqueueTrack = useCallback(
    (track: Track, clip?: Clip | null) => {
      const queuedItem: PlaylistItem = {
        id: `session-${track.trackId}-${Date.now()}`,
        playlistId: "session",
        trackId: track.trackId,
        clipId: clip?.id ?? null,
        position: 0,
        track,
        clip: clip ?? null,
      };

      setPlaylist((prev) => {
        if (prev.length > 0) {
          return [
            ...prev,
            {
              ...queuedItem,
              position: prev.length,
            },
          ];
        }

        if (currentTrack) {
          return [
            {
              id: `session-${currentTrack.trackId}-current`,
              playlistId: "session",
              trackId: currentTrack.trackId,
              clipId: currentClip?.id ?? null,
              position: 0,
              track: currentTrack,
              clip: currentClip,
            },
            {
              ...queuedItem,
              position: 1,
            },
          ];
        }

        return [queuedItem];
      });

      if (!currentTrack) {
        playTrack(track, clip);
      } else if (playlistRef.current.length === 0 && currentIndexRef.current < 0) {
        setCurrentIndex(0);
      }
    },
    [currentClip, currentTrack, playTrack]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {
        setIsPlaying(false);
        void reportPlaybackFailure(currentTrack);
      });
      setIsPlaying(true);
    }
  }, [currentTrack, isPlaying, reportPlaybackFailure]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }, []);

  const seek = useCallback((timeMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = timeMs / 1000;
    setCurrentTimeMs(timeMs);
  }, []);

  const next = useCallback(() => {
    advanceToNext();
  }, [advanceToNext]);

  const prev = useCallback(() => {
    const pl = playlistRef.current;
    const idx = currentIndexRef.current;

    if (pl.length > 0 && idx > 0) {
      const prevIdx = idx - 1;
      setCurrentIndex(prevIdx);
      const item = pl[prevIdx];
      if (item) {
        void loadAndPlay(item.track, item.clip);
      }
    } else {
      const audio = audioRef.current;
      if (audio) {
        const clip = clipRef.current;
        audio.currentTime = clip ? clip.startMs / 1000 : 0;
      }
    }
  }, [loadAndPlay]);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolumeState(clamped);
  }, []);

  const setTrackGain = useCallback((nextGain: number) => {
    const clamped = Math.max(0, Math.min(2, nextGain));
    setTrackGainState(clamped);
  }, []);

  const setPlaybackRate = useCallback((nextRate: number) => {
    const clamped = Math.max(0.5, Math.min(2, nextRate));
    setPlaybackRateState(clamped);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        currentClip,
        playlist,
        currentIndex,
        isPlaying,
        isBuffering,
        currentTimeMs,
        durationMs,
        loopMode,
        volume,
        trackGain,
        playbackRate,
        audioRef,
        playTrack,
        playPlaylist,
        enqueueTrack,
        togglePlay,
        pause,
        seek,
        next,
        prev,
        setLoopMode,
        setCurrentTimeMs,
        setVolume,
        setTrackGain,
        setPlaybackRate,
      }}
    >
      <audio ref={audioRef} preload="auto" />
      {children}
    </PlayerContext.Provider>
  );
}
