import type { Song } from '@/lib/music-api';

const WEIGHTS = {
  songType: 30,
  genre: 20,
  artist: 15,
  album: 10,
  year: 10,
  duration: 10,
  bitrate: 5,
} as const;

function normEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function proximity(a: number, b: number, span: number): number {
  if (!a || !b) return 0;
  return Math.max(0, 1 - Math.abs(a - b) / span);
}

export function similarityScore(a: Song, b: Song): number {
  let score = 0;
  if (a.song_type && a.song_type === b.song_type) score += WEIGHTS.songType;
  if (normEqual(a.genre, b.genre)) score += WEIGHTS.genre;
  if (normEqual(a.artist, b.artist)) score += WEIGHTS.artist;
  if (normEqual(a.album, b.album)) score += WEIGHTS.album;
  score += WEIGHTS.year * proximity(a.year, b.year, 10);
  score += WEIGHTS.duration * proximity(a.duration, b.duration, Math.max(a.duration, b.duration));
  if (a.bitrate > 0 && b.bitrate > 0) {
    score += WEIGHTS.bitrate * proximity(a.bitrate, b.bitrate, Math.max(a.bitrate, b.bitrate));
  }
  return score;
}

export function pickNextSimilar(
  current: Song,
  candidates: Song[],
  excludeIds?: ReadonlySet<string>
): Song | null {
  if (!candidates.length) return null;
  const scored = candidates
    .filter(s => s.id !== current.id && !excludeIds?.has(s.id))
    .map(s => ({ song: s, score: similarityScore(current, s) }))
    .sort((x, y) => y.score - x.score);
  if (!scored.length) return null;
  if (scored.length === 1 || scored[1].score === 0) return scored[0].song;
  const roll = Math.random();
  if (roll < 0.6 || scored.length === 2) return scored[0].song;
  if (roll < 0.9) return scored[1].song;
  return scored[2].song;
}
