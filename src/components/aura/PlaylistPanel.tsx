'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePlayerStore } from '@/store/player-store';
import { fetchPlaylists, fetchPlaylist, createPlaylist, deletePlaylist, removeSongFromPlaylist, updatePlaylist, type Playlist, type Song } from '@/lib/music-api';
import { useAuthStore } from '@/store/auth-store';
import AdminCodeDialog from './AdminCodeDialog';
import { appToast as toast } from '@/components/ui/AppToaster';
import { ListMusic, Plus, Trash2, ChevronRight, Play, X, Disc3, Clock, Pencil, Check, Search, Globe, Lock, Settings2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import TrackList from './TrackList';

function isPlaylistOwner(playlist: Playlist, uid?: string | null): boolean {
  return !!uid && !!playlist.user_id && playlist.user_id === uid;
}

function PlaylistSettingsDialog({ playlist, onClose }: { playlist: Playlist; onClose: () => void }) {
  const { updatePlaylistInStore } = usePlayerStore();
  const user = useAuthStore(s => s.user);
  const [name, setName] = useState(playlist.name);
  const [desc, setDesc] = useState(playlist.description || '');
  const [isPublic, setIsPublic] = useState(!!playlist.is_public);
  const [adminCode, setAdminCode] = useState('');
  const [saving, setSaving] = useState(false);
  const owner = isPlaylistOwner(playlist, user?.uid);
  const needsCode = !owner;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const code = needsCode ? adminCode || undefined : undefined;
      await updatePlaylist(playlist.id, { name: name.trim(), description: desc, is_public: isPublic ? 1 : 0 }, code);
      updatePlaylistInStore(playlist.id, { name: name.trim(), description: desc, is_public: isPublic ? 1 : 0 });
      toast.success('PLAYLIST UPDATED');
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${playlist.name}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const code = needsCode ? adminCode || undefined : undefined;
      await deletePlaylist(playlist.id, code);
      usePlayerStore.getState().removePlaylist(playlist.id);
      toast.success('PLAYLIST DELETED');
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    }
    setSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 300, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-sm mx-4 p-5"
        style={{ background: 'var(--dialog-bg)', border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-foreground">PLAYLIST SETTINGS</p>
            <p className="text-[9px] text-foreground/20 uppercase tracking-widest mt-0.5 truncate max-w-[240px]">{playlist.name}</p>
          </div>
          <button className="text-foreground/30 hover:text-foreground p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name..."
            className="w-full px-3 py-2 bg-foreground/5 text-foreground text-[11px] uppercase tracking-wide placeholder:text-foreground/15 outline-none"
            style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
          />
          <input
            type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 bg-foreground/5 text-[11px] uppercase text-foreground/60 placeholder:text-foreground/15 outline-none"
            style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
          />

          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5">VISIBILITY</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setIsPublic(false)}
                className={`py-2 text-[10px] uppercase font-bold tracking-wider transition-all ${!isPublic ? 'text-foreground' : 'text-foreground/30 hover:text-foreground/50'}`}
                style={{ border: !isPublic ? '1px solid var(--accent)' : '1px solid rgb(var(--rgb-foreground) / 0.1)', background: !isPublic ? 'rgb(var(--rgb-accent) / 0.12)' : 'transparent' }}
              >
                <Lock size={10} className="mr-1 inline" />PRIVATE
              </button>
              <button
                onClick={() => setIsPublic(true)}
                className={`py-2 text-[10px] uppercase font-bold tracking-wider transition-all ${isPublic ? 'text-foreground' : 'text-foreground/30 hover:text-foreground/50'}`}
                style={{ border: isPublic ? '1px solid var(--accent)' : '1px solid rgb(var(--rgb-foreground) / 0.1)', background: isPublic ? 'rgb(var(--rgb-accent) / 0.12)' : 'transparent' }}
              >
                <Globe size={10} className="mr-1 inline" />PUBLIC
              </button>
            </div>
            <p className="text-[8px] text-foreground/15 uppercase tracking-widest mt-1.5">PUBLIC PLAYLISTS ARE VISIBLE TO ALL USERS</p>
          </div>

          {needsCode && (
            <input
              type="password" value={adminCode} onChange={(e) => setAdminCode(e.target.value)}
              placeholder="Admin code"
              className="w-full px-3 py-2 bg-foreground/5 text-foreground text-[10px] uppercase tracking-wide placeholder:text-foreground/15 outline-none"
              style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
            />
          )}

          <div className="flex gap-2 pt-1">
            <button
              className="flex-1 py-2 text-[10px] uppercase font-bold tracking-wider text-foreground/40 hover:text-foreground/60 transition-colors"
              style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
              onClick={onClose}
            >
              CANCEL
            </button>
            <button
              className="flex-1 py-2 text-[10px] uppercase font-bold tracking-wider text-foreground transition-all disabled:opacity-30"
              style={{ border: '1px solid var(--accent)', background: 'rgb(var(--rgb-accent) / 0.15)' }}
              onClick={handleSave}
              disabled={!name.trim() || saving || (needsCode && !adminCode)}
            >
              {saving ? 'SAVING...' : 'SAVE'}
            </button>
          </div>
          <button
            onClick={handleDelete}
            disabled={saving || (needsCode && !adminCode)}
            className="w-full py-2 text-[10px] uppercase font-bold tracking-widest text-(--accent)/70 hover:text-(--accent) transition-colors"
            style={{ border: '1px solid rgb(var(--rgb-accent) / 0.3)' }}
          >
            DELETE PLAYLIST
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PlaylistCard({ playlist, onOpen }: { playlist: Playlist; onOpen: (id: string) => void }) {
  const user = useAuthStore(s => s.user);
  const [showSettings, setShowSettings] = useState(false);
  const owner = isPlaylistOwner(playlist, user?.uid);
  const isPublic = !!playlist.is_public;
  const canManage = owner || !playlist.user_id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      className="group flex items-center gap-3 px-3 py-3 cursor-pointer border-l-2 border-transparent hover:border-foreground/15 hover:bg-foreground/[0.03] transition-all"
      onClick={() => onOpen(playlist.id)}
    >
      <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.08)', background: 'var(--art-bg)' }}>
        <ListMusic size={14} className="text-foreground/15" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[11px] font-bold text-foreground/70 truncate uppercase tracking-wide">{playlist.name}</p>
          {isPublic ? (
            <span className="flex items-center gap-0.5 text-[7px] uppercase font-bold tracking-widest text-(--accent)/80 flex-shrink-0" style={{ border: '1px solid rgb(var(--rgb-accent) / 0.35)', padding: '1px 4px' }}>
              <Globe size={7} />PUBLIC
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-[7px] uppercase font-bold tracking-widest text-foreground/20 flex-shrink-0" style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)', padding: '1px 4px' }}>
              <Lock size={7} />PRIVATE
            </span>
          )}
        </div>
        <p className="text-[9px] text-foreground/20 uppercase tracking-wider mt-0.5 truncate">
          {playlist.song_count} {playlist.song_count === 1 ? 'TRACK' : 'TRACKS'}
          {!owner && playlist.owner_name ? ` // BY ${playlist.owner_name.toUpperCase()}` : ''}
          {playlist.description ? ` // ${playlist.description}` : ''}
        </p>
      </div>
      {canManage && (
        <button
          className="h-7 w-7 flex items-center justify-center text-foreground/8 opacity-0 group-hover:opacity-100 hover:text-foreground/60 transition-all flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
        >
          <Settings2 size={12} />
        </button>
      )}
      <ChevronRight size={12} className="text-foreground/8 group-hover:text-foreground/25 flex-shrink-0" />

      <AnimatePresence>
        {showSettings && <PlaylistSettingsDialog playlist={playlist} onClose={() => setShowSettings(false)} />}
      </AnimatePresence>
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
        style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-foreground">NEW PLAYLIST</p>
          <button className="text-foreground/30 hover:text-foreground" onClick={() => setShowCreatePlaylist(false)}><X size={16} /></button>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Playlist name..."
          autoFocus
          className="w-full px-3 py-2.5 bg-foreground/5 text-foreground text-[11px] uppercase tracking-wide placeholder:text-foreground/15 outline-none mb-4"
          style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
        />
        <div className="flex gap-2">
          <button
            className="flex-1 py-2 text-[10px] uppercase font-bold tracking-wider text-foreground/40 hover:text-foreground/60 transition-colors"
            style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
            onClick={() => setShowCreatePlaylist(false)}
          >
            CANCEL
          </button>
          <button
            className="flex-1 py-2 text-[10px] uppercase font-bold tracking-wider text-foreground transition-all disabled:opacity-30"
            style={{ border: '1px solid var(--accent)', background: 'rgb(var(--rgb-accent) / 0.15)' }}
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
  const user = useAuthStore(s => s.user);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [adminAction, setAdminAction] = useState<{ kind: 'remove-song'; songId: string } | { kind: 'rename' } | null>(null);
  const owner = isPlaylistOwner(playlist, user?.uid);
  const canEdit = owner || !playlist?.user_id;

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
    playSong(playlist.songs[0], playlist.songs, true);
  };

  const handleRemoveSong = async (songId: string) => {
    const { user } = useAuthStore.getState();
    if (!user) {
      toast.error('SIGN IN REQUIRED');
      useAuthStore.getState().openAuthModal();
      return;
    }
    if (!playlist?.user_id) {
      setAdminAction({ kind: 'remove-song', songId });
      return;
    }
    if (playlist.user_id !== user.uid) {
      toast.error('YOU CAN ONLY EDIT YOUR OWN PLAYLISTS');
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
    if (!playlist?.user_id) {
      setAdminAction({ kind: 'rename' });
      return;
    }
    if (playlist.user_id !== user.uid) {
      toast.error('YOU CAN ONLY EDIT YOUR OWN PLAYLISTS');
      return;
    }
    try {
      await updatePlaylist(playlistId, { name: editName.trim(), description: editDesc.trim() });
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
          <div className="w-20 h-3 bg-foreground/4" />
        </div>
        <div className="space-y-2 p-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <div className="w-10 h-10 bg-foreground/4" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 bg-foreground/4" />
                <div className="h-2 w-1/3 bg-foreground/4" />
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
        <button className="text-foreground/30 hover:text-foreground text-[10px] uppercase font-bold tracking-wider flex items-center gap-1" onClick={onBack}>
          <X size={12} />BACK
        </button>
      </div>

      {/* Playlist header */}
      <div className="px-1 mb-3">
        {isEditing ? (
          <div className="space-y-2">
            <input
              type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              className="w-full px-2 py-1.5 bg-foreground/5 text-[12px] font-extrabold uppercase tracking-wide text-foreground placeholder:text-foreground/15 outline-none"
              style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.15)' }}
              autoFocus
            />
            <input
              type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-2 py-1.5 bg-foreground/5 text-[10px] uppercase text-foreground/50 placeholder:text-foreground/10 outline-none"
              style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.08)' }}
            />
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-[9px] uppercase font-bold text-foreground/40 hover:text-foreground" style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }} onClick={() => setIsEditing(false)}>CANCEL</button>
              <button className="px-3 py-1.5 text-[9px] uppercase font-bold text-foreground" style={{ border: '1px solid var(--accent)', background: 'rgb(var(--rgb-accent) / 0.15)' }} onClick={handleRename}>SAVE</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-foreground">{playlist?.name || 'Unknown'}</h2>
              {playlist?.description && <p className="text-[9px] text-foreground/25 uppercase tracking-wider mt-0.5">{playlist.description}</p>}
              {playlist?.is_public && (
                <p className="text-[8px] text-(--accent)/80 uppercase tracking-widest mt-0.5 flex items-center gap-1"><Globe size={8} />PUBLIC {playlist.owner_name ? `// BY ${playlist.owner_name.toUpperCase()}` : ''}</p>
              )}
            </div>
            {canEdit && (
              <button className="h-7 w-7 flex items-center justify-center text-foreground/15 hover:text-foreground/50" onClick={startEditing}>
                <Pencil size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats + Play button */}
      {playlist && (
        <div className="flex items-center gap-4 px-1 mb-3">
          <button
            className="h-8 px-3 flex items-center gap-1.5 text-[10px] uppercase font-bold text-foreground hover:text-(--accent) transition-colors"
            style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.2)', background: 'rgb(var(--rgb-foreground) / 0.04)' }}
            onClick={handlePlayAll}
          >
            <Play size={11} fill="currentColor" />PLAY ALL
          </button>
          <div className="flex items-center gap-3 text-[9px] text-foreground/15 uppercase tracking-wider">
            <span className="flex items-center gap-1"><Disc3 size={9} />{playlist.songs?.length || 0} TRACKS</span>
            <span className="flex items-center gap-1"><Clock size={9} />{Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}</span>
          </div>
        </div>
      )}

      {/* Track list */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pb-24 md:pb-20">
        <TrackList
          songs={playlist?.songs}
          queueOverride={playlist?.songs}
          onRemoveSong={canEdit ? handleRemoveSong : undefined}
          showRemove={canEdit}
          emptyText="NO TRACKS YET"
        />
      </div>

      <AdminCodeDialog
        open={!!adminAction}
        onClose={() => setAdminAction(null)}
        title={adminAction?.kind === 'rename' ? `ADMIN RENAME: ${playlist?.name || ''}` : 'ADMIN REMOVE TRACK'}
        description={adminAction?.kind === 'rename' ? 'YOU ARE NOT THE OWNER OF THIS PLAYLIST' : 'YOU CAN ONLY REMOVE TRACKS FROM YOUR OWN PLAYLISTS'}
        onSubmit={async (code) => {
          if (!adminAction) return;
          if (adminAction.kind === 'rename') {
            await updatePlaylist(playlistId, { name: editName.trim(), description: editDesc.trim() }, code);
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
  const { playlists, showCreatePlaylist, setShowCreatePlaylist, activePlaylistId, setActivePlaylistId, playlistQuery, setPlaylistQuery } = usePlayerStore();
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

  const q = playlistQuery.trim().toLowerCase();
  const visible = q ? playlists.filter(p => p.name.toLowerCase().includes(q)) : playlists;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div>
          <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-foreground">PLAYLISTS</h2>
          <p className="brutal-label mt-0.5">{visible.length} COLLECTIONS</p>
        </div>
        <button
          className="brutal-btn brutal-btn-sm flex items-center gap-1"
          onClick={() => setShowCreatePlaylist(true)}
        >
          <Plus size={10} />NEW
        </button>
      </div>

      {/* Mobile search */}
      <div className="md:hidden relative mb-2 px-1">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25" strokeWidth={2} />
        <input
          value={playlistQuery} onChange={(e) => setPlaylistQuery(e.target.value)}
          placeholder="SEARCH PLAYLISTS..."
          className="brutal-input w-full h-9 pl-8 pr-8 text-[11px] font-bold uppercase tracking-wider"
        />
        {playlistQuery && <button onClick={() => setPlaylistQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/25 hover:text-foreground"><X size={12} /></button>}
      </div>

      {/* Playlist list */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pb-24 md:pb-20">
        {loading ? (
          <div className="space-y-1 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-3">
                <div className="w-10 h-10 bg-foreground/4" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 bg-foreground/4" />
                  <div className="h-2 w-1/4 bg-foreground/4" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4" style={{ border: '1px dashed rgb(var(--rgb-foreground) / 0.08)' }}>
            <ListMusic size={24} className="text-foreground/6 mb-2" strokeWidth={1} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/15">{q ? 'NO PLAYLISTS MATCH' : 'NO PLAYLISTS'}</p>
            <p className="text-[9px] text-foreground/8 uppercase tracking-widest mt-1">{q ? 'TRY A DIFFERENT NAME' : 'CREATE ONE TO GET STARTED'}</p>
          </div>
        ) : (
          <AnimatePresence>
            {visible.map(pl => (
              <PlaylistCard key={pl.id} playlist={pl} onOpen={(id) => setActivePlaylistId(id)} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Create dialog */}
      <AnimatePresence>
        {showCreatePlaylist && <CreatePlaylistDialog />}
      </AnimatePresence>
    </div>
  );
}
