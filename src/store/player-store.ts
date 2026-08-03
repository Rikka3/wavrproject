import { create } from 'zustand';
import type { Song, Playlist } from '@/lib/music-api';
import { pickNextSimilar } from '@/lib/similarity';

export type ViewTab = 'library' | 'search' | 'playlists' | 'upload';
export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  // Library
  songs: Song[];
  filteredSongs: Song[];
  genres: string[];
  artists: string[];
  searchQuery: string;
  selectedGenre: string;
  currentTab: ViewTab;
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: number;

  // Player
  currentSong: Song | null;
  queue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  isFullscreen: boolean;
  showMobilePlayer: boolean;

  // Lyrics
  showLyrics: boolean;
  lyricsSynced: string;
  lyricsPlain: string;
  lyricsLoading: boolean;

  // Queue drawer
  showQueue: boolean;

  // Favorites
  favorites: Set<string>;

  // Playlists
  playlists: Playlist[];
  activePlaylistId: string | null;
  isPlaylistLoading: boolean;
  showCreatePlaylist: boolean;
  showAddToPlaylist: boolean;
  addToPlaylistSongId: string | null;

  // Library actions
  setSongs: (songs: Song[]) => void;
  setFilteredSongs: (songs: Song[]) => void;
  setGenres: (genres: string[]) => void;
  setArtists: (artists: string[]) => void;
  setSearchQuery: (q: string) => void;
  setSelectedGenre: (g: string) => void;
  setCurrentTab: (tab: ViewTab) => void;
  setIsLoading: (l: boolean) => void;
  setIsUploading: (u: boolean) => void;
  setUploadProgress: (p: number) => void;
  addSong: (song: Song) => void;
  removeSong: (id: string) => void;

  // Player actions
  playSong: (song: Song, playlist?: Song[]) => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  nextSong: () => void;
  prevSong: () => void;
  setFullscreen: (f: boolean) => void;
  setShowMobilePlayer: (s: boolean) => void;

  // Lyrics actions
  setShowLyrics: (s: boolean) => void;
  setLyricsSynced: (l: string) => void;
  setLyricsPlain: (l: string) => void;
  setLyricsLoading: (l: boolean) => void;

  // Queue drawer actions
  setShowQueue: (s: boolean) => void;

  // Favorites actions
  toggleFavorite: (songId: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;

  // Playlist actions
  setPlaylists: (playlists: Playlist[]) => void;
  addPlaylist: (playlist: Playlist) => void;
  removePlaylist: (id: string) => void;
  updatePlaylistInStore: (id: string, updates: Partial<Playlist>) => void;
  setActivePlaylistId: (id: string | null) => void;
  setIsPlaylistLoading: (l: boolean) => void;
  setShowCreatePlaylist: (s: boolean) => void;
  setShowAddToPlaylist: (s: boolean) => void;
  setAddToPlaylistSongId: (id: string | null) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Library initial state
  songs: [],
  filteredSongs: [],
  genres: [],
  artists: [],
  searchQuery: '',
  selectedGenre: '',
  currentTab: 'library',
  isLoading: false,
  isUploading: false,
  uploadProgress: 0,

  // Player initial state
  currentSong: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  shuffle: false,
  repeat: 'off',
  isFullscreen: false,
  showMobilePlayer: false,

  // Lyrics initial state
  showLyrics: false,
  lyricsSynced: '',
  lyricsPlain: '',
  lyricsLoading: false,

  // Queue drawer initial state
  showQueue: false,

  // Favorites initial state
  favorites: new Set<string>(),

  // Playlist initial state
  playlists: [],
  activePlaylistId: null,
  isPlaylistLoading: false,
  showCreatePlaylist: false,
  showAddToPlaylist: false,
  addToPlaylistSongId: null,

  // Library actions
  setSongs: (songs) => set({ songs, filteredSongs: songs }),
  setFilteredSongs: (filteredSongs) => set({ filteredSongs }),
  setGenres: (genres) => set({ genres }),
  setArtists: (artists) => set({ artists }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedGenre: (selectedGenre) => set({ selectedGenre }),
  setCurrentTab: (currentTab) => set({ currentTab }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsUploading: (isUploading) => set({ isUploading }),
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
  addSong: (song) => set((s) => ({
    songs: [song, ...s.songs],
    filteredSongs: [song, ...s.filteredSongs]
  })),
  removeSong: (id) => set((s) => ({
    songs: s.songs.filter(song => song.id !== id),
    filteredSongs: s.filteredSongs.filter(song => song.id !== id),
    currentSong: s.currentSong?.id === id ? null : s.currentSong,
    queue: s.queue.filter(song => song.id !== id),
  })),

  // Player actions
  playSong: (song, playlist) => {
    const state = get();
    const queue = playlist || state.filteredSongs;
    const index = queue.findIndex(s => s.id === song.id);
    set({
      currentSong: song,
      queue,
      queueIndex: index >= 0 ? index : 0,
      isPlaying: true,
      currentTime: 0,
      showMobilePlayer: true,
    });
  },
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
  toggleMute: () => set((s) => {
    if (s.isMuted) return { isMuted: false };
    return { isMuted: true };
  }),
  toggleShuffle: () => set((s) => {
    const newShuffle = !s.shuffle;
    let newQueue = [...s.queue];
    if (newShuffle && s.currentSong) {
      const current = s.currentSong;
      newQueue = newQueue.filter(song => song.id !== current.id);
      for (let i = newQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
      }
      newQueue.unshift(current);
    }
    return { shuffle: newShuffle, queue: newQueue, queueIndex: 0 };
  }),
  toggleRepeat: () => set((s) => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    const idx = modes.indexOf(s.repeat);
    return { repeat: modes[(idx + 1) % 3] };
  }),
  nextSong: () => set((s) => {
    if (s.queue.length === 0) return {};
    if (s.repeat === 'one') return { queueIndex: s.queueIndex, currentTime: 0 };
    if (!s.currentSong) return { queueIndex: s.queueIndex + 1, currentTime: 0, isPlaying: false };
    let next = s.queueIndex + 1;
    let candidates = s.queue.slice(next);
    if (candidates.length === 0 && s.repeat === 'all') {
      candidates = s.queue.filter(song => song.id !== s.currentSong!.id);
    }
    const similar = pickNextSimilar(s.currentSong, candidates);
    if (similar) {
      const fromIndex = s.queue.findIndex(song => song.id === similar.id);
      const q = [...s.queue];
      const [moved] = q.splice(fromIndex, 1);
      q.splice(next, 0, moved);
      const curIdx = q.findIndex(song => song.id === s.currentSong!.id);
      return { queue: q, queueIndex: curIdx, currentSong: q[curIdx], currentTime: 0, isPlaying: true };
    }
    if (next >= s.queue.length) {
      if (s.repeat === 'all') next = 0;
      else return { isPlaying: false };
    }
    return { queueIndex: next, currentSong: s.queue[next], currentTime: 0, isPlaying: true };
  }),
  prevSong: () => set((s) => {
    if (s.queue.length === 0) return {};
    if (s.currentTime > 3) return { currentTime: 0 };
    let prev = s.queueIndex - 1;
    if (prev < 0) prev = s.repeat === 'all' ? s.queue.length - 1 : 0;
    return { queueIndex: prev, currentSong: s.queue[prev], currentTime: 0, isPlaying: true };
  }),
  setFullscreen: (isFullscreen) => set({ isFullscreen }),
  setShowMobilePlayer: (showMobilePlayer) => set({ showMobilePlayer }),

  // Lyrics actions
  setShowLyrics: (showLyrics) => set({ showLyrics }),
  setLyricsSynced: (lyricsSynced) => set({ lyricsSynced }),
  setLyricsPlain: (lyricsPlain) => set({ lyricsPlain }),
  setLyricsLoading: (lyricsLoading) => set({ lyricsLoading }),

  // Queue drawer actions
  setShowQueue: (showQueue) => set({ showQueue }),

  // Favorites actions
  toggleFavorite: (songId) => set((s) => {
    const next = new Set(s.favorites);
    if (next.has(songId)) next.delete(songId); else next.add(songId);
    return { favorites: next };
  }),
  reorderQueue: (fromIndex, toIndex) => set((s) => {
    const q = [...s.queue];
    const [moved] = q.splice(fromIndex, 1);
    q.splice(toIndex, 0, moved);
    let qi = s.queueIndex;
    if (qi === fromIndex) qi = toIndex;
    else if (fromIndex < qi && toIndex >= qi) qi--;
    else if (fromIndex > qi && toIndex <= qi) qi++;
    return { queue: q, queueIndex: qi };
  }),

  // Playlist actions
  setPlaylists: (playlists) => set({ playlists }),
  addPlaylist: (playlist) => set((s) => ({ playlists: [playlist, ...s.playlists] })),
  removePlaylist: (id) => set((s) => ({
    playlists: s.playlists.filter(p => p.id !== id),
    activePlaylistId: s.activePlaylistId === id ? null : s.activePlaylistId,
  })),
  updatePlaylistInStore: (id, updates) => set((s) => ({
    playlists: s.playlists.map(p => p.id === id ? { ...p, ...updates } : p),
  })),
  setActivePlaylistId: (activePlaylistId) => set({ activePlaylistId }),
  setIsPlaylistLoading: (isPlaylistLoading) => set({ isPlaylistLoading }),
  setShowCreatePlaylist: (showCreatePlaylist) => set({ showCreatePlaylist }),
  setShowAddToPlaylist: (showAddToPlaylist) => set({ showAddToPlaylist }),
  setAddToPlaylistSongId: (addToPlaylistSongId) => set({ addToPlaylistSongId }),
}));
