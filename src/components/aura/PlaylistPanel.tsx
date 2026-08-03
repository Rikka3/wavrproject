'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePlayerStore } from '@/store/player-store';
import { fetchPlaylists, fetchPlaylist, createPlaylist, deletePlaylist, removeSongFromPlaylist, updatePlaylist, type Playlist, type Song } from '@/lib/music-api';
import { useAuthStore } from '@/store/auth-store';
import AdminCodeDialog from './AdminCodeDialog';
import { appToast as toast } from '@/components/ui/AppToaster';
import { ListMusic, Plus, Trash2, ChevronRight, Play, X, Disc3, Clock, Pencil, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import TrackList from './TrackList';

function PlaylistCard({ playlist, onOpen }: { playlist: Playlist; onOpen: (id: string) => void }) {
  const [adminTarget, setAdminTarget] = useState<Playlist | null>(null);
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { user } = useAuthStore.getState();
    if (!user) {
      toast.error('SIGN IN REQUIRED');
      useAuthStore.getState().openAuthModal();
      return;
    }
    if (playlist.user_id && playlist.user_id === user.uid) {
      if (!confirm(`Delete "${playlist.name}"? This cannot be undone.`)) return;
      try {
        await deletePlaylist(playlist.id);
        usePlayerStore.getState().removePlaylist(playlist.id);
        toast.success('PLAYLIST DELETED');
      } catch (err: any) {
        toast.error(err.message);
      }
    } else {
      setAdminTarget(playlist);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      className="group flex items-center gap-3 px-3 py-3 cursor-pointer border-l-2 border-transparent hover:border-white/15 hover:bg-white/[0.03] transition-all"
      onClick={() => onOpen(playlist.id)}
    >
      <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)' }}>
        <ListMusic size={14} className="text-white/15" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-white/70 truncate uppercase tracking-wide">{playlist.name}</p>
        <p className="text-[9px] text-white/20 uppercase tracking-wider mt-0.5">
          {playlist.song_count} {playlist.song_count === 1 ? 'TRACK' : 'TRACKS'}
          {playlist.description ? ` // ${playlist.description}` : ''}
        </p>
      </div>
      <button
        className="h-7 w-7 flex items-center justify-center text-white/8 opacity-0 group-hover:opacity-100 hover:text-[#FF2D2D] transition-all flex-shrink-0"
        onClick={handleDelete}
      >
        <Trash2 size={12} />
      </button>
      <ChevronRight size={12} className="text-white/8 group-hover:text-white/25 flex-shrink-0" />

      <AdminCodeDialog
        open={!!adminTarget}
        onClose={() => setAdminTarget(null)}
        title={`ADMIN DELETE: ${adminTarget?.name || ''}`}
        description="YOU ARE NOT THE OWNER OF THIS PLAYLIST"
        onSubmit={async (code) => {
          if (!adminTarget) return;
          await deletePlaylist(adminTarget.id, code);
          usePlayerStore.getState().removePlaylist(adminTarget.id);
          toast.success('PLAYLIST DELETED');
        }}
      />
    </motion.div>
  );
}

function CreatePlaylistDialog() {
  const { setShowCreatePlaylist, addPlaylist } = usePlayerStore();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (!useAuthStore.getState().user) {
      toast.error('SIGN IN REQUIRED');
      useAuthStore.getState().openAuthModal();
      return;
    }
    setCreating(true);
    try {
      const pl = await createPlaylist(name.trim());
      addPlaylist(pl);
      toast.success('PLAYLIST CREATED');
      setShowCreatePlaylist(false);
    } catch (err: any) {
      toast.error(err.message);
    }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="glass-panel p-5 w-full max-w-sm mx-4"
        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-white">NEW PLAYLIST</p>
          <button className="text-white/30 hover:text-white" onClick={() => setShowCreatePlaylist(false)}><X size={16} /></button>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Playlist name..."
          autoFocus
          className="w-full px-3 py-2.5 bg-white/5 text-white text-[11px] uppercase tracking-wide placeholder:text-white/15 outline-none mb-4"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        />
        <div className="flex gap-2">
          <button
            className="flex-1 py-2 text-[10px] uppercase font-bold tracking-wider text-white/40 hover:text-white/60 transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={() => setShowCreatePlaylist(false)}
          >
            CANCEL
          </button>
          <button
            className="flex-1 py-2 text-[10px] uppercase font-bold tracking-wider text-white transition-all disabled:opacity-30"
            style={{ border: '1px solid #FF2D2D', background: 'rgba(255,45,45,0.15)' }}
            onClick={handleCreate}
            disabled={!name.trim() || creating}
          >
            {creating ? 'CREATING...' : 'CREATE'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PlaylistDetailView({ playlistId, onBack }: { playlistId: string; onBack: () => void }) {
  const { playlists, isPlaylistLoading, setIsPlaylistLoading, updatePlaylistInStore, playSong } = usePlayerStore();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [adminAction, setAdminAction] = useState<{ kind: 'remove-song'; songId: string } | { kind: 'rename' } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsPlaylistLoading(true);
    (async () => {
      try {
        const pl = await fetchPlaylist(playlistId);
        if (!cancelled) setPlaylist(pl);
      } catch (err: any) {
        if (!cancelled) { toast.error(err.message); onBack(); }
      }
      if (!cancelled) setIsPlaylistLoading(false);
    })();
    return () => { cancelled = true; };
  }, [playlistId]);

  const refreshPlaylist = useCallback(async () => {
    try {
      const pl = await fetchPlaylist(playlistId);
      setPlaylist(pl);
    } catch (err: any) { toast.error(err.message); }
  }, [playlistId]);

  const handlePlayAll = () => {
    if (!playlist?.songs?.length) return;
    playSong(playlist.songs[0], playlist.songs);
  };

  const handleRemoveSong = async (songId: string) => {
    const { user } = useAuthStore.getState();
    if (!user) {
      toast.error('SIGN IN REQUIRED');
      useAuthStore.getState().openAuthModal();
      return;
    }
    if (!playlist?.user_id || playlist.user_id !== user.uid) {
      setAdminAction({ kind: 'remove-song', songId });
      return;
    }
    try {
      await removeSongFromPlaylist(playlistId, songId);
      toast.success('REMOVED FROM PLAYLIST');
      refreshPlaylist(); // Refresh
      // Update playlist count in sidebar list
      const current = playlists.find(p => p.id === playlistId);
      if (current) {
        updatePlaylistInStore(playlistId, { song_count: Math.max(0, current.song_count - 1) });
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRename = async () => {
    if (!editName.trim()) return;
    const { user } = useAuthStore.getState();
    if (!user) {
      toast.error('SIGN IN REQUIRED');
      useAuthStore.getState().openAuthModal();
      return;
    }
    if (!playlist?.user_id || playlist.user_id !== user.uid) {
      setAdminAction({ kind: 'rename' });
      return;
    }
    try {
      await updatePlaylist(playlistId, editName.trim(), editDesc.trim());
      setPlaylist(prev => prev ? { ...prev, name: editName.trim(), description: editDesc.trim() } : null);
      updatePlaylistInStore(playlistId, { name: editName.trim(), description: editDesc.trim() });
      toast.success('PLAYLIST UPDATED');
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const startEditing = () => {
    if (!playlist) return;
    setEditName(playlist.name);
    setEditDesc(playlist.description);
    setIsEditing(true);
  };

  const totalDuration = playlist?.songs?.reduce((acc, s) => acc + (s.duration || 0), 0) || 0;

  if (isPlaylistLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-1 mb-3">
          <div className="w-20 h-3 bg-white/4" />
        </div>
        <div className="space-y-2 p-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <div className="w-10 h-10 bg-white/4" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 bg-white/4" />
                <div className="h-2 w-1/3 bg-white/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Back button + title */}
      <div className="flex items-center gap-2 px-1 mb-2">
        <button className="text-white/30 hover:text-white text-[10px] uppercase font-bold tracking-wider flex items-center gap-1" onClick={onBack}>
          <X size={12} />BACK
        </button>
      </div>

      {/* Playlist header */}
      <div className="px-1 mb-3">
        {isEditing ? (
          <div className="space-y-2">
            <input
              type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              className="w-full px-2 py-1.5 bg-white/5 text-[12px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/15 outline-none"
              style={{ border: '1px solid rgba(255,255,255,0.15)' }}
              autoFocus
            />
            <input
              type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-2 py-1.5 bg-white/5 text-[10px] uppercase text-white/50 placeholder:text-white/10 outline-none"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-[9px] uppercase font-bold text-white/40 hover:text-white" style={{ border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => setIsEditing(false)}>CANCEL</button>
              <button className="px-3 py-1.5 text-[9px] uppercase font-bold text-white" style={{ border: '1px solid #FF2D2D', background: 'rgba(255,45,45,0.15)' }} onClick={handleRename}>SAVE</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-white">{playlist?.name || 'Unknown'}</h2>
              {playlist?.description && <p className="text-[9px] text-white/25 uppercase tracking-wider mt-0.5">{playlist.description}</p>}
            </div>
            <button className="h-7 w-7 flex items-center justify-center text-white/15 hover:text-white/50" onClick={startEditing}>
              <Pencil size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Stats + Play button */}
      {playlist && (
        <div className="flex items-center gap-4 px-1 mb-3">
          <button
            className="h-8 px-3 flex items-center gap-1.5 text-[10px] uppercase font-bold text-white hover:text-[#FF2D2D] transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.04)' }}
            onClick={handlePlayAll}
          >
            <Play size={11} fill="currentColor" />PLAY ALL
          </button>
          <div className="flex items-center gap-3 text-[9px] text-white/15 uppercase tracking-wider">
            <span className="flex items-center gap-1"><Disc3 size={9} />{playlist.songs?.length || 0} TRACKS</span>
            <span className="flex items-center gap-1"><Clock size={9} />{Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}</span>
          </div>
        </div>
      )}

      {/* Track list */}
      <ScrollArea className="flex-1 custom-scroll pb-24 md:pb-20">
        <TrackList
          songs={playlist?.songs}
          queueOverride={playlist?.songs}
          onRemoveSong={handleRemoveSong}
          showRemove={true}
          emptyText="NO TRACKS YET"
        />
      </ScrollArea>

      <AdminCodeDialog
        open={!!adminAction}
        onClose={() => setAdminAction(null)}
        title={adminAction?.kind === 'rename' ? `ADMIN RENAME: ${playlist?.name || ''}` : 'ADMIN REMOVE TRACK'}
        description={adminAction?.kind === 'rename' ? 'YOU ARE NOT THE OWNER OF THIS PLAYLIST' : 'YOU CAN ONLY REMOVE TRACKS FROM YOUR OWN PLAYLISTS'}
        onSubmit={async (code) => {
          if (!adminAction) return;
          if (adminAction.kind === 'rename') {
            await updatePlaylist(playlistId, editName.trim(), editDesc.trim(), code);
            setPlaylist(prev => prev ? { ...prev, name: editName.trim(), description: editDesc.trim() } : null);
            updatePlaylistInStore(playlistId, { name: editName.trim(), description: editDesc.trim() });
            toast.success('PLAYLIST UPDATED');
            setIsEditing(false);
          } else {
            await removeSongFromPlaylist(playlistId, adminAction.songId, code);
            toast.success('REMOVED FROM PLAYLIST');
            refreshPlaylist();
            const current = playlists.find(p => p.id === playlistId);
            if (current) {
              updatePlaylistInStore(playlistId, { song_count: Math.max(0, current.song_count - 1) });
            }
          }
        }}
      />
    </div>
  );
}

export default function PlaylistPanel() {
  const { playlists, showCreatePlaylist, setShowCreatePlaylist, activePlaylistId, setActivePlaylistId } = usePlayerStore();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const pls = await fetchPlaylists();
        if (!cancelled) usePlayerStore.getState().setPlaylists(pls);
      } catch (err) { console.error('Failed to load playlists:', err); }
      if (!cancelled) { setLoading(false); setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [loaded]);

  if (activePlaylistId) {
    return <PlaylistDetailView playlistId={activePlaylistId} onBack={() => setActivePlaylistId(null)} />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div>
          <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-white">PLAYLISTS</h2>
          <p className="brutal-label mt-0.5">{playlists.length} COLLECTIONS</p>
        </div>
        <button
          className="brutal-btn brutal-btn-sm flex items-center gap-1"
          onClick={() => setShowCreatePlaylist(true)}
        >
          <Plus size={10} />NEW
        </button>
      </div>

      {/* Playlist list */}
      <ScrollArea className="flex-1 custom-scroll pb-24 md:pb-20">
        {loading ? (
          <div className="space-y-1 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-3">
                <div className="w-10 h-10 bg-white/4" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 bg-white/4" />
                  <div className="h-2 w-1/4 bg-white/4" />
                </div>
              </div>
            ))}
          </div>
        ) : playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
            <ListMusic size={24} className="text-white/6 mb-2" strokeWidth={1} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/15">NO PLAYLISTS</p>
            <p className="text-[9px] text-white/8 uppercase tracking-widest mt-1">CREATE ONE TO GET STARTED</p>
          </div>
        ) : (
          <AnimatePresence>
            {playlists.map(pl => (
              <PlaylistCard key={pl.id} playlist={pl} onOpen={(id) => setActivePlaylistId(id)} />
            ))}
          </AnimatePresence>
        )}
      </ScrollArea>

      {/* Create dialog */}
      <AnimatePresence>
        {showCreatePlaylist && <CreatePlaylistDialog />}
      </AnimatePresence>
    </div>
  );
}
