import type { Song } from './music-api';

const CATALOG_STORAGE_KEY = 'wavr:catalog';

export interface CatalogCache {
  songs: Song[];
  genres: string[];
  artists: string[];
  savedAt: number;
}

export function loadCachedCatalog(): CatalogCache | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CatalogCache>;
    if (!parsed || !Array.isArray(parsed.songs) || !Array.isArray(parsed.genres) || !Array.isArray(parsed.artists)) return null;
    return parsed as CatalogCache;
  } catch {
    return null;
  }
}

export function saveCachedCatalog(songs: Song[], genres: string[], artists: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const cache: CatalogCache = { songs, genres, artists, savedAt: Date.now() };
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage full or unavailable; ignore
  }
}
