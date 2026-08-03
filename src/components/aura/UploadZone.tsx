'use client';
import { useState, useCallback, useRef } from 'react';
import { Upload, Music, CheckCircle, AlertCircle, ListPlus, Plus, X, Loader2, Check, Copy, AlertTriangle } from 'lucide-react';
import { uploadSongWithProgress, fetchPlaylists, createPlaylist, batchAddSongsToPlaylist, type Playlist } from '@/lib/music-api';
import { usePlayerStore } from '@/store/player-store';
import { useAuthStore } from '@/store/auth-store';
import { appToast as toast } from '@/components/ui/AppToaster';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadResult {
  file: string;
  status: 'uploading' | 'success' | 'error' | 'duplicate';
  progress?: number;
  error?: string;
  song?: any;
  selected?: boolean;
  warning?: string;
}

export default function UploadZone() {
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const [newPlaylistMode, setNewPlaylistMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addSong } = usePlayerStore();

  const selectedSongIds = results.filter(r => r.selected && r.song && r.status === 'success').map(r => r.song!.id);
  const selectedCount = selectedSongIds.length;
  const successCount = results.filter(r => r.status === 'success' && r.song).length;
  const dupCount = results.filter(r => r.status === 'duplicate').length;

  const loadPlaylists = useCallback(async () => {
    try {
      const pls = await fetchPlaylists();
      setPlaylists(pls);
      usePlayerStore.getState().setPlaylists(pls);
    } catch {}
  }, []);

  const resultsRef = useRef(results);
  resultsRef.current = results;

  const processFiles = async (files: FileList | File[]) => {
    if (!useAuthStore.getState().user) {
      toast.error('SIGN IN REQUIRED TO UPLOAD');
      useAuthStore.getState().openAuthModal();
      return;
    }
    const exts = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'opus', 'webm'];
    const valid = Array.from(files).filter(f => exts.includes(f.name.split('.').pop()?.toLowerCase() || ''));
    if (!valid.length) { toast.error('NO SUPPORTED FILES'); return; }
    setUploading(true);
    const baseIdx = resultsRef.current.length;
    const newResults: UploadResult[] = valid.map(f => ({ file: f.name, status: 'uploading' as const, selected: true, progress: 0 }));
    setResults(prev => [...prev, ...newResults]);

    const setResult = (i: number, patch: Partial<UploadResult>) => {
      setResults(prev => prev.map((r, j) => j === baseIdx + i ? { ...r, ...patch } : r));
    };

    const CONCURRENCY = 3;
    let next = 0;
    const worker = async () => {
      while (next < valid.length) {
        const i = next++;
        try {
          const song = await uploadSongWithProgress(valid[i], pct => setResult(i, { progress: pct }));
          if ((song as any).duplicate) {
            setResult(i, { status: 'duplicate', song, warning: `Duplicate: ${song.title} by ${song.artist}` });
            if ((song as any).artworkUpdated) {
              toast.success(`ARTWORK UPDATED: ${song.title}`);
              try {
                const { fetchSongs } = await import('@/lib/music-api');
                const res = await fetchSongs();
                usePlayerStore.getState().setSongs(res.songs);
              } catch {}
            } else {
              toast.warning(`DUPLICATE SKIPPED: ${song.title}`);
            }
          } else {
            setResult(i, { status: 'success', song });
            addSong(song as any);
            toast.success(`ADDED: ${song.title}`);
          }
        } catch (e: any) {
          setResult(i, { status: 'error', error: e.message });
          toast.error(`FAILED: ${valid[i].name}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, valid.length) }, () => worker()));
    setUploading(false);
  };

  const toggleSelect = (index: number) => {
    setResults(prev => prev.map((r, i) => i === index ? { ...r, selected: !r.selected } : r));
  };

  const selectAll = () => setResults(prev => prev.map(r => r.status === 'success' ? { ...r, selected: true } : r));
  const deselectAll = () => setResults(prev => prev.map(r => ({ ...r, selected: false })));

  const handleAddToPlaylist = async () => {
    if (!selectedSongIds.length) { toast.error('NO SONGS SELECTED'); return; }
    if (!useAuthStore.getState().user) {
      toast.error('SIGN IN REQUIRED');
      useAuthStore.getState().openAuthModal();
      return;
    }
    if (newPlaylistMode) {
      if (!playlistName.trim()) { toast.error('ENTER A PLAYLIST NAME'); return; }
      setAddingToPlaylist(true);
      try {
        const pl = await createPlaylist(playlistName.trim(), '', selectedSongIds);
        usePlayerStore.getState().addPlaylist(pl);
        toast.success(`PLAYLIST "${pl.name}" CREATED WITH ${selectedCount} TRACKS`);
        setShowPlaylistPanel(false);
        setPlaylistName('');
        setNewPlaylistMode(false);
        deselectAll();
      } catch (err: any) { toast.error(err.message); }
      setAddingToPlaylist(false);
    } else {
      if (!selectedPlaylistId) { toast.error('SELECT A PLAYLIST'); return; }
      setAddingToPlaylist(true);
      try {
        await batchAddSongsToPlaylist(selectedPlaylistId, selectedSongIds);
        const pls = await fetchPlaylists();
        setPlaylists(pls);
        usePlayerStore.getState().setPlaylists(pls);
        const pl = playlists.find(p => p.id === selectedPlaylistId);
        toast.success(`ADDED ${selectedCount} TRACKS TO "${pl?.name || 'PLAYLIST'}"`);
        setShowPlaylistPanel(false);
        deselectAll();
      } catch (err: any) { toast.error(err.message); }
      setAddingToPlaylist(false);
    }
  };

  const openPlaylistPanel = () => {
    loadPlaylists();
    setShowPlaylistPanel(true);
  };

  const processFilesRef = useRef(processFiles);
  processFilesRef.current = processFiles;

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) processFilesRef.current(e.dataTransfer.files); }, []);
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={`p-8 md:p-12 text-center transition-all ${dragging ? '' : 'hover:border-white/20'}`}
        style={{
          border: `1px dashed ${dragging ? 'rgba(255,45,45,0.6)' : 'rgba(255,255,255,0.1)'}`,
          background: dragging ? 'rgba(255,45,45,0.04)' : 'rgba(18,18,24,0.35)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        }}
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
      >
        <input
          ref={inputRef} type="file" accept="audio/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
        />
        <div className="flex flex-col items-center gap-3">
          <Upload size={28} className={dragging ? 'text-[#FF2D2D]' : 'text-white/10'} strokeWidth={1.5} />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30">DROP FILES HERE</p>
            <p className="text-[9px] uppercase tracking-widest text-white/12 mt-1">MP3 / FLAC / WAV / OGG / M4A</p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="brutal-btn brutal-btn-sm px-6 py-2.5 min-h-[44px]"
          >
            <Music size={14} className="mr-2 inline" strokeWidth={2} />BROWSE FILES
          </button>
        </div>
      </div>

      {/* Duplicate warning banner */}
      <AnimatePresence>
        {dupCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ border: '1px solid rgba(255,170,0,0.2)', background: 'rgba(255,170,0,0.05)' }}>
              <AlertTriangle size={14} className="text-amber-400/60 flex-shrink-0" />
              <p className="text-[10px] text-amber-300/60 uppercase tracking-wider font-bold flex-1">
                {dupCount} DUPLICATE{dupCount !== 1 ? 'S' : ''} DETECTED & SKIPPED
              </p>
              <button onClick={() => setResults(prev => prev.filter(r => r.status !== 'duplicate'))} className="text-white/20 hover:text-white/40">
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload results + playlist actions */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            {/* Actions bar */}
            <div className="flex items-center justify-between px-1 mb-2">
              <div className="flex items-center gap-2">
                <p className="brutal-label">UPLOAD LOG</p>
                <span className="text-[9px] text-white/15 tabular-nums">{successCount} OK / {dupCount} DUP / {results.length} TOTAL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={selectAll} className="text-[9px] text-white/25 hover:text-white/50 uppercase font-bold tracking-wider px-2 py-1" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  SELECT ALL
                </button>
                <button onClick={deselectAll} className="text-[9px] text-white/25 hover:text-white/50 uppercase font-bold tracking-wider px-2 py-1" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  CLEAR
                </button>
              </div>
            </div>

            {/* Song list with checkboxes */}
            <div className="glass-panel-dim p-2 space-y-0.5 max-h-64 overflow-y-auto custom-scroll">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-sm transition-colors ${
                    r.status === 'duplicate' ? 'bg-amber-500/5' :
                    r.selected && r.status === 'success' ? 'bg-white/5' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Checkbox */}
                  {r.status === 'success' ? (
                    <button
                      onClick={() => toggleSelect(i)}
                      className="w-4 h-4 flex-shrink-0 flex items-center justify-center transition-all"
                      style={{ border: r.selected ? '1.5px solid #FF2D2D' : '1.5px solid rgba(255,255,255,0.15)', background: r.selected ? 'rgba(255,45,45,0.2)' : 'transparent' }}
                    >
                      {r.selected && <Check size={10} className="text-[#FF2D2D]" strokeWidth={3} />}
                    </button>
                  ) : (
                    <div className="w-4 h-4 flex-shrink-0" />
                  )}

                  {/* Status icon */}
                  {r.status === 'uploading' && <div className="w-3 h-3 border-2 border-white/20 border-t-white/70 flex-shrink-0" style={{ animation: 'spin 1s linear infinite' }} />}
                  {r.status === 'success' && <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />}
                  {r.status === 'duplicate' && <Copy size={12} className="text-amber-400/60 flex-shrink-0" />}
                  {r.status === 'error' && <AlertCircle size={12} className="text-[#FF2D2D] flex-shrink-0" />}
                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                      r.status === 'duplicate' ? 'text-amber-400/40' :
                      r.status === 'error' ? 'text-[#FF2D2D]/60' :
                      r.selected ? 'text-white/50' : 'text-white/25'
                    }`}>
                      {r.song ? r.song.title : r.file}
                    </p>
                    {r.song && r.song.artist !== 'Unknown Artist' && (
                      <p className={`text-[8px] uppercase tracking-wider truncate mt-0.5 ${r.status === 'duplicate' ? 'text-amber-400/20' : 'text-white/15'}`}>{r.song.artist}</p>
                    )}
                  </div>

                  {/* Duplicate badge */}
                  {r.status === 'duplicate' && (
                    <span className="text-[8px] uppercase font-bold tracking-wider text-amber-400/40 flex-shrink-0">DUP</span>
                  )}

                  {/* Duration */}
                  {r.song?.duration && r.status !== 'duplicate' ? (
                    <span className="text-[9px] text-white/12 tabular-nums flex-shrink-0">
                      {Math.floor(r.song.duration / 60)}:{String(Math.floor(r.song.duration % 60)).padStart(2, '0')}
                    </span>
                  ) : null}

                  {/* Progress */}
                  {r.status === 'uploading' && r.progress != null && (
                    <span className="text-[9px] text-white/30 tabular-nums font-bold flex-shrink-0 w-9 text-right">{r.progress}%</span>
                  )}
                </div>
              ))}
            </div>

            {/* Add to playlist button */}
            {successCount > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={openPlaylistPanel}
                  disabled={selectedCount === 0 || uploading}
                  className="brutal-btn flex-1 flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] disabled:opacity-30"
                >
                  <ListPlus size={14} strokeWidth={2} />
                  <span>{selectedCount > 0 ? `ADD ${selectedCount} TO PLAYLIST` : 'SELECT TRACKS'}</span>
                </button>
                <button
                  onClick={() => setResults([])}
                  className="text-white/15 hover:text-white/40 p-2.5 transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playlist selection panel */}
      <AnimatePresence>
        {showPlaylistPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-panel p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-white">
                  ADD {selectedCount} TRACK{selectedCount !== 1 ? 'S' : ''} TO
                </p>
                <button onClick={() => { setShowPlaylistPanel(false); setNewPlaylistMode(false); setPlaylistName(''); }} className="text-white/30 hover:text-white">
                  <X size={14} />
                </button>
              </div>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setNewPlaylistMode(false)}
                  className={`flex-1 py-2 text-[10px] uppercase font-bold tracking-wider transition-all ${!newPlaylistMode ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
                  style={{ border: !newPlaylistMode ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)', background: !newPlaylistMode ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                >
                  EXISTING PLAYLIST
                </button>
                <button
                  onClick={() => setNewPlaylistMode(true)}
                  className={`flex-1 py-2 text-[10px] uppercase font-bold tracking-wider transition-all ${newPlaylistMode ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
                  style={{ border: newPlaylistMode ? '1px solid #FF2D2D' : '1px solid rgba(255,255,255,0.08)', background: newPlaylistMode ? 'rgba(255,45,45,0.12)' : 'transparent' }}
                >
                  <Plus size={10} className="mr-1 inline" />NEW PLAYLIST
                </button>
              </div>

              {newPlaylistMode ? (
                <div className="space-y-2">
                  <input
                    type="text" value={playlistName} onChange={(e) => setPlaylistName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddToPlaylist()}
                    placeholder="Playlist name..." autoFocus
                    className="w-full px-3 py-2.5 bg-white/5 text-white text-[11px] uppercase tracking-wide placeholder:text-white/15 outline-none"
                    style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <button
                    onClick={handleAddToPlaylist} disabled={!playlistName.trim() || addingToPlaylist}
                    className="w-full brutal-btn brutal-btn-accent py-2.5 flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-30"
                  >
                    {addingToPlaylist ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {addingToPlaylist ? 'CREATING...' : `CREATE & ADD ${selectedCount} TRACKS`}
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scroll">
                  {playlists.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-[10px] text-white/15 uppercase tracking-widest">NO PLAYLISTS YET</p>
                      <button onClick={() => setNewPlaylistMode(true)} className="text-[10px] text-[#FF2D2D]/70 uppercase font-bold mt-1 hover:text-[#FF2D2D]">
                        CREATE ONE INSTEAD
                      </button>
                    </div>
                  ) : (
                    <>
                      {playlists.map(pl => (
                        <button
                          key={pl.id} onClick={() => setSelectedPlaylistId(pl.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all ${selectedPlaylistId === pl.id ? 'bg-white/8 border-l-2 border-[#FF2D2D]' : 'hover:bg-white/[0.03] border-l-2 border-transparent'}`}
                        >
                          <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center"
                            style={{ border: selectedPlaylistId === pl.id ? '1.5px solid #FF2D2D' : '1.5px solid rgba(255,255,255,0.15)', background: selectedPlaylistId === pl.id ? 'rgba(255,45,45,0.2)' : 'transparent' }}
                          >
                            {selectedPlaylistId === pl.id && <Check size={10} className="text-[#FF2D2D]" strokeWidth={3} />}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-[11px] font-bold text-white/60 truncate uppercase tracking-wide">{pl.name}</p>
                            <p className="text-[9px] text-white/20 uppercase">{pl.song_count} {pl.song_count === 1 ? 'TRACK' : 'TRACKS'}</p>
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={handleAddToPlaylist} disabled={!selectedPlaylistId || addingToPlaylist}
                        className="w-full brutal-btn py-2.5 flex items-center justify-center gap-2 min-h-[44px] mt-2 disabled:opacity-30"
                      >
                        {addingToPlaylist ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />}
                        {addingToPlaylist ? 'ADDING...' : `ADD ${selectedCount} TRACKS`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
