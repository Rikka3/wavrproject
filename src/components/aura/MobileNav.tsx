'use client';
import { Library, Upload, Search, Disc3, ListMusic } from 'lucide-react';
import { usePlayerStore } from '@/store/player-store';

export default function MobileNav() {
  const { currentTab, setCurrentTab, isFullscreen, playlists, setActivePlaylistId } = usePlayerStore();
  if (isFullscreen) return null;

  const tabs = [
    { id: 'library' as const, icon: Library, label: 'LIBRARY' },
    { id: 'search' as const, icon: Search, label: 'SEARCH' },
    { id: 'playlists' as const, icon: ListMusic, label: 'PLAYLISTS' },
    { id: 'upload' as const, icon: Upload, label: 'UPLOAD' },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 glass-panel-tall"
      style={{
        zIndex: 10,
        position: 'fixed',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-2.5">
        <div className="flex items-center gap-1 absolute left-3">
          <Disc3 size={12} className="text-foreground/50" strokeWidth={2} />
          <span className="text-[8px] font-extrabold uppercase tracking-widest text-foreground/35">WAVE</span>
        </div>
        {tabs.map(tab => {
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setCurrentTab(tab.id); if (tab.id === 'playlists') setActivePlaylistId(null); }}
              className={`flex flex-col items-center gap-0.5 px-5 py-1.5 min-h-[44px] justify-center transition-all ${
                active ? 'text-foreground' : 'text-foreground/20 active:text-foreground/40'
              }`}
            >
              <tab.icon size={17} strokeWidth={active ? 2.5 : 1.5} />
              <span className={`text-[8px] font-bold uppercase tracking-widest ${active ? 'text-foreground' : ''}`}>{tab.label}</span>
              {tab.id === 'playlists' && playlists.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full text-[7px] font-bold bg-(--accent) text-foreground">{playlists.length}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}