export interface Track {
  trackId: string;
  title: string;
  artist: string;
  durationMs: number;
  thumbnailUrl: string;
  platform: string;
  sourceCredit?: string | null;
  matchedSourceUrl?: string | null;
  matchConfidence?: number | null;
  createdAt?: string | null;
}

export interface Clip {
  id: string;
  trackId: string;
  label: string;
  startMs: number;
  endMs: number | null;
  fadeInMs: number;
  fadeOutMs: number;
  createdAt?: string | null;
}

export interface TrackMixSettings {
  trackId: string;
  playbackRate: number;
  gain: number;
  updatedAt?: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface PlaylistItem {
  id: string;
  playlistId: string;
  trackId: string;
  clipId: string | null;
  position: number;
  track: Track;
  clip: Clip | null;
}

export interface PlaylistWithItems extends Playlist {
  items: PlaylistItem[];
}

export interface ResolveResponse {
  trackId: string;
  title: string;
  artist: string;
  durationMs: number;
  thumbnailUrl: string;
  platform: string;
  matchedSourceUrl?: string | null;
  matchConfidence?: number | null;
  alreadyExists?: boolean;
}

export interface ResolveCollection {
  type: "album" | "playlist";
  platform: string;
  name: string;
  sourceUrl: string;
}

export interface BatchResolveResponse {
  tracks: ResolveResponse[];
  failed: string[];
  collection?: ResolveCollection | null;
}

export interface PlayerState {
  currentTrack: Track | null;
  currentClip: Clip | null;
  playlist: PlaylistItem[];
  currentIndex: number;
  isPlaying: boolean;
  currentTimeMs: number;
  loopMode: "none" | "track" | "playlist";
}
