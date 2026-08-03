'use client';
import { Search, X } from 'lucide-react';
import { usePlayerStore } from '@/store/player-store';
import { fetchSongs } from '@/lib/music-api';
import { useEffect, useState, useCallback, useRef } from 'react';

export default function SearchBar() {
  const { selectedGenre, setSelectedGenre, genres, setFilteredSongs, setIsLoading, setSearchQuery, songs, totalSongs } = usePlayerStore();
  const [localQuery, setLocalQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
    debounceRef.current = setTimeout(() => { setSearchQuery(localQuery); doSearch(localQuery, selectedGenre); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [localQuery, selectedGenre, doSearch, setSearchQuery]);

  useEffect(() => { if (selectedGenre) doSearch(localQuery, selectedGenre); }, [selectedGenre]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" strokeWidth={2} />
        <input
          value={localQuery} onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="SEARCH TRACKS..."
          className="brutal-input w-full h-9 pl-9 pr-9 text-[11px] font-bold uppercase tracking-wider"
        />
        {localQuery && <button onClick={() => { setLocalQuery(''); setSearchQuery(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white"><X size={12} /></button>}
      </div>
      {genres.length > 0 && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          <button onClick={() => setSelectedGenre('')} className={`w-full text-left px-2 py-1 text-[9px] uppercase tracking-wider font-bold ${selectedGenre === '' ? 'text-[#FF2D2D]' : 'text-white/30 hover:text-white/60'}`}>
            ALL <span className="text-white/15 ml-0.5">{totalSongs}</span>
          </button>
          {genres.filter(g => g).map(g => {
            const count = songs.filter(s => s.genre === g).length;
            return (
              <button key={g} onClick={() => setSelectedGenre(selectedGenre === g ? '' : g)} className={`w-full text-left px-2 py-1 text-[9px] uppercase tracking-wider font-bold truncate ${selectedGenre === g ? 'text-[#FF2D2D]' : 'text-white/30 hover:text-white/60'}`}>
                {g} <span className="text-white/15 ml-0.5">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}