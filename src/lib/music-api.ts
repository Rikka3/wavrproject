import { isFirebaseConfigured } from './firebase-config';
import { useAuthStore } from '@/store/auth-store';

const PORT = 'XTransformPort=3003';
const BASE_URL = (process.env.NEXT_PUBLIC_MUSIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:3003';

export interface Song {
  id: string; title: string; artist: string; album: string;
  year: number; genre: string; song_type: string; duration: number;
  file_path: string; file_name: string; artwork_url: string; artwork_path: string;
  bitrate: number; sample_rate: number; file_size: number; created_at: string;
  position?: number; added_to_playlist_at?: string;
  is_favorite?: number; user_id?: string; duplicate?: boolean;
}

export interface SongListResponse { songs: Song[]; total: number; page?: number; limit?: number; }

export interface Playlist {
  id: string; name: string; description: string;
  created_at: string; updated_at: string; song_count: number;
  user_id?: string;
  is_public?: number;
  owner_name?: string;
  songs?: Song[];
}

function apiUrl(path: string, params?: Record<string, string>): string {
  const qs = new URLSearchParams(PORT);
  if (params) { for (const [k, v] of Object.entries(params)) { if (v) qs.set(k, v); } }
  return `${BASE_URL}${path}?${qs.toString()}`;
}

async function getAuthToken(): Promise<string> {
  if (!isFirebaseConfigured) return '';
  try {
    const user = useAuthStore.getState().user;
    if (!user) return '';
    // Use cached token from Firebase auth
    const { getFirebaseAuth } = await import('./firebase-app');
    const auth = await getFirebaseAuth();
    if (!auth?.currentUser) return '';
    const token = await auth.currentUser.getIdToken();
    return token || '';
  } catch {
    return '';
  }
}

async function apiFetch<T>(path: string, options?: RequestInit, params?: Record<string, string>, adminCode?: string): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (adminCode) headers['X-Admin-Code'] = adminCode;
  // Don't set Content-Type for FormData (browser sets boundary automatically)
  if (!(options?.body instanceof FormData) && options?.body) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const finalParams: Record<string, string> = { ...(params || {}) };
  if (adminCode) finalParams['admin_code'] = adminCode;
  const res = await fetch(apiUrl(path, finalParams), { ...options, headers });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Request failed' })); throw new Error(err.error || `HTTP ${res.status}`); }
  return res.json();
}

// ===== Song API =====

export async function fetchSongs(q?: string, genre?: string): Promise<SongListResponse> {
  return apiFetch<SongListResponse>('/songs', undefined, { q: q || '', genre: genre || '' });
}

export async function fetchSong(id: string): Promise<Song> {
  return apiFetch<Song>(`/songs/${id}`);
}

export async function deleteSong(id: string): Promise<void> {
  await apiFetch(`/songs/${id}`, { method: 'DELETE' });
}

export async function adminDeleteSong(id: string, adminCode: string): Promise<void> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['X-Admin-Code'] = adminCode;
  const qs = new URLSearchParams(PORT);
  qs.set('admin_code', adminCode);
  const res = await fetch(`${BASE_URL}/songs/${id}/admin-delete?${qs.toString()}`, { method: 'DELETE', headers });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Failed' })); throw new Error(err.error || `HTTP ${res.status}`); }
}

export async function fetchGenres(): Promise<string[]> {
  const res = await apiFetch<{ genres: string[] }>('/genres');
  return res.genres;
}

export async function fetchArtists(): Promise<string[]> {
  const res = await apiFetch<{ artists: string[] }>('/artists');
  return res.artists;
}

export async function uploadSong(file: File): Promise<Song> {
  return uploadSongWithProgress(file);
}

export function uploadSongWithProgress(file: File, onProgress?: (percent: number) => void): Promise<Song> {
  return (async () => {
    const token = await getAuthToken();
    return new Promise<Song>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl('/upload'));
      xhr.responseType = 'json';
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
        };
      }
      xhr.onload = () => {
        const body = xhr.response;
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as Song);
        else reject(new Error((body && body.error) || `HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));
      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  })();
}

export async function batchUploadSongs(files: File[]): Promise<{ songs: any[]; added: number; duplicates: number }> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const formData = new FormData();
  for (const file of files) formData.append('files', file);
  const res = await fetch(apiUrl('/upload/batch'), { method: 'POST', body: formData, headers });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Batch upload failed' })); throw new Error(err.error || `HTTP ${res.status}`); }
  return res.json();
}

export function getStreamUrl(id: string): string {
  return apiUrl(`/stream/${id}`);
}

export function getArtworkUrl(id: string, artworkPath: string = ''): string {
  const v = artworkPath ? encodeURIComponent(artworkPath.split(/[\\/]/).pop() || '') : '';
  return apiUrl(`/artwork/${id}?v=${v}`);
}

// ===== Playlist API =====

export async function fetchPlaylists(): Promise<Playlist[]> {
  const res = await apiFetch<{ playlists: Playlist[] }>('/playlists');
  return res.playlists;
}

export async function fetchPlaylist(id: string): Promise<Playlist> {
  return apiFetch<Playlist>(`/playlists/${id}`);
}

export async function createPlaylist(name: string, description?: string, songIds?: string[], isPublic = false): Promise<Playlist> {
  return apiFetch<Playlist>('/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: description || '', song_ids: songIds || [], is_public: isPublic ? 1 : 0 }),
  });
}

export async function updatePlaylist(id: string, updates: { name?: string; description?: string; is_public?: number }, adminCode?: string): Promise<Playlist> {
  return apiFetch<Playlist>(`/playlists/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  }, undefined, adminCode);
}

export async function deletePlaylist(id: string, adminCode?: string): Promise<void> {
  await apiFetch(`/playlists/${id}`, { method: 'DELETE' }, undefined, adminCode);
}

export async function addSongToPlaylist(playlistId: string, songId: string, adminCode?: string): Promise<void> {
  await apiFetch(`/playlists/${playlistId}/songs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song_id: songId }),
  }, undefined, adminCode);
}

export async function batchAddSongsToPlaylist(playlistId: string, songIds: string[], adminCode?: string): Promise<void> {
  await apiFetch(`/playlists/${playlistId}/songs/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song_ids: songIds }),
  }, undefined, adminCode);
}

export async function removeSongFromPlaylist(playlistId: string, songId: string, adminCode?: string): Promise<void> {
  await apiFetch(`/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' }, undefined, adminCode);
}

// ===== Lyrics API =====

export async function fetchLyrics(songId: string): Promise<{ syncedLyrics: string; plainLyrics: string }> {
  return apiFetch<{ syncedLyrics: string; plainLyrics: string }>(`/songs/${songId}/lyrics`);
}

// ===== Favorite API =====

export async function toggleFavorite(songId: string): Promise<{ is_favorite: boolean }> {
  return apiFetch<{ is_favorite: boolean }>(`/songs/${songId}/favorite`, { method: 'PUT' });
}

export async function fetchFavorites(): Promise<SongListResponse> {
  return apiFetch<SongListResponse>('/songs/favorites');
}

// ===== Library Rescan =====

export async function rescanLibrary(): Promise<{ added: number; scanned: number; skipped: number; duplicates: number; total: number }> {
  return apiFetch<{ added: number; scanned: number; skipped: number; duplicates: number; total: number }>('/library/rescan', { method: 'POST' });
}

// ===== Dedup API =====

export async function fetchDuplicates(): Promise<{ duplicates: Array<{ id: string; title: string; artist: string }>; count: number }> {
  return apiFetch('/songs/dedup');
}

export async function deleteDuplicates(): Promise<{ deleted: number; remaining: number }> {
  return apiFetch('/songs/dedup', { method: 'POST' });
}

// ===== Utility =====

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
