'use client';

import { useEffect, useCallback, useState } from 'react';
import { Music, Filter, RefreshCw, Loader2, Settings } from 'lucide-react';
import { usePlayerStore } from '@/store/player-store';
import { fetchSongs, fetchGenres, fetchArtists, rescanLibrary } from '@/lib/music-api';
import Sidebar from '@/components/aura/Sidebar';
import MobileNav from '@/components/aura/MobileNav';
import TrackList from '@/components/aura/TrackList';
import SearchBar from '@/components/aura/SearchBar';
import UploadZone from '@/components/aura/UploadZone';
import PlaylistPanel from '@/components/aura/PlaylistPanel';
import AddToPlaylistDialog from '@/components/aura/AddToPlaylistDialog';
import AuthModal from '@/components/aura/AuthModal';
import SettingsDialog from '@/components/aura/SettingsDialog';
import Player from '@/components/aura/Player';
import LyricsDrawer from '@/components/aura/LyricsDrawer';
import QueueDrawer from '@/components/aura/QueueDrawer';
import KeyboardShortcuts from '@/components/aura/KeyboardShortcuts';
import { useAuthStore } from '@/store/auth-store';
import { AnimatePresence, motion } from 'framer-motion';
import AppToaster from '@/components/ui/AppToaster';
import { appToast as toast } from '@/components/ui/AppToaster';

export default function Home() {
  const { currentTab, setIsLoading, setSongs, setGenres, setArtists, filteredSongs, songs, showSettings, setShowSettings, theme, font } = usePlayerStore();
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.font = font;
  }, [theme, font]);
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [songsRes, genres, artists] = await Promise.all([fetchSongs(), fetchGenres(), fetchArtists()]);
      setSongs(songsRes.songs); setGenres(genres); setArtists(artists);
    } catch (e) { console.error('Failed to load data:', e); }
    setIsLoading(false);
  }, [setSongs, setGenres, setArtists, setIsLoading]);

  // Load the catalog on mount, and refetch once auth settles or the account
  // changes so a pre-auth fetch can never leave a stale view behind.
  // Idempotent: the catalog is shared across accounts.
  const authUser = useAuthStore(s => s.user);
  const authLoading = useAuthStore(s => s.loading);
  useEffect(() => { loadData(); }, [loadData, authUser?.uid, authLoading]);

  const handleRescan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const res = await rescanLibrary();
      const dupMsg = res.duplicates ? ` (${res.duplicates} DUP SKIPPED)` : '';
      toast.success(`SCAN COMPLETE: ${res.added} NEW, ${res.scanned} SCANNED, ${res.skipped} SKIPPED${dupMsg}`);
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'SCAN FAILED');
    }
    setScanning(false);
  };

  return (
    <div className="soundwave-bg app-viewport" style={{ width: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* App shell */}
      <div className="relative flex" style={{ width: '100%', height: '100%', zIndex: 10 }}>
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
            <div className="md:hidden flex items-center gap-2 mr-auto">
              <Music size={15} className="text-foreground" strokeWidth={2} />
              <span className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-foreground">WAVR</span>
            </div>
            <div className="hidden md:block flex-1 max-w-sm mx-auto">
              <SearchBar />
            </div>
            <div className="md:hidden flex items-center gap-1.5">
              <AuthModal compact />
              <button
                onClick={() => setShowSettings(true)}
                className="h-8 w-8 flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors"
                style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.08)' }}
              >
                <Settings size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Mobile search */}
          <div className="md:hidden px-3 pb-1.5">
            <AnimatePresence mode="wait">
              {currentTab === 'search' && (
                <motion.div key="mob-search" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <SearchBar />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden px-2">
            <AnimatePresence mode="wait">
              {currentTab === 'library' && (
                <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                  <div className="md:hidden flex items-center justify-between mb-1.5 px-1">
                    <div>
                      <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-foreground">YOUR LIBRARY</h2>
                      <p className="brutal-label mt-0.5">{songs.length} TRACKS</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button className="brutal-btn brutal-btn-sm" disabled={scanning} onClick={handleRescan}>
                        {scanning ? <Loader2 size={10} className="mr-1 animate-spin" /> : <RefreshCw size={10} className="mr-1" />}{scanning ? 'SCANNING' : 'RESCAN'}
                      </button>
                      <button className="brutal-btn brutal-btn-sm" onClick={() => usePlayerStore.getState().setCurrentTab('search')}><Filter size={10} className="mr-1" />FILTER</button>
                    </div>
                  </div>
                  <div className="hidden md:flex items-center justify-between mb-2">
                    <h2 className="text-xs font-extrabold uppercase tracking-widest text-foreground">
                      {filteredSongs.length === songs.length ? 'ALL TRACKS' : 'FILTERED'}
                      <span className="text-foreground/20 ml-2">[{filteredSongs.length}]</span>
                    </h2>
                    <button className="brutal-btn brutal-btn-sm" disabled={scanning} onClick={handleRescan}>
                      {scanning ? <Loader2 size={10} className="mr-1 animate-spin" /> : <RefreshCw size={10} className="mr-1" />}{scanning ? 'SCANNING' : 'RESCAN DISK'}
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pb-[calc(96px+env(safe-area-inset-bottom,0px))] md:pb-20"><TrackList /></div>
                </motion.div>
              )}

              {currentTab === 'search' && (
                <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                  <div className="md:hidden mb-1.5 px-1">
                    <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-foreground">SEARCH &amp; FILTER</h2>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pb-[calc(96px+env(safe-area-inset-bottom,0px))] md:pb-20"><TrackList /></div>
                </motion.div>
              )}

              {currentTab === 'playlists' && (
                <motion.div key="playlists" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                  <div className="md:hidden mb-1.5 px-1">
                    <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-foreground">PLAYLISTS</h2>
                  </div>
                  <PlaylistPanel />
                </motion.div>
              )}

              {currentTab === 'upload' && (
                <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="h-full flex flex-col">
                  <div className="mb-2 px-1">
                    <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-foreground">UPLOAD</h2>
                    <p className="brutal-label mt-0.5">METADATA EXTRACTED AUTOMATICALLY</p>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scroll pb-[calc(96px+env(safe-area-inset-bottom,0px))] md:pb-20"><UploadZone /></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      <Player />
      <LyricsDrawer />
      <QueueDrawer />
      <KeyboardShortcuts />
      <MobileNav />
      <AddToPlaylistDialog />
      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      <AppToaster />
    </div>
  );
}