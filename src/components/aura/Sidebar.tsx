'use client';
import { Library, Upload, Search, Disc3, ListMusic, Shield, Trash2, ScanSearch, Loader2, X } from 'lucide-react';
import { usePlayerStore, type ViewTab } from '@/store/player-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import AuthModal from './AuthModal';
import { useState, useCallback } from 'react';
import { fetchDuplicates, deleteDuplicates } from '@/lib/music-api';
import { appToast as toast } from '@/components/ui/AppToaster';
import { AnimatePresence, motion } from 'framer-motion';

export default function Sidebar() {
  const { currentTab, setCurrentTab, songs, genres, selectedGenre, setSelectedGenre, playlists, setActivePlaylistId } = usePlayerStore();
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [deduping, setDeduping] = useState(false);
  const [dupCount, setDupCount] = useState<number | null>(null);

  const totalSongs = songs.length;
  const totalArtists = [...new Set(songs.map(s => s.artist))].length;
  const totalDuration = songs.reduce((a, s) => a + (s.duration || 0), 0);
  const hrs = Math.floor(totalDuration / 3600);
  const mins = Math.floor((totalDuration % 3600) / 60);

  const tabs = [
    { id: 'library' as ViewTab, icon: Library, label: 'LIBRARY' },
    { id: 'search' as ViewTab, icon: Search, label: 'SEARCH' },
    { id: 'playlists' as ViewTab, icon: ListMusic, label: 'PLAYLISTS' },
    { id: 'upload' as ViewTab, icon: Upload, label: 'UPLOAD' },
  ];

  const checkDups = useCallback(async () => {
    try {
      const res = await fetchDuplicates();
      setDupCount(res.count);
      if (res.count === 0) toast.info('NO DUPLICATES FOUND');
    } catch (e: any) { toast.error(e.message); }
  }, []);

  const handleDedup = async () => {
    setDeduping(true);
    try {
      const res = await deleteDuplicates();
      toast.success(`DELETED ${res.deleted} DUPLICATES`);
      setDupCount(null);
      setShowAdmin(false);
      // Reload data
      const { fetchSongs, fetchGenres, fetchArtists } = await import('@/lib/music-api');
      const [songsRes, genres, artists] = await Promise.all([fetchSongs(), fetchGenres(), fetchArtists()]);
      usePlayerStore.getState().setSongs(songsRes.songs);
      usePlayerStore.getState().setGenres(genres);
      usePlayerStore.getState().setArtists(artists);
    } catch (e: any) { toast.error(e.message); }
    setDeduping(false);
  };

  return (
    <div className="hidden md:flex flex-col w-52 h-full flex-shrink-0" style={{ zIndex: 10, position: 'relative' }}>
      <div className="glass-panel m-1.5 mr-0 flex flex-col" style={{ height: 'calc(100vh - 76px)' }}>
        {/* Logo */}
        <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <Disc3 size={20} className="text-white flex-shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <h1 className="text-[13px] font-extrabold uppercase tracking-widest text-white truncate">WAVR</h1>
              <p className="text-[8px] uppercase tracking-[0.2em] text-white/20 truncate">v3.0 // {process.env.NODE_ENV === 'production' ? 'PROD' : 'LOCAL'}</p>
            </div>
          </div>
          <AuthModal />
        </div>

        {/* Nav */}
        <nav className="p-1.5 space-y-0.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setCurrentTab(tab.id); if (tab.id === 'playlists') setActivePlaylistId(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-all ${
                currentTab === tab.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              <tab.icon size={15} strokeWidth={2} />
              {tab.label}
              {tab.id === 'playlists' && playlists.length > 0 && (
                <span className="ml-auto text-[9px] text-white/20 tabular-nums">{playlists.length}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Admin tools */}
        <div className="px-1.5 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => { setShowAdmin(!showAdmin); if (!showAdmin) checkDups(); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/20 hover:text-white/40 hover:bg-white/[0.02] transition-all"
          >
            <Shield size={13} strokeWidth={1.5} />
            ADMIN
            {dupCount !== null && dupCount > 0 && (
              <span className="ml-auto text-[9px] bg-[#FF2D2D]/20 text-[#FF2D2D] px-1.5 py-0.5 font-bold">{dupCount}</span>
            )}
          </button>
        </div>

        <AnimatePresence>
          {showAdmin && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-1.5 py-2 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="brutal-label px-1">ADMIN TOOLS</p>

                {/* Admin code input */}
                <div className="flex gap-1">
                  <input
                    type="password"
                    value={adminCode}
                    onChange={(e) => setAdminCode(e.target.value)}
                    placeholder="Admin code"
                    className="flex-1 px-2 py-1.5 bg-white/5 text-white text-[10px] uppercase tracking-wide placeholder:text-white/15 outline-none"
                    style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <button onClick={handleDedup} disabled={deduping} className="brutal-btn brutal-btn-sm flex items-center gap-1">
                    {deduping ? <Loader2 size={10} className="animate-spin" /> : <ScanSearch size={10} />}
                    CLEAN
                  </button>
                </div>

                {dupCount !== null && (
                  <p className={`text-[9px] uppercase tracking-wider px-1 ${dupCount > 0 ? 'text-[#FF2D2D]/70' : 'text-emerald-400/50'}`}>
                    {dupCount > 0 ? `${dupCount} DUPLICATE${dupCount !== 1 ? 'S' : ''} FOUND` : 'LIBRARY CLEAN'}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats */}
        <div className="px-3 py-2.5 space-y-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="brutal-label">COLLECTION</p>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div><span className="text-white font-bold tabular-nums">{totalSongs}</span><span className="text-white/20 ml-1">tracks</span></div>
            <div><span className="text-white font-bold tabular-nums">{totalArtists}</span><span className="text-white/20 ml-1">artists</span></div>
            <div className="col-span-2"><span className="text-white font-bold tabular-nums">{hrs}h {mins}m</span><span className="text-white/20 ml-1">total</span></div>
          </div>
        </div>

        {/* Genres */}
        {genres.length > 0 && (
          <div className="flex-1 overflow-hidden" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="px-3 pt-2.5 pb-1"><p className="brutal-label">GENRES</p></div>
            <ScrollArea className="h-full px-1.5 pb-2">
              <button onClick={() => setSelectedGenre('')} className={`w-full text-left px-2 py-1 text-[9px] uppercase tracking-wider font-bold ${!selectedGenre ? 'text-white bg-white/8' : 'text-white/30 hover:text-white/60'}`}>
                ALL <span className="text-white/15 ml-1">{totalSongs}</span>
              </button>
              {genres.filter(g => g).map(g => {
                const count = songs.filter(s => s.genre === g).length;
                return (
                  <button key={g} onClick={() => setSelectedGenre(selectedGenre === g ? '' : g)} className={`w-full text-left px-2 py-1 text-[9px] uppercase tracking-wider font-bold ${selectedGenre === g ? 'text-[#FF2D2D]' : 'text-white/30 hover:text-white/60'}`}>
                    {g} <span className="text-white/15 ml-1">{count}</span>
                  </button>
                );
              })}
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
