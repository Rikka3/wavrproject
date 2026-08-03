import { Database } from "bun:sqlite";
import { parseBuffer } from "music-metadata";
import { join, extname } from "path";
import { existsSync, mkdirSync, unlinkSync, writeFileSync, statSync, readdirSync, readFileSync } from "fs";
import { randomUUID } from "crypto";

const PORT = 3003;
const BASE_DIR = process.env.SOUNDWAVE_BASE_DIR || "/var/lib/soundwave";
const MUSIC_DIR = join(BASE_DIR, "music");
const ARTWORK_DIR = join(BASE_DIR, "artwork");
const DB_PATH = join(BASE_DIR, "db", "soundwave.db");
const ADMIN_CODE = process.env.SOUNDWAVE_ADMIN_CODE || "";

// Ensure directories exist
for (const dir of [MUSIC_DIR, ARTWORK_DIR, join(BASE_DIR, "db")]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ===== Firebase Admin Init (optional) =====
let authEnabled = false;
let verifyIdToken: ((token: string) => Promise<any>) | null = null;
try {
  const saPath = join(import.meta.dir, "service-account.json");
  if (existsSync(saPath)) {
    const saRaw = readFileSync(saPath, "utf-8");
    const sa = JSON.parse(saRaw);
    if (sa.project_id && !sa.project_id.startsWith("YOUR_")) {
      const { initializeApp, cert } = require("firebase-admin/app");
      const { getAuth } = require("firebase-admin/auth");
      const adminApp = initializeApp({ credential: cert(sa) });
      const adminAuth = getAuth(adminApp);
      verifyIdToken = (token: string) => adminAuth.verifyIdToken(token);
      authEnabled = true;
      console.log("[auth] Firebase Admin initialized");
    } else {
      console.log("[auth] service-account.json not configured — running in single-user mode");
    }
  } else {
    console.log("[auth] No service-account.json — running in single-user mode");
  }
} catch (e) {
  console.error("[auth] Firebase init error:", e);
  console.log("[auth] Running in single-user mode");
}

// ===== Initialize Database =====
const db = new Database(DB_PATH, { create: true });
db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Unknown Title',
    artist TEXT NOT NULL DEFAULT 'Unknown Artist',
    album TEXT DEFAULT '',
    year INTEGER DEFAULT 0,
    genre TEXT DEFAULT '',
    song_type TEXT DEFAULT '',
    duration REAL DEFAULT 0,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    artwork_url TEXT DEFAULT '',
    artwork_path TEXT DEFAULT '',
    bitrate INTEGER DEFAULT 0,
    sample_rate INTEGER DEFAULT 0,
    file_size INTEGER DEFAULT 0,
    lyrics TEXT DEFAULT '',
    is_favorite INTEGER DEFAULT 0,
    user_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
  CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
  CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album);
  CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
  CREATE INDEX IF NOT EXISTS idx_songs_user ON songs(user_id);

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Untitled Playlist',
    description TEXT DEFAULT '',
    user_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (playlist_id, song_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_ps_playlist ON playlist_songs(playlist_id);
  CREATE INDEX IF NOT EXISTS idx_ps_song ON playlist_songs(song_id);
`);

// Schema migrations
try { db.exec(`ALTER TABLE songs ADD COLUMN lyrics TEXT DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE songs ADD COLUMN is_favorite INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE songs ADD COLUMN user_id TEXT DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE playlists ADD COLUMN user_id TEXT DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE playlists ADD COLUMN is_public INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE playlists ADD COLUMN owner_name TEXT DEFAULT ''`); } catch {}

console.log(`[db] Schema ready, auth=${authEnabled}, admin=${ADMIN_CODE ? 'enabled' : 'disabled'}`);

// ===== Prepared Statements (all positional ?) =====
const stmtGetAll = db.prepare(`SELECT * FROM songs WHERE user_id = ? OR user_id = '' ORDER BY created_at DESC`);
const stmtGetAllNoUser = db.prepare(`SELECT * FROM songs ORDER BY created_at DESC`);
const stmtGetById = db.prepare(`SELECT * FROM songs WHERE id = ?`);
const stmtDelete = db.prepare(`DELETE FROM songs WHERE id = ?`);
const stmtSearch = db.prepare(`
  SELECT * FROM songs
  WHERE (title LIKE '%' || ? || '%' OR artist LIKE '%' || ? || '%' OR album LIKE '%' || ? || '%')
  AND (? = '' OR genre = ?)
  AND (user_id = ? OR user_id = '')
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`);
const stmtSearchNoUser = db.prepare(`
  SELECT * FROM songs
  WHERE (title LIKE '%' || ? || '%' OR artist LIKE '%' || ? || '%' OR album LIKE '%' || ? || '%')
  AND (? = '' OR genre = ?)
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`);
const stmtCountSearch = db.prepare(`
  SELECT COUNT(*) as total FROM songs
  WHERE (title LIKE '%' || ? || '%' OR artist LIKE '%' || ? || '%' OR album LIKE '%' || ? || '%')
  AND (? = '' OR genre = ?)
  AND (user_id = ? OR user_id = '')
`);
const stmtCountSearchNoUser = db.prepare(`
  SELECT COUNT(*) as total FROM songs
  WHERE (title LIKE '%' || ? || '%' OR artist LIKE '%' || ? || '%' OR album LIKE '%' || ? || '%')
  AND (? = '' OR genre = ?)
`);
const stmtGetGenres = db.prepare(`SELECT DISTINCT genre FROM songs WHERE genre != '' AND (user_id = ? OR user_id = '') ORDER BY genre`);
const stmtGetGenresNoUser = db.prepare(`SELECT DISTINCT genre FROM songs WHERE genre != '' ORDER BY genre`);
const stmtGetArtists = db.prepare(`SELECT DISTINCT artist FROM songs WHERE (user_id = ? OR user_id = '') ORDER BY artist`);
const stmtGetArtistsNoUser = db.prepare(`SELECT DISTINCT artist FROM songs ORDER BY artist`);

// Duplicate check
const stmtCheckDup = db.prepare(`SELECT id, title, artist FROM songs WHERE user_id = ? OR user_id = ''`);
const stmtFindByPath = db.prepare(`SELECT id FROM songs WHERE file_path = ?`);

// Playlist statements (with user_id filtering)
const stmtPlaylistGetAll = db.prepare(`SELECT p.*, COUNT(ps.song_id) as song_count FROM playlists p LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id WHERE (p.user_id = ? OR p.user_id = '' OR p.is_public = 1) GROUP BY p.id ORDER BY p.updated_at DESC`);
const stmtPlaylistGetAllNoUser = db.prepare(`SELECT p.*, COUNT(ps.song_id) as song_count FROM playlists p LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id WHERE (p.user_id = '' OR p.is_public = 1) GROUP BY p.id ORDER BY p.updated_at DESC`);
const stmtPlaylistGetById = db.prepare(`SELECT * FROM playlists WHERE id = ?`);
const stmtPlaylistCreate = db.prepare(`INSERT INTO playlists (id, name, description, user_id, is_public, owner_name) VALUES (?, ?, ?, ?, ?, ?)`);
const stmtPlaylistUpdate = db.prepare(`UPDATE playlists SET name = ?, description = ?, is_public = ?, updated_at = datetime('now') WHERE id = ?`);
const stmtPlaylistDelete = db.prepare(`DELETE FROM playlists WHERE id = ?`);
const stmtPlaylistDeleteSongs = db.prepare(`DELETE FROM playlist_songs WHERE playlist_id = ?`);
const stmtPlaylistAddSong = db.prepare(`INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position, added_at) VALUES (?, ?, ?, datetime('now'))`);
const stmtPlaylistRemoveSong = db.prepare(`DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?`);
const stmtPlaylistGetSongs = db.prepare(`
  SELECT s.*, ps.position, ps.added_at as added_to_playlist_at
  FROM playlist_songs ps
  JOIN songs s ON ps.song_id = s.id
  WHERE ps.playlist_id = ?
  ORDER BY ps.position ASC, ps.added_at ASC
`);
const stmtPlaylistGetMaxPos = db.prepare(`SELECT COALESCE(MAX(position), -1) as max_pos FROM playlist_songs WHERE playlist_id = ?`);

// Lyrics and favorites
const stmtUpdateLyrics = db.prepare(`UPDATE songs SET lyrics = ? WHERE id = ?`);
const stmtGetLyrics = db.prepare(`SELECT lyrics FROM songs WHERE id = ?`);
const stmtToggleFavorite = db.prepare(`UPDATE songs SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?`);
const stmtGetFavorites = db.prepare(`SELECT * FROM songs WHERE is_favorite = 1 AND (user_id = ? OR user_id = '') ORDER BY created_at DESC`);
const stmtGetFavoritesNoUser = db.prepare(`SELECT * FROM songs WHERE is_favorite = 1 ORDER BY created_at DESC`);
const stmtInsertSong = db.prepare(`INSERT INTO songs (id, title, artist, album, year, genre, song_type, duration, file_path, file_name, artwork_url, artwork_path, bitrate, sample_rate, file_size, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const stmtUpdateSongArtwork = db.prepare(`UPDATE songs SET artwork_url = ?, artwork_path = ?, genre = ? WHERE id = ?`);

// Dedup: find duplicates by normalized title+artist
function normalizeForDup(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function findDuplicates(userId: string): Array<{ id: string; title: string; artist: string; dup_key: string }> {
  const rows = (userId ? stmtCheckDup.all(userId) : db.prepare(`SELECT id, title, artist FROM songs`).all()) as any[];
  const keyMap = new Map<string, any[]>();
  for (const r of rows) {
    const key = normalizeForDup(r.title) + "|" + normalizeForDup(r.artist);
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key)!.push(r);
  }
  const dups: Array<{ id: string; title: string; artist: string; dup_key: string }> = [];
  for (const [key, items] of keyMap) {
    if (items.length > 1) {
      // Keep the first (oldest), mark rest as duplicates
      for (let i = 1; i < items.length; i++) {
        dups.push({ id: items[i].id, title: items[i].title, artist: items[i].artist, dup_key: key });
      }
    }
  }
  return dups;
}

// ===== Helper Functions =====
function deduceSongType(genre: string): string {
  const g = genre.toLowerCase();
  if (['classical', 'orchestral', 'symphony', 'chamber', 'opera', 'concerto'].some(t => g.includes(t))) return 'classical';
  if (['electronic', 'edm', 'techno', 'house', 'trance', 'dubstep', 'dnb', 'drum and bass', 'ambient', 'synthwave', 'synth', 'chillstep'].some(t => g.includes(t))) return 'electronic';
  if (['acoustic', 'folk', 'country', 'bluegrass', 'singer-songwriter', 'unplugged'].some(t => g.includes(t))) return 'acoustic';
  if (['instrumental', 'jazz', 'blues', 'new age', 'lo-fi', 'lofi', 'study', 'background'].some(t => g.includes(t))) return 'instrumental';
  if (['rock', 'metal', 'punk', 'grunge', 'indie', 'alternative', 'emo', 'hardcore'].some(t => g.includes(t))) return 'rock';
  if (['hip hop', 'hip-hop', 'rap', 'trap', 'r&b', 'soul', 'funk', 'groove'].some(t => g.includes(t))) return 'urban';
  if (['pop', 'dance', 'disco', 'k-pop', 'kpop'].some(t => g.includes(t))) return 'pop';
  return 'other';
}

function getMimeType(fileName: string, fileType: string): string {
  const ext = extname(fileName).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.opus': 'audio/opus', '.wma': 'audio/x-ms-wma', '.webm': 'audio/webm',
  };
  if (mimeMap[ext]) return mimeMap[ext];
  if (fileType && fileType.startsWith('audio/')) return fileType;
  return 'audio/mpeg';
}

function extractArtist(common: any): string {
  if (common.artist && common.artist.trim()) return common.artist.trim();
  if (common.artists && Array.isArray(common.artists) && common.artists.length > 0) {
    return common.artists.filter((a: string) => a.trim()).join(', ');
  }
  if (common.albumartist && common.albumartist.trim()) return common.albumartist.trim();
  if (common.performer && common.performer.trim()) return common.performer.trim();
  return '';
}

function extractTitle(common: any, fallbackTitle: string): string {
  if (common.title && common.title.trim()) return common.title.trim();
  if (common.sorttitle && common.sorttitle.trim()) return common.sorttitle.trim();
  return fallbackTitle;
}

function parseFilenameForMetadata(rawName: string): { title: string; artist: string } {
  let name = rawName.replace(/\.[^.]+$/, '').trim();
  const noisePatterns = [
    /^YTDown\.com[_ ]?/i, /^YouTube[_ ]?/i, /YouTube[_ ]/i, /_?YouTube/i,
    /Official\s*(Music\s*)?(Video|Audio|Lyric\s*Video)/i, /\bMedia\b/i, /\bAudio\b/i,
    /\[.*?\]/g, /\(.*?\)/g,
    /_\w{8,}(_\w{4,})?(_\d{3})?(_\d+k)?$/,
    /\s+_\s+/g, /\d{3}\s*k(?:bps)?\s*$/i, /\(\d+\)/, /HD\s*$/i, /4K\s*$/i,
  ];
  for (const pat of noisePatterns) { name = name.replace(pat, ' '); }
  name = name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return { title: rawName, artist: '' };
  const words = name.split(/\s+/);
  const dashIdx = name.indexOf(' - ');
  if (dashIdx > 0 && dashIdx < name.length - 3) {
    return { title: name.substring(dashIdx + 3).trim(), artist: name.substring(0, dashIdx).trim() };
  }
  if (words.length >= 3) {
    const oneWord = { title: words.slice(1).join(' '), artist: words[0] };
    const twoWord = { title: words.slice(2).join(' '), artist: words.slice(0, 2).join(' ') };
    return oneWord.artist.length >= 3 ? oneWord : twoWord;
  }
  if (words.length === 2) return { title: words[1], artist: words[0] };
  return { title: name, artist: '' };
}

const iTunesCache = new Map<string, { data: any; ts: number }>();
const ITUNES_CACHE_TTL = 24 * 60 * 60 * 1000;
const ITUNES_NEGATIVE_TTL = 10 * 60 * 1000;

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchiTunesMetadata(title: string, artist: string): Promise<Partial<{ title: string; artist: string; album: string; genre: string; artworkUrl: string; year: number }>> {
  const cacheKey = `${(title || '').toLowerCase().trim()}|${(artist || '').toLowerCase().trim()}`;
  const cached = iTunesCache.get(cacheKey);
  if (cached) {
    const ttl = Object.keys(cached.data || {}).length ? ITUNES_CACHE_TTL : ITUNES_NEGATIVE_TTL;
    if (Date.now() - cached.ts < ttl) return cached.data;
    iTunesCache.delete(cacheKey);
  }
  try {
    const query = [artist, title].filter(Boolean).join(' ');
    const res = await fetchWithTimeout(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=3`, 4000, {
      headers: { 'User-Agent': 'WAVR/1.0' }
    });
    const data = await res.json() as any;
    if (data.results && data.results.length > 0) {
      const titleLower = title.toLowerCase(); const artistLower = artist.toLowerCase();
      let best = data.results[0];
      for (const r of data.results) {
        const rTitle = (r.trackName || '').toLowerCase(); const rArtist = (r.artistName || '').toLowerCase();
        if (rTitle.includes(titleLower) || titleLower.includes(rTitle)) {
          if (!artist || rArtist.includes(artistLower) || artistLower.includes(rArtist)) { best = r; break; }
        }
      }
      const result = {
        title: best.trackName || undefined, artist: best.artistName || undefined,
        album: best.collectionName || undefined, genre: best.primaryGenreName || undefined,
        artworkUrl: best.artworkUrl100 ? best.artworkUrl100.replace('100x100', '600x600') : undefined,
        year: best.releaseDate ? new Date(best.releaseDate).getFullYear() : undefined,
      };
      iTunesCache.set(cacheKey, { data: result, ts: Date.now() });
      return result;
    }
  } catch (e) { console.error('iTunes API error:', e); }
  iTunesCache.set(cacheKey, { data: {}, ts: Date.now() });
  return {};
}

async function downloadArtwork(url: string, id: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(url, 8000);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const ext = url.includes('.png') ? 'png' : 'jpg';
      const path = join(ARTWORK_DIR, `${id}.${ext}`);
      writeFileSync(path, Buffer.from(buf));
      return path;
    }
  } catch (e) { console.error('Artwork download error:', e); }
  return '';
}

// ===== Auth Middleware =====
async function getUser(req: Request): Promise<{ uid: string; authenticated: boolean; profile: { name?: string; email?: string } | null }> {
  if (!authEnabled) return { uid: '', authenticated: false, profile: null };
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return { uid: '', authenticated: false, profile: null };
  try {
    const token = authHeader.slice(7);
    const decoded = await verifyIdToken!(token);
    return { uid: decoded.uid, authenticated: true, profile: { name: decoded.name, email: decoded.email } };
  } catch (e) {
    console.error('[auth] Token verification failed:', e);
    return { uid: '', authenticated: false, profile: null };
  }
}

function checkAdminCode(req: Request): boolean {
  if (!ADMIN_CODE) return false;
  const url = new URL(req.url);
  const code = url.searchParams.get('admin_code') || req.headers.get('x-admin-code') || '';
  return code === ADMIN_CODE;
}

// ===== File Processing (shared between upload, batch, rescan) =====
async function processAudioFile(fileName: string, fileBuffer: Buffer, filePath: string, userId: string): Promise<{ song: any; duplicate: boolean }> {
  const validExts = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.webm'];
  const ext = extname(fileName).toLowerCase();
  if (!validExts.includes(ext)) throw new Error(`Unsupported format: ${ext}`);

  const id = randomUUID();
  const fallbackTitle = fileName.replace(ext, '').replace(/[-_]/g, ' ').trim() || 'Unknown Title';
  let title = fallbackTitle;
  let artist = '';
  let album = '';
  let year = 0;
  let genre = '';
  let duration = 0;
  let bitrate = 0;
  let sampleRate = 0;
  let artworkPath = '';
  let artworkUrl = '';
  let artworkExt = '';

  const parsedName = parseFilenameForMetadata(fileName);
  console.log(`[upload] ${fileName} mime=${getMimeType(fileName, '')} size=${fileBuffer.length}`);
  if (parsedName.artist) console.log(`[filename] parsed artist="${parsedName.artist}" title="${parsedName.title}"`);

  try {
    const mimeType = getMimeType(fileName, '');
    const metadata = await parseBuffer(fileBuffer, { mimeType });
    const common = metadata.common || {};
    title = extractTitle(common, parsedName.title || fallbackTitle);
    artist = extractArtist(common);
    if (common.album?.trim()) album = common.album.trim();
    if (common.year) year = common.year;
    if (common.genre) genre = Array.isArray(common.genre) ? common.genre[0] : common.genre;
    if (metadata.format.duration) duration = metadata.format.duration;
    if (metadata.format.bitrate) bitrate = Math.round(metadata.format.bitrate / 1000);
    if (metadata.format.sampleRate) sampleRate = metadata.format.sampleRate;
    if (common.picture?.length > 0) {
      const pic = common.picture[0];
      const picExt = pic.format?.includes('png') ? 'png' : 'jpg';
      artworkExt = picExt;
      artworkPath = join(ARTWORK_DIR, `${id}.${picExt}`);
      writeFileSync(artworkPath, pic.data);
    }
  } catch (e) { console.error('[metadata] Error:', e); }

  if (!artist && parsedName.artist) artist = parsedName.artist;
  if (title === fallbackTitle && parsedName.title && parsedName.title !== fallbackTitle) title = parsedName.title;

  const needsFallback = !artist || !album || !genre;
  if (needsFallback) {
    console.log(`[itunes] Fetching for: "${title}" by "${artist}"`);
    const iTunes = await fetchiTunesMetadata(title, artist);
    if (!artist) artist = iTunes.artist || '';
    if (!album) album = iTunes.album || '';
    if (!genre) genre = iTunes.genre || '';
    if (!year && iTunes.year) year = iTunes.year;
    if (!artworkPath && iTunes.artworkUrl) {
      artworkPath = await downloadArtwork(iTunes.artworkUrl, id);
      artworkUrl = iTunes.artworkUrl;
      if (artworkPath) artworkExt = artworkPath.split('.').pop() || 'jpg';
    }
  }

  const songType = deduceSongType(genre);
  const fileSize = fileBuffer.length;
  if (!title) title = 'Unknown Title';
  if (!artist) artist = 'Unknown Artist';

  // Duplicate check
  const existing = (userId ? stmtCheckDup.all(userId) : db.prepare(`SELECT id, title, artist FROM songs`).all()) as any[];
  const newKey = normalizeForDup(title) + '|' + normalizeForDup(artist);
  const isDuplicate = existing.some(e => {
    const eKey = normalizeForDup(e.title) + '|' + normalizeForDup(e.artist);
    return eKey === newKey;
  });

  if (isDuplicate) {
    // Clean up saved audio file
    if (filePath && existsSync(filePath)) { try { unlinkSync(filePath); } catch {} }
    let artworkUpdated = false;
    // If the re-uploaded file carries artwork, refresh the existing song's image
    if (artworkPath && existing.length > 0) {
      const existingSong = existing[0] as any;
      const oldId = existingSong.id;
      try {
        for (const oldExt of ['jpg', 'png']) {
          const oldArt = join(ARTWORK_DIR, `${oldId}.${oldExt}`);
          if (existsSync(oldArt)) { try { unlinkSync(oldArt); } catch {} }
        }
        const ext = artworkExt || (artworkPath.split('.').pop() || 'jpg');
        const newArtPath = join(ARTWORK_DIR, `${oldId}.${ext}`);
        writeFileSync(newArtPath, readFileSync(artworkPath));
        try { unlinkSync(artworkPath); } catch {}
        stmtUpdateSongArtwork.run('', newArtPath, genre, oldId);
        artworkUpdated = true;
      } catch (e) { console.error('[duplicate] Artwork update error:', e); }
    }
    return { song: { id: existing.length ? existing[0].id : id, title, artist, album, year, genre, songType, duration, artworkUrl: existing.length ? `/artwork/${existing[0].id}` : '', bitrate, sampleRate, fileSize }, duplicate: true, artworkUpdated };
  }

  stmtInsertSong.run(id, title, artist, album, year, genre, songType, duration, filePath, fileName, artworkUrl, artworkPath, bitrate, sampleRate, fileSize, userId);
  return { song: { id, title, artist, album, year, genre, songType, duration, artworkUrl: artworkPath ? `/artwork/${id}` : '', bitrate, sampleRate, fileSize }, duplicate: false };
}

// ===== Request Handlers =====

async function handleUpload(req: Request, userId: string): Promise<Response> {
  if (authEnabled && !userId) return Response.json({ error: 'Sign in required' }, { status: 401 });
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

    const ext = extname(file.name).toLowerCase();
    const validExts = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.webm'];
    if (!validExts.includes(ext)) return Response.json({ error: `Unsupported format: ${ext}` }, { status: 400 });

    const id = randomUUID();
    const fileName = `${id}${ext}`;
    const filePath = join(MUSIC_DIR, fileName);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filePath, fileBuffer);

    const result = await processAudioFile(file.name, fileBuffer, filePath, userId);
    if (result.duplicate) {
      return Response.json({ ...result.song, duplicate: true, error: 'Duplicate detected', artworkUpdated: result.artworkUpdated });
    }
    return Response.json({ ...result.song, duplicate: false });
  } catch (e: any) {
    console.error('Upload error:', e);
    return Response.json({ error: e.message || 'Upload failed' }, { status: 500 });
  }
}

async function handleBatchUpload(req: Request, userId: string): Promise<Response> {
  if (authEnabled && !userId) return Response.json({ error: 'Sign in required' }, { status: 401 });
  try {
    const formData = await req.formData();
    const files: File[] = [];
    for (const [, value] of formData.entries()) { if (value instanceof File) files.push(value); }
    if (!files.length) return Response.json({ error: 'No files provided' }, { status: 400 });

    const results: any[] = [];
    for (const file of files) {
      const ext = extname(file.name).toLowerCase();
      const validExts = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.webm'];
      if (!validExts.includes(ext)) { results.push({ file: file.name, error: `Unsupported: ${ext}` }); continue; }

      try {
        const id = randomUUID();
        const fileName = `${id}${ext}`;
        const filePath = join(MUSIC_DIR, fileName);
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        writeFileSync(filePath, fileBuffer);
        const result = await processAudioFile(file.name, fileBuffer, filePath, userId);
        if (result.duplicate) {
          results.push({ ...result.song, file: file.name, duplicate: true, warning: 'Duplicate: ' + result.song.title + ' by ' + result.song.artist, artworkUpdated: result.artworkUpdated });
        } else {
          results.push({ ...result.song, file: file.name, duplicate: false });
        }
      } catch (e: any) {
        results.push({ file: file.name, error: e.message });
      }
    }
    const added = results.filter(r => !r.error && !r.duplicate).length;
    const dups = results.filter(r => r.duplicate).length;
    return Response.json({ songs: results, added, duplicates: dups });
  } catch (e: any) {
    console.error('Batch upload error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

function handleStream(req: Request, id: string): Response {
  const song = stmtGetById.get(id) as any;
  if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });
  if (!existsSync(song.file_path)) return Response.json({ error: 'File not found' }, { status: 404 });

  const stat = statSync(song.file_path);
  const fileSize = stat.size;
  const range = req.headers.get('range');
  const ext = song.file_name.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
    wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/opus', wma: 'audio/x-ms-wma', webm: 'audio/webm',
  };
  const contentType = mimeMap[ext || ''] || 'audio/mpeg';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = Bun.file(song.file_path);
    const slice = file.slice(start, end + 1);
    return new Response(slice, {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunkSize.toString(), 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' }
    });
  }

  const file = Bun.file(song.file_path);
  return new Response(file, {
    headers: { 'Content-Length': fileSize.toString(), 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' }
  });
}

function handleArtwork(id: string, req: Request, artworkPathHint: string = ''): Response {
  let path = '';
  if (artworkPathHint && existsSync(artworkPathHint)) path = artworkPathHint;
  if (!path) {
    const jpgPath = join(ARTWORK_DIR, `${id}.jpg`);
    const pngPath = join(ARTWORK_DIR, `${id}.png`);
    if (existsSync(jpgPath)) path = jpgPath;
    else if (existsSync(pngPath)) path = pngPath;
  }
  if (!path) return Response.json({ error: 'Artwork not found' }, { status: 404 });
  const file = Bun.file(path);
  const ext = path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const stat = statSync(path);
  const lastModified = stat.mtime.toUTCString();
  const ifModifiedSince = req.headers.get('if-modified-since');
  if (ifModifiedSince) {
    const since = Date.parse(ifModifiedSince);
    if (!isNaN(since) && Math.floor(stat.mtimeMs / 1000) <= Math.floor(since / 1000)) {
      return new Response(null, { status: 304 });
    }
  }
  return new Response(file, {
    headers: {
      'Content-Type': ext,
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Last-Modified': lastModified,
    }
  });
}

function getQuery(req: Request, key: string): string {
  return new URL(req.url).searchParams.get(key) || '';
}

// Apply CORS headers to a response (required for cross-origin browser access)
function cors(res: Response): Response {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, X-Admin-Code');
  return res;
}

// ===== Playlist Handlers =====
function handleListPlaylists(userId: string): Response {
  const playlists = userId ? stmtPlaylistGetAll.all(userId) as any[] : stmtPlaylistGetAllNoUser.all() as any[];
  return Response.json({ playlists });
}

function handleGetPlaylist(id: string, userId: string, req: Request): Response {
  const playlist = stmtPlaylistGetById.get(id) as any;
  if (!playlist) return Response.json({ error: 'Playlist not found' }, { status: 404 });
  if (authEnabled && !playlist.is_public && playlist.user_id !== '' && playlist.user_id !== userId && !checkAdminCode(req)) {
    return Response.json({ error: 'You can only view your own playlists' }, { status: 403 });
  }
  const songs = stmtPlaylistGetSongs.all(id) as any[];
  return Response.json({ ...playlist, songs });
}

async function handleCreatePlaylist(req: Request, userId: string, profile: { name?: string; email?: string } | null): Promise<Response> {
  if (authEnabled && !userId) return Response.json({ error: 'Sign in required' }, { status: 401 });
  try {
    const body = await req.json() as any;
    const name = body.name?.trim() || 'Untitled Playlist';
    const description = body.description || '';
    const songIds: string[] = body.song_ids || [];
    const is_public = body.is_public ? 1 : 0;
    const owner_name = profile?.name || profile?.email || '';
    const id = randomUUID();
    stmtPlaylistCreate.run(id, name, description, userId, is_public, owner_name);

    if (songIds.length > 0) {
      for (let i = 0; i < songIds.length; i++) {
        const song = stmtGetById.get(songIds[i]) as any;
        if (song) stmtPlaylistAddSong.run(id, songIds[i], i);
      }
      stmtPlaylistUpdate.run(name, description, is_public, id);
    }
    return Response.json({ id, name, description, song_count: songIds.length, is_public }, { status: 201 });
  } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}

async function handleUpdatePlaylist(id: string, req: Request, userId: string): Promise<Response> {
  const existing = stmtPlaylistGetById.get(id) as any;
  if (!existing) return Response.json({ error: 'Playlist not found' }, { status: 404 });
  if (authEnabled && !userId && !checkAdminCode(req)) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }
  if (authEnabled && existing.user_id !== userId && !checkAdminCode(req)) {
    return Response.json({ error: 'You can only modify your own playlists' }, { status: 403 });
  }
  try {
    const body = await req.json() as any;
    const name = body.name?.trim() || existing.name;
    const description = body.description !== undefined ? body.description : existing.description;
    const is_public = body.is_public !== undefined ? (body.is_public ? 1 : 0) : existing.is_public;
    stmtPlaylistUpdate.run(name, description, is_public, id);
    return Response.json({ id, name, description, is_public });
  } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}

function handleDeletePlaylist(id: string, userId: string, req: Request): Response {
  const existing = stmtPlaylistGetById.get(id) as any;
  if (!existing) return Response.json({ error: 'Playlist not found' }, { status: 404 });
  if (authEnabled && !userId && !checkAdminCode(req)) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }
  if (authEnabled && existing.user_id !== userId && !checkAdminCode(req)) {
    return Response.json({ error: 'You can only delete your own playlists' }, { status: 403 });
  }
  stmtPlaylistDeleteSongs.run(id);
  stmtPlaylistDelete.run(id);
  return Response.json({ success: true });
}

async function handleAddSongToPlaylist(playlistId: string, req: Request, userId: string): Promise<Response> {
  const playlist = stmtPlaylistGetById.get(playlistId) as any;
  if (!playlist) return Response.json({ error: 'Playlist not found' }, { status: 404 });
  if (authEnabled && !userId && !checkAdminCode(req)) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }
  if (authEnabled && playlist.user_id !== userId && !checkAdminCode(req)) {
    return Response.json({ error: 'You can only modify your own playlists' }, { status: 403 });
  }
  try {
    const body = await req.json() as any;
    const songId = body.song_id;
    if (!songId) return Response.json({ error: 'song_id is required' }, { status: 400 });
    const song = stmtGetById.get(songId) as any;
    if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });
    const maxPos = stmtPlaylistGetMaxPos.get(playlistId) as any;
    const position = (maxPos?.max_pos ?? -1) + 1;
    stmtPlaylistAddSong.run(playlistId, songId, position);
    stmtPlaylistUpdate.run(playlist.name, playlist.description, playlist.is_public ?? 0, playlistId);
    return Response.json({ success: true, position });
  } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}

async function handleBatchAddSongsToPlaylist(playlistId: string, req: Request, userId: string): Promise<Response> {
  const playlist = stmtPlaylistGetById.get(playlistId) as any;
  if (!playlist) return Response.json({ error: 'Playlist not found' }, { status: 404 });
  if (authEnabled && !userId && !checkAdminCode(req)) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }
  if (authEnabled && playlist.user_id !== userId && !checkAdminCode(req)) {
    return Response.json({ error: 'You can only modify your own playlists' }, { status: 403 });
  }
  try {
    const body = await req.json() as any;
    const songIds: string[] = body.song_ids || [];
    if (!songIds.length) return Response.json({ error: 'song_ids required' }, { status: 400 });
    const maxPos = stmtPlaylistGetMaxPos.get(playlistId) as any;
    let position = (maxPos?.max_pos ?? -1) + 1;
    let added = 0;
    for (const songId of songIds) {
      const song = stmtGetById.get(songId) as any;
      if (song) { try { stmtPlaylistAddSong.run(playlistId, songId, position++); added++; } catch {} }
    }
    stmtPlaylistUpdate.run(playlist.name, playlist.description, playlist.is_public ?? 0, playlistId);
    return Response.json({ success: true, added });
  } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}

function handleRemoveSongFromPlaylist(playlistId: string, songId: string, userId: string, req: Request): Response {
  const playlist = stmtPlaylistGetById.get(playlistId) as any;
  if (!playlist) return Response.json({ error: 'Playlist not found' }, { status: 404 });
  if (authEnabled && !userId && !checkAdminCode(req)) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }
  if (authEnabled && playlist.user_id !== userId && !checkAdminCode(req)) {
    return Response.json({ error: 'You can only modify your own playlists' }, { status: 403 });
  }
  stmtPlaylistRemoveSong.run(playlistId, songId);
  stmtPlaylistUpdate.run(playlist.name, playlist.description, playlist.is_public ?? 0, playlistId);
  return Response.json({ success: true });
}

// ===== Main Server =====
const TLS_CERT = process.env.SOUNDWAVE_TLS_CERT || '';
const TLS_KEY = process.env.SOUNDWAVE_TLS_KEY || '';
let tls: { cert: string; key: string } | undefined;
if (TLS_CERT && TLS_KEY) {
  try {
    tls = {
      cert: readFileSync(TLS_CERT, 'utf8'),
      key: readFileSync(TLS_KEY, 'utf8'),
    };
    console.log(`[tls] HTTPS enabled (cert=${TLS_CERT})`);
  } catch (e) {
    console.error('[tls] Failed to read TLS files:', e);
  }
}
if (!tls) console.log('[tls] Running in plain HTTP mode');

const server = Bun.serve({
  port: PORT,
  http2: false,
  tls,
  async fetch(req) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;
      console.log(`[req] ${method} ${path}`);

      // CORS
      if (method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization, X-Admin-Code',
          }
        });
      }

      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization, X-Admin-Code',
      };

      // Health check
      if (path === '/' && method === 'GET') {
        return Response.json({ status: 'ok', service: 'WAVR Music Service', version: '3.0.0', auth: authEnabled }, { headers });
      }

      // Get auth user
      const { uid: userId, profile } = await getUser(req);

      // ===== PUBLIC ROUTES (no auth required) =====

      // Upload (single)
      if (path === '/upload' && method === 'POST') {
        return cors(await handleUpload(req, userId));
      }

      // Batch upload
      if (path === '/upload/batch' && method === 'POST') {
        return cors(await handleBatchUpload(req, userId));
      }

      // List songs
      if (path === '/songs' && method === 'GET') {
        const q = getQuery(req, 'q');
        const genre = getQuery(req, 'genre');
        const page = parseInt(getQuery(req, 'page') || '1', 10);
        const limit = parseInt(getQuery(req, 'limit') || '50', 10);
        const offset = (page - 1) * limit;

        if (q || genre) {
          const songs = userId ? stmtSearch.all(q, q, q, genre, genre, userId, limit, offset) as any[] : stmtSearchNoUser.all(q, q, q, genre, genre, limit, offset) as any[];
          const count = userId ? stmtCountSearch.get(q, q, q, genre, genre, userId) as any : stmtCountSearchNoUser.get(q, q, q, genre, genre) as any;
          return Response.json({ songs, total: count.total, page, limit }, { headers });
        }
        const songs = userId ? stmtGetAll.all(userId) as any[] : stmtGetAllNoUser.all() as any[];
        return Response.json({ songs, total: songs.length }, { headers });
      }

      // Get genres
      if (path === '/genres' && method === 'GET') {
        const genres = userId ? stmtGetGenres.all(userId) as any[] : stmtGetGenresNoUser.all() as any[];
        return Response.json({ genres: genres.map(g => g.genre) }, { headers });
      }

      // Get artists
      if (path === '/artists' && method === 'GET') {
        const artists = userId ? stmtGetArtists.all(userId) as any[] : stmtGetArtistsNoUser.all() as any[];
        return Response.json({ artists: artists.map(a => a.artist) }, { headers });
      }

      // Get favorite songs
      if (path === '/songs/favorites' && method === 'GET') {
        const songs = userId ? stmtGetFavorites.all(userId) as any[] : stmtGetFavoritesNoUser.all() as any[];
        return Response.json({ songs }, { headers });
      }

      // ===== Song-specific routes (MUST be before /songs/:id) =====

      // Get song lyrics
      const lyricsMatch = path.match(/^\/songs\/([a-f0-9-]+)\/lyrics$/);
      if (lyricsMatch && method === 'GET') {
        try {
          const songId = lyricsMatch[1];
          const song = stmtGetById.get(songId) as any;
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404, headers });

          if (song.lyrics) {
            try { return Response.json(JSON.parse(song.lyrics), { headers }); }
            catch { return Response.json({ syncedLyrics: '', plainLyrics: song.lyrics }, { headers }); }
          }

          // Fetch from LrcLib API
          const lrcUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(song.artist)}&track_name=${encodeURIComponent(song.title)}&duration=${Math.round(song.duration || 0)}`;
          const lrcRes = await fetch(lrcUrl, { headers: { 'User-Agent': 'WAVR/1.0' } });
          if (lrcRes.ok) {
            const lrcData = await lrcRes.json() as any;
            const result = { syncedLyrics: lrcData.syncedLyrics || '', plainLyrics: lrcData.plainLyrics || '' };
            if (result.syncedLyrics || result.plainLyrics) {
              stmtUpdateLyrics.run(JSON.stringify(result), songId);
            }
            return Response.json(result, { headers });
          }

          return Response.json({ syncedLyrics: '', plainLyrics: '' }, { headers });
        } catch (e: any) {
          console.error('Lyrics fetch error:', e);
          return Response.json({ error: e.message }, { status: 500, headers });
        }
      }

      // Toggle favorite
      const favMatch = path.match(/^\/songs\/([a-f0-9-]+)\/favorite$/);
      if (favMatch && method === 'PUT') {
        const songId = favMatch[1];
        const song = stmtGetById.get(songId) as any;
        if (!song) return Response.json({ error: 'Song not found' }, { status: 404, headers });
        stmtToggleFavorite.run(songId);
        const updated = stmtGetById.get(songId) as any;
        return Response.json({ is_favorite: updated.is_favorite === 1 }, { headers });
      }

      // Library rescan
      if (path === '/library/rescan' && method === 'POST') {
        try {
          const existingSongs = stmtGetAllNoUser.all() as any[];
          const existingPaths = new Set(existingSongs.map(s => s.file_path));
          const supportedExts = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.opus', '.webm']);
          const allFiles: string[] = [];
          try {
            const entries = readdirSync(MUSIC_DIR, { recursive: true }) as string[];
            for (const entry of entries) {
              if (supportedExts.has(extname(entry).toLowerCase())) allFiles.push(join(MUSIC_DIR, entry));
            }
          } catch (e) { console.error('Directory scan error:', e); }

          const scanned = allFiles.length;
          const newFiles = allFiles.filter(f => !existingPaths.has(f));
          let added = 0;
          let duplicates = 0;

          for (const filePath of newFiles) {
            try {
              const fileName = filePath.split('/').pop() || 'unknown';
              const fileBuffer = readFileSync(filePath);
              const result = await processAudioFile(fileName, fileBuffer, '', userId);
              if (!result.duplicate) added++;
              else duplicates++;
            } catch (e) { console.error(`[rescan] Error:`, e); }
          }

          const total = (stmtGetAllNoUser.all() as any[]).length;
          return Response.json({ added, scanned, skipped: scanned - added - duplicates, duplicates, total }, { headers });
        } catch (e: any) {
          console.error('Rescan error:', e);
          return Response.json({ error: e.message }, { status: 500, headers });
        }
      }

      // Dedup endpoint - find and optionally delete duplicates
      if (path === '/songs/dedup' && method === 'GET') {
        const dups = findDuplicates(userId);
        return Response.json({ duplicates: dups, count: dups.length }, { headers });
      }

      if (path === '/songs/dedup' && method === 'POST') {
        const dups = findDuplicates(userId);
        let deleted = 0;
        for (const d of dups) {
          const song = stmtGetById.get(d.id) as any;
          if (song) {
            try { if (song.file_path && existsSync(song.file_path)) unlinkSync(song.file_path); } catch {}
            try { if (song.artwork_path && existsSync(song.artwork_path)) unlinkSync(song.artwork_path); } catch {}
            stmtDelete.run(d.id);
            deleted++;
          }
        }
        return Response.json({ deleted, remaining: dups.length - deleted }, { headers });
      }

      // Admin delete - requires admin code
      const adminDeleteMatch = path.match(/^\/songs\/([a-f0-9-]+)\/admin-delete$/);
      if (adminDeleteMatch && method === 'DELETE') {
        if (!checkAdminCode(req)) {
          return Response.json({ error: 'Invalid or missing admin code' }, { status: 403, headers });
        }
        const songId = adminDeleteMatch[1];
        const song = stmtGetById.get(songId) as any;
        if (!song) return Response.json({ error: 'Song not found' }, { status: 404, headers });
        try { if (song.file_path && existsSync(song.file_path)) unlinkSync(song.file_path); } catch {}
        try { if (song.artwork_path && existsSync(song.artwork_path)) unlinkSync(song.artwork_path); } catch {}
        stmtDelete.run(songId);
        return Response.json({ success: true, deleted: song.title }, { headers });
      }

      // Get single song / Delete song (owner only)
      const songMatch = path.match(/^\/songs\/([a-f0-9-]+)$/);
      if (songMatch && method === 'GET') {
        const song = stmtGetById.get(songMatch[1]) as any;
        if (!song) return Response.json({ error: 'Song not found' }, { status: 404, headers });
        return Response.json(song, { headers });
      }
      if (songMatch && method === 'DELETE') {
        const songId = songMatch[1];
        const song = stmtGetById.get(songId) as any;
        if (!song) return Response.json({ error: 'Song not found' }, { status: 404, headers });
        // Owner or admin can delete
        if (authEnabled && !userId && !checkAdminCode(req)) {
          return Response.json({ error: 'Sign in required' }, { status: 401, headers });
        }
        if (authEnabled && song.user_id !== userId && !checkAdminCode(req)) {
          return Response.json({ error: 'You can only delete your own songs' }, { status: 403, headers });
        }
        try { if (song.file_path && existsSync(song.file_path)) unlinkSync(song.file_path); } catch {}
        try { if (song.artwork_path && existsSync(song.artwork_path)) unlinkSync(song.artwork_path); } catch {}
        stmtDelete.run(songId);
        return Response.json({ success: true }, { headers });
      }

      // Stream audio
      const streamMatch = path.match(/^\/stream\/([a-f0-9-]+)$/);
      if (streamMatch && method === 'GET') {
        return cors(handleStream(req, streamMatch[1]));
      }

      // Serve artwork
      const artworkMatch = path.match(/^\/artwork\/([a-f0-9-]+)$/);
      if (artworkMatch && method === 'GET') {
        const song = stmtGetById.get(artworkMatch[1]) as any;
        return cors(handleArtwork(artworkMatch[1], req, song?.artwork_path));
      }

      // ===== Playlist Routes =====

      if (path === '/playlists' && method === 'GET') {
        return cors(handleListPlaylists(userId));
      }

      if (path === '/playlists' && method === 'POST') {
        return cors(await handleCreatePlaylist(req, userId, profile));
      }

      const playlistMatch = path.match(/^\/playlists\/([a-f0-9-]+)$/);
      if (playlistMatch && method === 'GET') return cors(handleGetPlaylist(playlistMatch[1], userId, req));
      if (playlistMatch && method === 'PUT') return cors(await handleUpdatePlaylist(playlistMatch[1], req, userId));
      if (playlistMatch && method === 'DELETE') return cors(handleDeletePlaylist(playlistMatch[1], userId, req));

      const psMatch = path.match(/^\/playlists\/([a-f0-9-]+)\/songs$/);
      if (psMatch && method === 'POST') return cors(await handleAddSongToPlaylist(psMatch[1], req, userId));

      const psBatchMatch = path.match(/^\/playlists\/([a-f0-9-]+)\/songs\/batch$/);
      if (psBatchMatch && method === 'POST') return cors(await handleBatchAddSongsToPlaylist(psBatchMatch[1], req, userId));

      const psRemoveMatch = path.match(/^\/playlists\/([a-f0-9-]+)\/songs\/([a-f0-9-]+)$/);
      if (psRemoveMatch && method === 'DELETE') return cors(handleRemoveSongFromPlaylist(psRemoveMatch[1], psRemoveMatch[2], userId, req));

      return Response.json({ error: 'Not found' }, { status: 404, headers });
    } catch (e: any) {
      console.error('Server error:', e);
      return Response.json({ error: e.message || 'Internal server error' }, { status: 500, headers });
    }
  },
});

console.log(`\u{1F3B5} WAVR Music Service v3.0 running on http://localhost:${PORT}`);
console.log(`  Auth: ${authEnabled ? 'Firebase' : 'Single-user mode'}`);
console.log(`  Admin: ${ADMIN_CODE ? 'Enabled (set SOUNDWAVE_ADMIN_CODE)' : 'Disabled'}`);
