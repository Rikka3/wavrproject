'use client';
import { useRef, useEffect, useCallback, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1, Shuffle, Repeat, Repeat1, ChevronDown, Heart, ListMusic, Maximize2, Minimize2, Mic } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { usePlayerStore } from '@/store/player-store';
import { getStreamUrl, getArtworkUrl, formatDuration, toggleFavorite as apiToggleFavorite } from '@/lib/music-api';
import { AnimatePresence, motion } from 'framer-motion';
import { appToast as toast } from '@/components/ui/AppToaster';

// Global audio element - created once, never re-created
let gA: HTMLAudioElement | null = null;
let audioReady = false;

function getAudio(): HTMLAudioElement {
  if (!gA) {
    gA = new Audio();
    gA.preload = 'auto';
  }
  return gA;
}

export function getGlobalAudio(): HTMLAudioElement { return getAudio(); }

// ===== Song transition fade engine (fade-out at end, fade-in at start) =====
const TRANSITION_SECS = { off: 0, low: 2, medium: 4, high: 8 } as const;
let fadeState: { mode: 'in' | 'out'; start: number; dur: number; from: number; to: number } | null = null;
let fadeRAF: number | null = null;
let fadeOutActive = false;
let restVol = 0.8;

function stopFade() {
  if (fadeRAF !== null) cancelAnimationFrame(fadeRAF);
  fadeRAF = null;
  fadeState = null;
}

function startFade(mode: 'in' | 'out', from: number, to: number, durSec: number) {
  stopFade();
  fadeState = { mode, start: performance.now(), dur: durSec, from, to };
  const audio = getAudio();
  const tick = (now: number) => {
    if (!fadeState || fadeState.mode !== mode) return;
    if (audio.paused) {
      stopFade();
      fadeOutActive = false;
      audio.volume = fadeState.to;
      return;
    }
    const p = Math.min(1, (now - fadeState.start) / (fadeState.dur * 1000));
    audio.volume = fadeState.from + (fadeState.to - fadeState.from) * p;
    if (p >= 1) {
      stopFade();
      if (mode === 'out') fadeOutActive = true;
      return;
    }
    fadeRAF = requestAnimationFrame(tick);
  };
  fadeRAF = requestAnimationFrame(tick);
}

function maybeStartFadeOut(audio: HTMLAudioElement) {
  const st = usePlayerStore.getState();
  if (st.transition === 'off' || fadeOutActive || fadeState) return;
  if (st.isMuted || st.volume <= 0 || audio.paused) return;
  if (!audio.duration) return;
  const fadeSec = Math.min(TRANSITION_SECS[st.transition], audio.duration * 0.3);
  if (fadeSec <= 0 || audio.currentTime < audio.duration - fadeSec) return;
  fadeOutActive = true;
  restVol = st.volume;
  startFade('out', audio.volume, 0, fadeSec);
}

function Art({ id, title, cls = 'w-12 h-12', sz = 20 }: { id: string; title: string; cls?: string; sz?: number }) {
  const s = getArtworkUrl(id);
  return (
    <div className={`${cls} overflow-hidden flex-shrink-0`} style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)', background: 'var(--art-bg)' }}>
      {s ? <img src={s} alt={title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-foreground/10"><ListMusic size={sz} strokeWidth={1.5} /></div>}
    </div>
  );
}

function PlayBtn({ sz, isz, playing, onToggle }: { sz: string; isz: number; playing: boolean; onToggle: () => void }) {
  return (
    <button
      className={`${sz} flex items-center justify-center text-foreground transition-all active:scale-95`}
      style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.3)', background: 'rgb(var(--rgb-foreground) / 0.06)', minWidth: sz.includes('h-14') ? 56 : sz.includes('h-9') ? 36 : 32, minHeight: sz.includes('h-14') ? 56 : sz.includes('h-9') ? 36 : 32 }}
      onClick={onToggle}
    >
      {playing ? <Pause size={isz} strokeWidth={2} /> : <Play size={isz} strokeWidth={2} className="ml-0.5" />}
    </button>
  );
}

export default function Player() {
  const song = usePlayerStore(s => s.currentSong);
  const ip = usePlayerStore(s => s.isPlaying);
  const ct = usePlayerStore(s => s.currentTime);
  const du = usePlayerStore(s => s.duration);
  const vo = usePlayerStore(s => s.volume);
  const mu = usePlayerStore(s => s.isMuted);
  const sf = usePlayerStore(s => s.shuffle);
  const rp = usePlayerStore(s => s.repeat);
  const fsc = usePlayerStore(s => s.isFullscreen);
  const msp = usePlayerStore(s => s.showMobilePlayer);
  const showLyrics = usePlayerStore(s => s.showLyrics);
  const showQueue = usePlayerStore(s => s.showQueue);
  const favorites = usePlayerStore(s => s.favorites);
  const { setPlaying, setCurrentTime, setDuration, setVolume, toggleMute, toggleShuffle, toggleRepeat, nextSong, prevSong, setFullscreen, setShowLyrics, setShowQueue, toggleFavorite: storeToggleFavorite } = usePlayerStore();
  const [dr, setDr] = useState(false);
  const prevSongIdRef = useRef<string | null>(null);

  // Initialize audio element and set up event listeners (once)
  useEffect(() => {
    const audio = getAudio();
    audioReady = true;

    const onTimeUpdate = () => { if (!dr) setCurrentTime(audio.currentTime); maybeStartFadeOut(audio); };
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onDurationChange = () => setDuration(audio.duration);
    const onEnded = () => {
      const beforeId = usePlayerStore.getState().currentSong?.id;
      nextSong();
      const afterId = usePlayerStore.getState().currentSong?.id;
      // Same song replaying (repeat one): reset time and restore/restart volume
      if (beforeId && afterId === beforeId) {
        fadeOutActive = false;
        stopFade();
        const st = usePlayerStore.getState();
        audio.currentTime = 0;
        if (st.transition !== 'off' && !st.isMuted && st.volume > 0) {
          audio.volume = 0;
          audio.play().catch(() => {});
          startFade('in', 0, st.volume, TRANSITION_SECS[st.transition]);
        } else {
          audio.volume = st.isMuted ? 0 : st.volume;
          audio.play().catch(() => {});
        }
      }
    };
    const onError = (e: Event) => {
      const target = e.target as HTMLAudioElement;
      console.error('Audio error:', target.error?.message, target.src);
      if (target.error && target.error.code !== 3) setPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  // Handle song change: load new source and start playing
  useEffect(() => {
    if (!song) return;
    const songId = song.id;
    if (songId === prevSongIdRef.current) return;
    prevSongIdRef.current = songId;

    const audio = getAudio();
    const url = getStreamUrl(songId);
    audio.src = url;
    audio.load();
    setCurrentTime(0);
    audio.play().catch(err => console.warn('Play failed:', err.message));
    // Fade in on the new song
    fadeOutActive = false;
    stopFade();
    const st = usePlayerStore.getState();
    if (st.transition !== 'off' && !st.isMuted && st.volume > 0) {
      audio.volume = 0;
      startFade('in', 0, st.volume, TRANSITION_SECS[st.transition]);
    } else {
      audio.volume = st.isMuted ? 0 : st.volume;
    }
  }, [song?.id]);

  // Handle play/pause toggle without song change
  useEffect(() => {
    const audio = getAudio();
    if (!song) return;
    if (song.id === prevSongIdRef.current) {
      if (ip) audio.play().catch(() => {});
      else audio.pause();
    }
  }, [ip]);

  // Handle volume changes (cancels any in-flight fade; user takes control)
  useEffect(() => {
    stopFade();
    fadeOutActive = false;
    getAudio().volume = mu ? 0 : vo;
  }, [vo, mu]);

  const sk = useCallback((v: number[]) => { getAudio().currentTime = v[0]; setCurrentTime(v[0]); }, [setCurrentTime]);
  const sv = useCallback((v: number[]) => setVolume(v[0]), [setVolume]);
  const VI = mu || vo === 0 ? VolumeX : vo < 0.5 ? Volume1 : Volume2;

  const handlePrev = () => {
    if (ct > 3) { getAudio().currentTime = 0; setCurrentTime(0); }
    else prevSong();
  };
  const handleNext = () => {
    if (rp === 'one') { getAudio().currentTime = 0; setCurrentTime(0); }
    else nextSong();
  };

  if (!song) return null;
  const tog = () => setPlaying(!ip);
  const isFav = song ? favorites.has(song.id) : false;
  const handleFavorite = async () => {
    if (!song) return;
    storeToggleFavorite(song.id);
    try { await apiToggleFavorite(song.id); } catch { storeToggleFavorite(song.id); toast.error('FAILED TO TOGGLE FAVORITE'); }
  };

  return <>
    {/* Desktop player bar */}
    <div className="hidden md:flex fixed bottom-0 left-0 right-0 p-1.5" style={{ zIndex: 50 }}>
      <div className="glass-panel w-full px-4 py-2.5 flex items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-shrink-0 w-60">
          <Art id={song.id} title={song.title} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-foreground truncate uppercase tracking-wide">{song.title}</p>
            <p className="text-[9px] text-foreground/25 truncate uppercase">{song.artist}</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1 max-w-xl mx-auto">
          <div className="flex items-center gap-2">
            <button className={`h-8 w-8 flex items-center justify-center text-foreground/25 hover:text-foreground/70 ${sf ? '!text-(--accent)' : ''}`} onClick={toggleShuffle}><Shuffle size={13} strokeWidth={2} /></button>
            <button className="h-8 w-8 flex items-center justify-center text-foreground/40 hover:text-foreground" onClick={handlePrev}><SkipBack size={15} strokeWidth={2} /></button>
            <PlayBtn sz="h-9 w-9" isz={18} playing={ip} onToggle={tog} />
            <button className="h-8 w-8 flex items-center justify-center text-foreground/40 hover:text-foreground" onClick={handleNext}><SkipForward size={15} strokeWidth={2} /></button>
            <button className={`h-8 w-8 flex items-center justify-center text-foreground/25 hover:text-foreground/70 ${rp !== 'off' ? '!text-(--accent)' : ''}`} onClick={toggleRepeat}>{rp === 'one' ? <Repeat1 size={13} strokeWidth={2} /> : <Repeat size={13} strokeWidth={2} />}</button>
          </div>
          <div className="flex items-center gap-2 w-full text-[9px] text-foreground/20 uppercase tracking-wider">
            <span className="w-10 text-right tabular-nums font-bold">{formatDuration(ct)}</span>
            <Slider value={[ct]} min={0} max={du || 100} step={0.1} onValueChange={sk} onPointerDown={() => setDr(true)} onPointerUp={() => setDr(false)} className="flex-1 brutal-slider" />
            <span className="w-10 tabular-nums font-bold">{formatDuration(du)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 w-52 justify-end flex-shrink-0">
          <button className={`h-8 w-8 flex items-center justify-center ${isFav ? 'text-(--accent)' : 'text-foreground/20 hover:text-foreground/60'}`} onClick={handleFavorite}><Heart size={14} strokeWidth={2} fill={isFav ? 'currentColor' : 'none'} /></button>
          <button className={`h-8 w-8 flex items-center justify-center ${showLyrics ? 'text-foreground/60' : 'text-foreground/20 hover:text-foreground/60'}`} onClick={() => setShowLyrics(!showLyrics)}><Mic size={14} strokeWidth={2} /></button>
          <button className="h-8 w-8 flex items-center justify-center text-foreground/20 hover:text-foreground/60" onClick={toggleMute}><VI size={14} strokeWidth={2} /></button>
          <Slider value={[mu ? 0 : vo]} min={0} max={1} step={0.01} onValueChange={sv} className="w-16 brutal-slider-sm" />
          <button className={`h-8 w-8 flex items-center justify-center ${showQueue ? 'text-foreground/60' : 'text-foreground/20 hover:text-foreground/60'}`} onClick={() => setShowQueue(!showQueue)}><ListMusic size={14} strokeWidth={2} /></button>
          <button className="h-8 w-8 flex items-center justify-center text-foreground/20 hover:text-foreground/60" onClick={() => setFullscreen(!fsc)}>{fsc ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
        </div>
      </div>
    </div>

    {/* Mobile mini player */}
    <AnimatePresence>
      {msp && !fsc && (
        <motion.div
          initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
          className="md:hidden fixed left-0 right-0 px-2"
          style={{ bottom: 48, zIndex: 50 }}
        >
          <div className="glass-panel p-2 flex items-center gap-2">
            <Art id={song.id} title={song.title} cls="w-10 h-10" sz={14} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-foreground truncate uppercase">{song.title}</p>
              <p className="text-[8px] text-foreground/25 truncate uppercase">{song.artist}</p>
            </div>
            <PlayBtn sz="h-8 w-8" isz={14} playing={ip} onToggle={tog} />
            <button className="h-10 w-10 flex items-center justify-center text-foreground/40 hover:text-foreground" onClick={handleNext}><SkipForward size={16} strokeWidth={2} /></button>
            <button className="h-10 w-10 flex items-center justify-center text-foreground/40 hover:text-foreground" onClick={() => setFullscreen(true)}><ChevronDown size={18} className="rotate-180" /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Fullscreen player */}
    <AnimatePresence>
      {fsc && (
        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: 100, background: 'var(--fullscreen-bg)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderTop: '1px solid rgb(var(--rgb-foreground) / 0.08)' }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgb(var(--rgb-foreground) / 0.06)' }}>
            <button className="text-foreground/40 hover:text-foreground p-1" onClick={() => setFullscreen(false)}><ChevronDown size={22} /></button>
            <p className="brutal-label">NOW PLAYING</p>
            <div className="flex items-center gap-1">
              <button className={`p-1.5 ${showLyrics ? 'text-(--accent)' : 'text-foreground/40 hover:text-foreground'}`} onClick={() => setShowLyrics(!showLyrics)}><Mic size={17} /></button>
              <button className="text-foreground/40 hover:text-foreground p-1" onClick={() => setShowQueue(true)}><ListMusic size={18} /></button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center px-8 py-4">
            <div className="w-full max-w-xs aspect-square overflow-hidden" style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)', boxShadow: '0 0 60px rgba(120, 80, 255, 0.15)' }}>
              <Art id={song.id} title={song.title} cls="w-full h-full" sz={80} />
            </div>
          </div>
          <div className="px-5 pb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0 flex-1 mr-3">
                <h2 className="text-base font-extrabold text-foreground truncate uppercase tracking-wide">{song.title}</h2>
                <p className="text-[10px] text-foreground/25 uppercase tracking-wider mt-0.5">{song.artist}{song.album ? ` // ${song.album}` : ''}</p>
              </div>
              <button className={`h-10 w-10 flex items-center justify-center flex-shrink-0 ${isFav ? 'text-(--accent)' : 'text-foreground/20'}`} onClick={handleFavorite}>
                <Heart size={18} strokeWidth={2} fill={isFav ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="mt-3">
              <Slider value={[ct]} min={0} max={du || 100} step={0.1} onValueChange={sk} onPointerDown={() => setDr(true)} onPointerUp={() => setDr(false)} className="w-full brutal-slider" />
              <div className="flex justify-between mt-1.5 text-[9px] text-foreground/20 uppercase tracking-wider tabular-nums font-bold">
                <span>{formatDuration(ct)}</span><span>{formatDuration(du)}</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-5 mt-5">
              <button className={`h-11 w-11 flex items-center justify-center ${sf ? 'text-(--accent)' : 'text-foreground/25'}`} onClick={toggleShuffle}><Shuffle size={18} strokeWidth={2} /></button>
              <button className="h-11 w-11 flex items-center justify-center text-foreground/40" onClick={handlePrev}><SkipBack size={24} strokeWidth={2} /></button>
              <PlayBtn sz="h-14 w-14" isz={28} playing={ip} onToggle={tog} />
              <button className="h-11 w-11 flex items-center justify-center text-foreground/40" onClick={handleNext}><SkipForward size={24} strokeWidth={2} /></button>
              <button className={`h-11 w-11 flex items-center justify-center ${rp !== 'off' ? 'text-(--accent)' : 'text-foreground/25'}`} onClick={toggleRepeat}>{rp === 'one' ? <Repeat1 size={18} strokeWidth={2} /> : <Repeat size={18} strokeWidth={2} />}</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </>;
}