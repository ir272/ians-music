import type {
  Track,
  Clip,
  Playlist,
  PlaylistWithItems,
  PlaylistItem,
  ResolveResponse,
  BatchResolveResponse,
  TrackMixSettings,
  TrackMediaStatus,
  TrackPlayback,
} from "@/types";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const errorJson = await res
        .json()
        .catch(() => ({ detail: `Request failed with status ${res.status}` }));
      const message =
        typeof errorJson?.detail === "string"
          ? errorJson.detail
          : typeof errorJson?.message === "string"
            ? errorJson.message
            : `Request failed with status ${res.status}`;
      throw new ApiError(message, res.status);
    }

    const errorBody = await res.text().catch(() => "");
    const normalized = errorBody.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const fallbackMessage =
      res.status >= 500
        ? "OpenMusic backend error. The hosted API may be unavailable or waking up."
        : `Request failed with status ${res.status}`;
    throw new ApiError(normalized || fallbackMessage, res.status);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export async function getTracks(): Promise<Track[]> {
  return request<Track[]>("/api/tracks");
}

export async function getAllClips(): Promise<Clip[]> {
  return request<Clip[]>("/api/clips");
}

export async function deleteTrack(trackId: string): Promise<void> {
  await request<void>(`/api/tracks/${trackId}`, { method: "DELETE" });
}

export async function reorderTracks(
  items: { id: string; position: number }[]
): Promise<void> {
  await request<void>("/api/tracks/reorder", {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
}

export async function deletePlaylist(id: string): Promise<void> {
  await request<void>(`/api/playlists/${id}`, { method: "DELETE" });
}

export async function resolveTrack(url: string): Promise<ResolveResponse | BatchResolveResponse> {
  return request<ResolveResponse | BatchResolveResponse>("/api/resolve", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function isBatchResponse(
  response: ResolveResponse | BatchResolveResponse
): response is BatchResolveResponse {
  return "tracks" in response && Array.isArray((response as BatchResolveResponse).tracks);
}

export function getAudioUrl(trackId: string): string {
  return `/api/audio/${trackId}`;
}

export async function createClip(data: {
  trackId: string;
  label: string;
  startMs: number;
  endMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}): Promise<Clip> {
  return request<Clip>("/api/clips", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getClips(trackId: string): Promise<Clip[]> {
  return request<Clip[]>(`/api/clips?trackId=${encodeURIComponent(trackId)}`);
}

export async function updateClip(
  id: string,
  data: {
    label?: string;
    startMs?: number;
    endMs?: number;
    fadeInMs?: number;
    fadeOutMs?: number;
  }
): Promise<Clip> {
  return request<Clip>(`/api/clips/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getTrackMixSettings(trackId: string): Promise<TrackMixSettings> {
  return request<TrackMixSettings>(`/api/tracks/${trackId}/mix-settings`);
}

export async function getTrackMediaStatus(trackId: string): Promise<TrackMediaStatus> {
  return request<TrackMediaStatus>(`/api/tracks/${trackId}/media`);
}

export async function getTrackPlayback(trackId: string): Promise<TrackPlayback> {
  return request<TrackPlayback>(`/api/tracks/${trackId}/playback`);
}

export async function prepareTrack(trackId: string): Promise<TrackMediaStatus> {
  return request<TrackMediaStatus>(`/api/tracks/${trackId}/prepare`, {
    method: "POST",
  });
}

export async function updateTrackMixSettings(
  trackId: string,
  data: {
    playbackRate?: number;
    gain?: number;
  }
): Promise<TrackMixSettings> {
  return request<TrackMixSettings>(`/api/tracks/${trackId}/mix-settings`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteClip(id: string): Promise<void> {
  await request<void>(`/api/clips/${id}`, { method: "DELETE" });
}

export async function createPlaylist(data: {
  name: string;
  description?: string;
}): Promise<Playlist> {
  return request<Playlist>("/api/playlists", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getPlaylists(): Promise<Playlist[]> {
  return request<Playlist[]>("/api/playlists");
}

export async function getPlaylist(id: string): Promise<PlaylistWithItems> {
  return request<PlaylistWithItems>(`/api/playlists/${id}`);
}

export async function addPlaylistItem(
  playlistId: string,
  data: { trackId: string; clipId?: string }
): Promise<PlaylistItem> {
  return request<PlaylistItem>(
    `/api/playlists/${playlistId}/items`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function reorderPlaylistItems(
  playlistId: string,
  items: { id: string; position: number }[]
): Promise<void> {
  await request<void>(`/api/playlists/${playlistId}/items`, {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
}

export async function removePlaylistItem(
  playlistId: string,
  itemId: string
): Promise<void> {
  await request<void>(`/api/playlists/${playlistId}/items/${itemId}`, {
    method: "DELETE",
  });
}

export interface CookieStatus {
  is_set: boolean;
  updated_at: string | null;
  size_bytes: number;
}

export async function getCookieStatus(): Promise<CookieStatus> {
  return request<CookieStatus>("/api/settings/cookies");
}

export async function uploadCookieFile(file: File): Promise<{ ok: boolean }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/settings/cookies", { method: "POST", body: form });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(json?.detail ?? `Upload failed (${res.status})`, res.status);
  }
  return res.json();
}

export async function deleteCookieFile(): Promise<void> {
  await request<void>("/api/settings/cookies", { method: "DELETE" });
}
