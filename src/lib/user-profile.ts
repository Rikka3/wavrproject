import type { Song } from '@/lib/music-api';

export const PROFILE_VERSION = 1;
export const PROFILE_MIN_PLAYS = 3;
export const PROFILE_MAX_RECENT = 50;
export const PROFILE_DECAY = 0.9;
export const PROFILE_PRUNE = 0.5;
export const MIX_CAP = 20;
export const MIX_MIN_SONGS = 3;
export const MIX_MAX_PLAYLISTS = 6;

export interface UserProfile {
  v: number;
  song: Record<string, number>;
  genre: Record<string, number>;
  artist: Record<string, number>;
  type: Record<string, number>;
  recent: string[];
  plays: number;
  updatedAt: number;
}

export interface ForYouPlaylist {
  id: string;
  name: string;
  description: string;
  songs: Song[];
}

function emptyProfile(): UserProfile {
  return { v: PROFILE_VERSION, song: {}, genre: {}, artist: {}, type: {}, recent: [], plays: 0, updatedAt: 0 };
}

function profileKey(uid?: string | null): string {
  return `wavr:profile:${uid || 'anon'}`;
}

function normKey(v: string | undefined | null): string {
  return (v || '').trim().toLowerCase();
}

function decode(song: Song): { key: string; genre: string; artist: string; type: string } {
  return {
    key: song.id,
    genre: normKey(song.genre),
    artist: normKey(song.artist),
    type: normKey(song.song_type),
  };
}

export function loadProfile(uid?: string | null): UserProfile {
  if (typeof localStorage === 'undefined') return emptyProfile();
  try {
    const raw = localStorage.getItem(profileKey(uid));
    if (!raw) return emptyProfile();
    const p = JSON.parse(raw) as Partial<UserProfile>;
    if (p?.v !== PROFILE_VERSION) return emptyProfile();
    return {
      v: PROFILE_VERSION,
      song: p.song || {},
      genre: p.genre || {},
      artist: p.artist || {},
      type: p.type || {},
      recent: Array.isArray(p.recent) ? p.recent.slice(0, PROFILE_MAX_RECENT) : [],
      plays: typeof p.plays === 'number' ? p.plays : 0,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    };
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(profile: UserProfile, uid?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(profileKey(uid), JSON.stringify(profile));
  } catch {
    // storage full or unavailable; ignore
  }
}

function decayMap(map: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    const w = v * PROFILE_DECAY;
    if (w >= PROFILE_PRUNE) next[k] = w;
  }
  return next;
}

function bump(map: Record<string, number>, key: string): Record<string, number> {
  if (!key) return map;
  return { ...map, [key]: (map[key] || 0) + 1 };
}

export function recordListen(song: Song | null | undefined, uid?: string | null): void {
  if (!song?.id) return;
  const p = loadProfile(uid);
  const d = decode(song);
  const next: UserProfile = {
    v: PROFILE_VERSION,
    song: bump(decayMap(p.song), d.key),
    genre: bump(decayMap(p.genre), d.genre),
    artist: bump(decayMap(p.artist), d.artist),
    type: bump(decayMap(p.type), d.type),
    recent: [d.key, ...p.recent.filter(id => id !== d.key)].slice(0, PROFILE_MAX_RECENT),
    plays: p.plays + 1,
    updatedAt: Date.now(),
  };
  saveProfile(next, uid);
}

export function hasData(profile: UserProfile): boolean {
  return profile.plays >= PROFILE_MIN_PLAYS;
}

function share(map: Record<string, number>, key: string): number {
  if (!key) return 0;
  let total = 0;
  for (const v of Object.values(map)) total += v;
  if (total <= 0) return 0;
  return (map[key] || 0) / total;
}

export function affinityScore(song: Song, profile: UserProfile): number {
  const d = decode(song);
  return (
    share(profile.genre, d.genre) * 30 +
    share(profile.artist, d.artist) * 40 +
    share(profile.type, d.type) * 10
  );
}

export function playScore(song: Song, profile: UserProfile): number {
  return profile.song[song.id] || 0;
}

export function isPlayed(song: Song, profile: UserProfile): boolean {
  return (profile.song[song.id] || 0) > 0;
}

function topKeys(map: Record<string, number>, n: number): string[] {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pick(songs: Song[], scoreFn: (s: Song) => number, cap: number, seed: number): Song[] {
  const ranked = songs
    .map(s => ({ s, score: scoreFn(s) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.s);
  return seededShuffle(ranked.slice(0, cap * 2), seed).slice(0, cap);
}

export function generateForYouPlaylists(
  songs: Song[],
  profile: UserProfile,
  now: number = Date.now()
): ForYouPlaylist[] | null {
  if (!hasData(profile) || songs.length < 4) return null;
  const recent = new Set(profile.recent);
  const seed = Math.floor(now / 86400000);
  const list: ForYouPlaylist[] = [];

  const onRepeat = pick(
    songs,
    s => (recent.has(s.id) ? 0 : playScore(s, profile) + affinityScore(s, profile) * 0.5),
    MIX_CAP,
    seed
  );
  if (onRepeat.length >= MIX_MIN_SONGS) {
    list.push({ id: 'foryou:on-repeat', name: 'ON REPEAT', description: 'YOUR MOST PLAYED TRACKS', songs: onRepeat });
  }

  const topGenres = topKeys(profile.genre, 3);
  topGenres.forEach((g, i) => {
    const pool = songs.filter(s => normKey(s.genre) === g);
    const label = pool[0]?.genre || g;
    const mix = pick(pool, s => playScore(s, profile) + affinityScore(s, profile), MIX_CAP, seed + i);
    if (mix.length >= MIX_MIN_SONGS) {
      list.push({ id: `foryou:mix-${i}`, name: `DAILY MIX ${i + 1}`, description: `MIXED FOR YOU // ${label.toUpperCase()}`, songs: mix });
    }
  });

  const topArtists = topKeys(profile.artist, 2);
  topArtists.forEach((a, i) => {
    const pool = songs.filter(s => normKey(s.artist) === a);
    const label = pool[0]?.artist || a;
    const mix = pick(pool, s => playScore(s, profile) + affinityScore(s, profile), MIX_CAP, seed + 10 + i);
    if (mix.length >= MIX_MIN_SONGS) {
      list.push({ id: `foryou:artist-${i}`, name: 'ARTIST MIX', description: `${label.toUpperCase()} // YOUR TOP PICKS`, songs: mix });
    }
  });

  const adjacentGenres = new Set(topKeys(profile.genre, 5));
  const discovery = pick(
    songs,
    s => {
      if (isPlayed(s, profile) || recent.has(s.id)) return 0;
      if (!adjacentGenres.has(normKey(s.genre))) return 0;
      return share(profile.genre, normKey(s.genre)) * 30 + share(profile.type, normKey(s.song_type)) * 10;
    },
    MIX_CAP,
    seed + 100
  );
  if (discovery.length >= MIX_MIN_SONGS) {
    list.push({ id: 'foryou:discovery', name: 'DISCOVERY WEEKLY', description: 'NEW TRACKS FOR YOU', songs: discovery });
  }

  return list.slice(0, MIX_MAX_PLAYLISTS);
}
