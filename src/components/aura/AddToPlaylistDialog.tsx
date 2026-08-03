'use client';
import { useState } from 'react';
import { usePlayerStore } from '@/store/player-store';
import { addSongToPlaylist, createPlaylist, type Playlist } from '@/lib/music-api';
import { appToast as toast } from '@/components/ui/AppToaster';
import { useAuthStore } from '@/store/auth-store';
import { X, Plus, ListMusic, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchPlaylists } from '@/lib/music-api';

export default function AddToPlaylistDialog() {
  const { playlists, showAddToPlaylist, setShowAddToPlaylist, addToPlaylistSongId, setPlaylists } = usePlayerStore();
  const user = useAuthStore(s => s.user);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const ownPlaylists = playlists.filter(pl => user?.uid && pl.user_id === user.uid);

  const handleAdd = async (playlistId: string) => {
    if (!addToPlaylistSongId) return;
    if (!useAuthStore.getState().user) {
      toast.error('SIGN IN REQUIRED');
      useAuthStore.getState().openAuthModal();
      return;
    }
    setAddingTo(playlistId);
    try {
      await addSongToPlaylist(playlistId, addToPlaylistSongId);
      toast.success('ADDED TO PLAYLIST');
      // Refresh playlist counts
      const pls = await fetchPlaylists();
      setPlaylists(pls);
      setShowAddToPlaylist(false);
      setAddToPlaylistSongId(null);
    } catch (err: any) {
      toast.error(err.message);
    }
    setAddingTo(null);
  };

  const handleCreateAndAdd = async () => {
    if (!newName.trim() || !addToPlaylistSongId) return;
    if (!useAuthStore.getState().user) {
      toast.error('SIGN IN REQUIRED');
      useAuthStore.getState().openAuthModal();
      return;
    }
    setCreating(true);
    try {
      const pl = await createPlaylist(newName.trim());
      await addSongToPlaylist(pl.id, addToPlaylistSongId);
      usePlayerStore.getState().addPlaylist(pl);
      toast.success('PLAYLIST CREATED & SONG ADDED');
      setShowAddToPlaylist(false);
      setAddToPlaylistSongId(null);
      setShowNew(false);
      setNewName('');
    } catch (err: any) {
      toast.error(err.message);
    }
    setCreating(false);
  };

  if (!showAddToPlaylist) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={() => { setShowAddToPlaylist(false); setAddToPlaylistSongId(null); setShowNew(false); }}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        className="glass-panel w-full max-w-sm mx-0 sm:mx-4 sm:rounded-lg rounded-t-lg overflow-hidden"
        style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)', maxHeight: '70vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgb(var(--rgb-foreground) / 0.06)' }}>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-foreground">ADD TO PLAYLIST</p>
          <button className="text-foreground/30 hover:text-foreground" onClick={() => { setShowAddToPlaylist(false); setAddToPlaylistSongId(null); setShowNew(false); }}>
            <X size={16} />
          </button>
        </div>

        {/* New playlist form or playlist list */}
        {showNew ? (
          <div className="p-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateAndAdd()}
              placeholder="New playlist name..."
              autoFocus
              className="w-full px-3 py-2.5 bg-foreground/5 text-foreground text-[11px] uppercase tracking-wide placeholder:text-foreground/15 outline-none mb-3"
              style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
            />
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 text-[10px] uppercase font-bold tracking-wider text-foreground/40 hover:text-foreground/60"
                style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
                onClick={() => setShowNew(false)}
              >
                CANCEL
              </button>
              <button
                className="flex-1 py-2 text-[10px] uppercase font-bold tracking-wider text-foreground disabled:opacity-30"
                style={{ border: '1px solid var(--accent)', background: 'rgb(var(--rgb-accent) / 0.15)' }}
                onClick={handleCreateAndAdd}
                disabled={!newName.trim() || creating}
              >
                {creating ? 'CREATING...' : 'CREATE & ADD'}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto custom-scroll">
            {/* Create new button */}
            <button
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-foreground/[0.03] transition-colors"
              style={{ borderBottom: '1px solid rgb(var(--rgb-foreground) / 0.04)' }}
              onClick={() => setShowNew(true)}
            >
              <div className="w-8 h-8 flex items-center justify-center" style={{ border: '1px dashed rgb(var(--rgb-foreground) / 0.15)' }}>
                <Plus size={12} className="text-foreground/30" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/40">CREATE NEW PLAYLIST</span>
            </button>

            {/* Existing playlists */}
            {ownPlaylists.length === 0 ? (
              <div className="py-8 flex flex-col items-center">
                <ListMusic size={20} className="text-foreground/6 mb-2" strokeWidth={1} />
                <p className="text-[9px] text-foreground/15 uppercase tracking-widest">NO PLAYLISTS YET</p>
              </div>
            ) : (
              ownPlaylists.map(pl => (
                <button
                  key={pl.id}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-foreground/[0.03] transition-colors disabled:opacity-50"
                  style={{ borderBottom: '1px solid rgb(var(--rgb-foreground) / 0.04)' }}
                  onClick={() => handleAdd(pl.id)}
                  disabled={addingTo !== null}
                >
                  <div className="w-8 h-8 flex items-center justify-center" style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.08)', background: 'var(--art-bg)' }}>
                    {addingTo === pl.id ? (
                      <div className="w-3 h-3 border border-foreground/40 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ListMusic size={11} className="text-foreground/20" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[11px] font-bold text-foreground/60 truncate uppercase tracking-wide">{pl.name}</p>
                    <p className="text-[9px] text-foreground/20 uppercase">{pl.song_count} {pl.song_count === 1 ? 'TRACK' : 'TRACKS'}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}