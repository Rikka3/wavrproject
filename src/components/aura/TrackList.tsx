'use client';
import { useState } from 'react';
import { usePlayerStore } from '@/store/player-store';
import { getArtworkUrl, formatDuration, type Song } from '@/lib/music-api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { deleteSong, adminDeleteSong } from '@/lib/music-api';
import { useAuthStore } from '@/store/auth-store';
import AdminCodeDialog from './AdminCodeDialog';
import { appToast as toast } from '@/components/ui/AppToaster';
import { Play, MoreVertical, Music2, ListPlus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const typeColors: Record<string, string> = {
  electronic: 'border-cyan-400/30 text-cyan-300',
  classical: 'border-amber-400/30 text-amber-300',
  acoustic: 'border-emerald-400/30 text-emerald-300',
  instrumental: 'border-violet-400/30 text-violet-300',
  rock: 'border-red-400/30 text-red-300',
  urban: 'border-orange-400/30 text-orange-300',
  pop: 'border-pink-400/30 text-pink-300',
  other: 'border-white/10 text-white/30',
};

interface TrackRowProps {
  song: Song;
  index: number;
  queueOverride?: Song[];
  onRemove?: (songId: string) => void;
  showRemove?: boolean;
}

function TrackRow({ song, index, queueOverride, onRemove, showRemove }: TrackRowProps) {
  const { currentSong, isPlaying, playSong, setPlaying, filteredSongs, removeSong, setShowAddToPlaylist, setAddToPlaylistSongId, playlists } = usePlayerStore();
  const [adminTarget, setAdminTarget] = useState<Song | null>(null);
  const isCurrent = currentSong?.id === song.id;
  const queue = queueOverride || filteredSongs;
  const handlePlay = () => { if (isCurrent) setPlaying(!isPlaying); else playSong(song, queue); };
  const handleDelete = async () => {
    const { user } = useAuthStore.getState();
    if (!user) {
      toast.error('SIGN IN REQUIRED');
      useAuthStore.getState().openAuthModal();
      return;
    }
    if (song.user_id && song.user_id === user.uid) {
      try { await deleteSong(song.id); removeSong(song.id); toast.success(`REMOVED: ${song.title}`); } catch (e: any) { toast.error(e.message); }
    } else {
      setAdminTarget(song);
    }
  };
  const handleAddToPlaylist = () => {
    setAddToPlaylistSongId(song.id);
    setShowAddToPlaylist(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }}
      transition={{ delay: index * 0.012, duration: 0.12 }}
      className={`group flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2 cursor-pointer border-l-2 transition-all ${
        isCurrent
          ? 'border-[#FF2D2D] bg-white/5'
          : 'border-transparent hover:border-white/15 hover:bg-white/[0.03]'
      }`}
      onClick={handlePlay}
    >
      <span className={`w-5 text-right text-[10px] tabular-nums font-bold flex-shrink-0 ${isCurrent ? 'text-[#FF2D2D]' : 'text-white/12 group-hover:hidden'}`}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className={`hidden group-hover:flex w-5 justify-center flex-shrink-0 ${isCurrent ? 'text-white' : 'text-white/40'}`}>
        <Play size={10} fill="currentColor" />
      </span>

      <div className="w-10 h-10 md:w-9 md:h-9 overflow-hidden flex-shrink-0" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)' }}>
        {song.artwork_url || song.artwork_path ? (
          <img src={getArtworkUrl(song.id, song.artwork_path)} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/8"><Music2 size={12} strokeWidth={1.5} /></div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-bold truncate uppercase tracking-wide ${isCurrent ? 'text-white' : 'text-white/60'}`}>{song.title}</p>
        <p className="text-[9px] text-white/20 truncate uppercase tracking-wider mt-0.5">{song.artist}{song.album ? ` // ${song.album}` : ''}</p>
      </div>

      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        {song.genre && <span className={`brutal-badge border ${typeColors[song.song_type] || typeColors.other}`}>{song.genre}</span>}
      </div>

      <div className="hidden lg:flex items-center gap-3 text-[9px] text-white/12 uppercase flex-shrink-0 tabular-nums">
        {song.bitrate > 0 && <span>{song.bitrate}k</span>}
        <span>{formatDuration(song.duration)}</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button className="h-8 w-8 flex items-center justify-center text-white/8 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity">
            <MoreVertical size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="glass-panel p-1" align="end">
          <DropdownMenuItem className="text-white/50 hover:bg-white/10 hover:text-white text-[10px] uppercase font-bold py-1.5 px-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); handlePlay(); }}>
            {isCurrent && isPlaying ? 'PAUSE' : 'PLAY'}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-white/50 hover:bg-white/10 hover:text-white text-[10px] uppercase font-bold py-1.5 px-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(); }}>
            <ListPlus size={12} className="mr-1.5" />ADD TO PLAYLIST
          </DropdownMenuItem>
          {showRemove && onRemove && (
            <DropdownMenuItem className="text-white/30 hover:bg-white/5 hover:text-white/60 text-[10px] uppercase font-bold py-1.5 px-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); onRemove(song.id); }}>
              <X size={12} className="mr-1.5" />REMOVE FROM PLAYLIST
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-[#FF2D2D]/60 hover:bg-[#FF2D2D]/10 hover:text-[#FF2D2D] text-[10px] uppercase font-bold py-1.5 px-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleDelete(); }}>
            DELETE SONG
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AdminCodeDialog
        open={!!adminTarget}
        onClose={() => setAdminTarget(null)}
        title={`ADMIN DELETE: ${adminTarget?.title || ''}`}
        description="YOU ARE NOT THE OWNER OF THIS SONG"
        onSubmit={async (code) => {
          if (!adminTarget) return;
          await adminDeleteSong(adminTarget.id, code);
          removeSong(adminTarget.id);
          toast.success(`REMOVED: ${adminTarget.title}`);
        }}
      />
    </motion.div>
  );
}

interface TrackListProps {
  songs?: Song[];
  emptyText?: string;
  queueOverride?: Song[];
  onRemoveSong?: (songId: string) => void;
  showRemove?: boolean;
}

export default function TrackList({ songs, emptyText, queueOverride, onRemoveSong, showRemove }: TrackListProps) {
  const { filteredSongs, isLoading } = usePlayerStore();
  const displaySongs = songs || filteredSongs;

  if (isLoading) {
    return (
      <div className="space-y-1 p-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <div className="w-5 h-3 bg-white/4" />
            <div className="w-10 h-10 bg-white/4" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 bg-white/4" />
              <div className="h-2 w-1/3 bg-white/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!displaySongs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
        <Music2 size={28} className="text-white/6 mb-3" strokeWidth={1} />
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/15">{emptyText || 'NO TRACKS'}</p>
        <p className="text-[9px] text-white/8 uppercase tracking-widest mt-1">{emptyText ? '' : 'UPLOAD TO BEGIN'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <AnimatePresence mode="popLayout">
        {displaySongs.map((song, i) => (
          <TrackRow key={song.id} song={song} index={i} queueOverride={queueOverride} onRemove={onRemoveSong} showRemove={showRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
}
