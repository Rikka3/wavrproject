'use client';
import { usePlayerStore } from '@/store/player-store';
import { getArtworkUrl, formatDuration, type Song } from '@/lib/music-api';
import { X, ChevronUp, ChevronDown, Music2, GripVertical } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

function QueueItem({ song, index, isCurrent, onClick, onMoveUp, onMoveDown, canReorder }: {
  song: Song;
  index: number;
  isCurrent: boolean;
  onClick: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canReorder: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-all group ${
        isCurrent
          ? 'bg-foreground/8 border-l-2 border-(--accent)'
          : 'border-l-2 border-transparent hover:bg-foreground/[0.03]'
      }`}
      onClick={onClick}
    >
      {/* Artwork */}
      <div className="w-9 h-9 overflow-hidden flex-shrink-0" style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.08)', background: 'var(--art-bg)' }}>
        {song.artwork_url || song.artwork_path ? (
          <img src={getArtworkUrl(song.id, song.artwork_path)} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-foreground/8"><Music2 size={10} strokeWidth={1.5} /></div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-bold truncate uppercase tracking-wide ${isCurrent ? 'text-foreground' : 'text-foreground/50'}`}>{song.title}</p>
        <p className="text-[9px] text-foreground/20 truncate uppercase tracking-wider mt-0.5">{song.artist}</p>
      </div>

      {/* Duration */}
      <span className="text-[9px] text-foreground/15 tabular-nums font-bold uppercase flex-shrink-0 mr-1">{formatDuration(song.duration)}</span>

      {/* Reorder buttons */}
      {canReorder && (
        <div className="flex flex-col items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            className="h-4 w-6 flex items-center justify-center text-foreground/20 hover:text-foreground/60"
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          >
            <ChevronUp size={10} strokeWidth={2} />
          </button>
          <button
            className="h-4 w-6 flex items-center justify-center text-foreground/20 hover:text-foreground/60"
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          >
            <ChevronDown size={10} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function QueueDrawer() {
  const { showQueue, queue, queueIndex, currentSong, setShowQueue, playSong, reorderQueue } = usePlayerStore();

  if (!showQueue) return null;

  const nowPlaying = queue[queueIndex];
  const upNext = queue.filter((_, i) => i > queueIndex);

  const handlePlay = (song: Song) => {
    playSong(song, queue);
  };

  const getRelativeIndex = (song: Song): number => {
    return queue.findIndex(s => s.id === song.id);
  };

  return (
    <AnimatePresence>
      {showQueue && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0"
            style={{ zIndex: 89, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={() => setShowQueue(false)}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-80 max-w-[85vw] flex flex-col"
            style={{
              zIndex: 90,
              background: 'var(--dialog-bg)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderLeft: '1px solid rgb(var(--rgb-foreground) / 0.1)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgb(var(--rgb-foreground) / 0.06)' }}>
              <div>
                <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-foreground">QUEUE</h2>
                <p className="brutal-label mt-0.5">{queue.length} TRACKS</p>
              </div>
              <button
                className="h-8 w-8 flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors"
                style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)', background: 'rgb(var(--rgb-foreground) / 0.04)' }}
                onClick={() => setShowQueue(false)}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            {/* Queue list */}
            <div className="flex-1 overflow-hidden">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Music2 size={24} className="text-foreground/8" strokeWidth={1} />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/15">QUEUE EMPTY</p>
                  <p className="text-[8px] text-foreground/8 uppercase tracking-widest">PLAY A TRACK TO START</p>
                </div>
              ) : (
                <div className="h-full overflow-y-auto custom-scroll">
                  {/* Now Playing */}
                  {nowPlaying && (
                    <div className="px-3 pt-3 pb-1">
                      <p className="brutal-label mb-1.5">NOW PLAYING</p>
                      <div className="bg-foreground/5 border-l-2 border-(--accent)">
                        <QueueItem
                          song={nowPlaying}
                          index={queueIndex}
                          isCurrent={true}
                          onClick={() => handlePlay(nowPlaying)}
                          onMoveUp={() => {}}
                          onMoveDown={() => {}}
                          canReorder={false}
                        />
                      </div>
                    </div>
                  )}

                  {/* Up Next */}
                  {upNext.length > 0 && (
                    <div className="px-3 pt-3 pb-3">
                      <p className="brutal-label mb-1.5">UP NEXT</p>
                      <div className="space-y-0.5">
                        {upNext.map((song) => {
                          const absIdx = getRelativeIndex(song);
                          return (
                            <QueueItem
                              key={song.id}
                              song={song}
                              index={absIdx}
                              isCurrent={false}
                              onClick={() => handlePlay(song)}
                              onMoveUp={() => { if (absIdx > 0) reorderQueue(absIdx, absIdx - 1); }}
                              onMoveDown={() => { if (absIdx < queue.length - 1) reorderQueue(absIdx, absIdx + 1); }}
                              canReorder={true}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
