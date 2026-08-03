'use client';
import { Search, X } from 'lucide-react';
import { usePlayerStore } from '@/store/player-store';
import { fetchSongs } from '@/lib/music-api';
import { useEffect, useState, useCallback, useRef } from 'react';

export default function SearchBar() {
  const { selectedGenre, setSelectedGenre, genres, setFilteredSongs, setIsLoading, setSearchQuery, songs, totalSongs, currentTab, playlistQuery, setPlaylistQuery } = usePlayerStore();
  const [localQuery, setLocalQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const isPlaylistMode = currentTab === 'playlists';

  const doSearch = useCallback(async (q: string, g: string) => {
    setIsLoading(true);
    try {
      const query = g && !q ? '' : q;
      const res = await fetchSongs(query || undefined, g || undefined);
      setFilteredSongs(res.songs);
    } catch (e: any) { console.error(e); }
    setIsLoading(false);
  }, [setFilteredSongs, setIsLoading]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (isPlaylistMode) return;
    debounceRef.current = setTimeout(() => { setSearchQuery(localQuery); doSearch(localQuery, selectedGenre); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [localQuery, selectedGenre, doSearch, setSearchQuery, isPlaylistMode]);

  useEffect(() => { if (!isPlaylistMode && selectedGenre) doSearch(localQuery, selectedGenre); }, [selectedGenre, isPlaylistMode]);

  const value = isPlaylistMode ? playlistQuery : localQuery;
  const setValue = (v: string) => isPlaylistMode ? setPlaylistQuery(v) : setLocalQuery(v);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25" strokeWidth={2} />
        <input
          value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={isPlaylistMode ? 'SEARCH PLAYLISTS...' : 'SEARCH TRACKS...'}
          className="brutal-input w-full h-9 pl-9 pr-9 text-[11px] font-bold uppercase tracking-wider"
        />
        {value && <button onClick={() => setValue('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/25 hover:text-foreground"><X size={12} /></button>}
      </div>
      {!isPlaylistMode && currentTab === 'search' && genres.length > 0 && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          <button onClick={() => setSelectedGenre('')} className={`w-full text-left px-2 py-1 text-[9px] uppercase tracking-wider font-bold ${selectedGenre === '' ? 'text-(--accent)' : 'text-foreground/30 hover:text-foreground/60'}`}>
            ALL <span className="text-foreground/15 ml-0.5">{totalSongs}</span>
          </button>
          {genres.filter(g => g).map(g => {
            const count = songs.filter(s => s.genre === g).length;
            return (
              <button key={g} onClick={() => setSelectedGenre(selectedGenre === g ? '' : g)} className={`w-full text-left px-2 py-1 text-[9px] uppercase tracking-wider font-bold truncate ${selectedGenre === g ? 'text-(--accent)' : 'text-foreground/30 hover:text-foreground/60'}`}>
                {g} <span className="text-foreground/15 ml-0.5">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
