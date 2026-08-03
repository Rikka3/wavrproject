'use client';
import { useEffect } from 'react';
import { usePlayerStore } from '@/store/player-store';
import { getGlobalAudio } from '@/components/aura/Player';
import { toggleFavorite as apiToggleFavorite } from '@/lib/music-api';
import { appToast as toast } from '@/components/ui/AppToaster';

export default function KeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const store = usePlayerStore.getState();

      switch (e.key) {
        case ' ':
        case 'k': {
          if (e.key === ' ') e.preventDefault();
          store.togglePlay();
          break;
        }
        case 'ArrowLeft': {
          const audio = getGlobalAudio();
          audio.currentTime = Math.max(0, audio.currentTime - 5);
          store.setCurrentTime(audio.currentTime);
          break;
        }
        case 'ArrowRight': {
          const audio = getGlobalAudio();
          audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
          store.setCurrentTime(audio.currentTime);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const newVol = Math.min(1, store.volume + 0.1);
          store.setVolume(newVol);
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const newVol = Math.max(0, store.volume - 0.1);
          store.setVolume(newVol);
          break;
        }
        case 'm': {
          store.toggleMute();
          break;
        }
        case 'l': {
          if (store.currentSong) {
            const songId = store.currentSong.id;
            store.toggleFavorite(songId);
            const isFav = store.favorites.has(songId);
            apiToggleFavorite(songId).catch(() => {
              // Revert on error
              store.toggleFavorite(songId);
              toast.error('FAILED TO TOGGLE FAVORITE');
            });
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}
