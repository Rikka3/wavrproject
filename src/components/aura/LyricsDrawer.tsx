'use client';
import { useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Loader2, Music2 } from 'lucide-react';
import { usePlayerStore } from '@/store/player-store';
import { fetchLyrics } from '@/lib/music-api';
import { getGlobalAudio } from '@/components/aura/Player';
import { AnimatePresence, motion } from 'framer-motion';

interface LyricLine {
  time: number;
  text: string;
}

// Pre-highlight offset: show the next line slightly early for smoother feel
const PRE_HIGHLIGHT_OFFSET = 0.3; // seconds before actual time
const SCROLL_PADDING = 0.35; // fraction of container height to offset scroll

function parseLrc(lrc: string): LyricLine[] {
  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  for (const line of lines) {
    // Match [mm:ss.xx], [mm:ss.xxx], [mm:ss:xx], and [mm:ss.xx] with multiple timestamps
    const timestamps = line.matchAll(/\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g);
    const textPart = line.replace(/\[\d{2}:\d{2}[.:]\d{2,3}\]/g, '').trim();
    if (!textPart) continue;
    
    for (const match of timestamps) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msRaw = match[3];
      const ms = msRaw.length === 2 ? parseInt(msRaw, 10) * 10 : parseInt(msRaw, 10);
      const time = min * 60 + sec + ms / 1000;
      result.push({ time, text: textPart });
    }
  }
  // Sort by time
  result.sort((a, b) => a.time - b.time);
  return result;
}

export default function LyricsDrawer() {
  const { showLyrics, currentSong, currentTime, lyricsLoading, lyricsSynced, lyricsPlain, setShowLyrics, setLyricsSynced, setLyricsPlain, setLyricsLoading } = usePlayerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const lastScrolledIndex = useRef(-1);

  const parsed = useMemo(() => parseLrc(lyricsSynced), [lyricsSynced]);

  // Find active line index with pre-highlight
  const activeIndex = useMemo(() => {
    if (!parsed.length) return -1;
    const adjustedTime = currentTime + PRE_HIGHLIGHT_OFFSET;
    let idx = -1;
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].time <= adjustedTime) idx = i;
      else break;
    }
    return idx;
  }, [parsed, currentTime]);

  // Find next line for pre-highlight effect
  const nextIndex = useMemo(() => {
    if (activeIndex < 0 || activeIndex >= parsed.length - 1) return -1;
    return activeIndex + 1;
  }, [activeIndex, parsed.length]);

  // Smooth auto-scroll with debounce
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (activeIndex < 0 || activeIndex === lastScrolledIndex.current) return;
    lastScrolledIndex.current = activeIndex;

    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      if (activeRef.current && containerRef.current) {
        const container = containerRef.current;
        const line = activeRef.current;
        const containerRect = container.getBoundingClientRect();
        const lineRect = line.getBoundingClientRect();
        const offset = containerRect.height * SCROLL_PADDING;
        const targetScroll = container.scrollTop + lineRect.top - containerRect.top - offset;
        container.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }
    }, 100);

    return () => { if (scrollTimeout.current) clearTimeout(scrollTimeout.current); };
  }, [activeIndex]);

  // Fetch lyrics when opened or song changes
  useEffect(() => {
    if (!showLyrics || !currentSong) return;
    let cancelled = false;
    setLyricsLoading(true);
    setLyricsSynced('');
    setLyricsPlain('');
    fetchLyrics(currentSong.id)
      .then((res) => {
        if (!cancelled) {
          setLyricsSynced(res.syncedLyrics || '');
          setLyricsPlain(res.plainLyrics || '');
        }
      })
      .catch(() => {
        if (!cancelled) { setLyricsSynced(''); setLyricsPlain(''); }
      })
      .finally(() => { if (!cancelled) setLyricsLoading(false); });
    return () => { cancelled = true; };
  }, [showLyrics, currentSong?.id, setLyricsLoading, setLyricsSynced, setLyricsPlain]);

  // Manual scroll handler: pause auto-scroll when user is scrolling
  const isUserScrolling = useRef(false);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout>>();
  const handleUserScroll = useCallback(() => {
    isUserScrolling.current = true;
    if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current);
    userScrollTimeout.current = setTimeout(() => { isUserScrolling.current = false; }, 3000);
  }, []);

  // Only auto-scroll if user hasn't manually scrolled
  useEffect(() => {
    if (isUserScrolling.current) return;
    if (activeIndex < 0 || activeIndex === lastScrolledIndex.current) return;
    lastScrolledIndex.current = activeIndex;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      if (activeRef.current && containerRef.current) {
        const container = containerRef.current;
        const line = activeRef.current;
        const containerRect = container.getBoundingClientRect();
        const lineRect = line.getBoundingClientRect();
        const offset = containerRect.height * SCROLL_PADDING;
        const targetScroll = container.scrollTop + lineRect.top - containerRect.top - offset;
        container.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }
    }, 100);
    return () => { if (scrollTimeout.current) clearTimeout(scrollTimeout.current); };
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {showLyrics && currentSong && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-0 flex flex-col"
          style={{
            zIndex: 110,
            background: 'rgba(8, 6, 16, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '1px solid rgb(var(--rgb-foreground) / 0.08)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgb(var(--rgb-foreground) / 0.06)' }}>
            <div className="min-w-0 flex-1 mr-3">
              <h2 className="text-[11px] font-extrabold text-foreground truncate uppercase tracking-widest">
                {currentSong.title} {'//'} {currentSong.artist}
              </h2>
              <p className="brutal-label mt-0.5">LYRICS</p>
            </div>
            <button
              className="h-9 w-9 flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors flex-shrink-0"
              style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)', background: 'rgb(var(--rgb-foreground) / 0.04)' }}
              onClick={() => setShowLyrics(false)}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {lyricsLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 size={24} className="text-foreground/20 animate-spin" />
                <p className="text-[10px] uppercase tracking-widest text-foreground/20 font-bold">LOADING LYRICS</p>
              </div>
            ) : parsed.length > 0 ? (
              <div ref={containerRef} className="h-full overflow-y-auto custom-scroll" onScroll={handleUserScroll}>
                {/* Top padding for centering first line */}
                <div className="h-[40vh]" />
                <div className="max-w-lg mx-auto space-y-1 px-4 pb-[60vh]">
                  {parsed.map((line, i) => (
                    <div
                      key={`${i}-${line.time}`}
                      ref={i === activeIndex ? activeRef : undefined}
                      className={`py-2.5 px-3 transition-all duration-500 ease-out cursor-pointer ${
                        i === activeIndex
                          ? 'text-foreground font-extrabold text-[15px] scale-[1.03]'
                          : i === nextIndex
                            ? 'text-foreground/35 text-[13px] font-semibold'
                            : 'text-foreground/15 text-[13px] font-medium'
                      }`}
                      style={
                        i === activeIndex
                          ? { textShadow: '0 0 30px rgb(var(--rgb-foreground) / 0.12)' }
                          : i === nextIndex
                            ? { textShadow: '0 0 15px rgb(var(--rgb-foreground) / 0.05)' }
                            : undefined
                      }
                      onClick={() => {
                        const audio = getGlobalAudio();
                        audio.currentTime = line.time;
                        usePlayerStore.getState().setCurrentTime(line.time);
                      }}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            ) : lyricsPlain ? (
              <div className="h-full overflow-y-auto custom-scroll px-4 py-6">
                <div className="max-w-lg mx-auto">
                  {lyricsPlain.split('\n').map((line, i) => (
                    <p key={i} className="text-[13px] text-foreground/30 py-1.5 px-3 leading-relaxed">{line}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Music2 size={28} className="text-foreground/8" strokeWidth={1} />
                <p className="text-[11px] font-bold uppercase tracking-widest text-foreground/15">NO LYRICS AVAILABLE</p>
                <p className="text-[9px] text-foreground/8 uppercase tracking-widest">TRY ANOTHER TRACK</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
