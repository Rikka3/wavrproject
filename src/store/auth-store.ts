import { create } from 'zustand';
import { isFirebaseConfigured } from '@/lib/firebase-config';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  authModalOpen: boolean;
  getIdToken: () => Promise<string>;
  signOut: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: isFirebaseConfigured,
  authModalOpen: false,

  openAuthModal: () => set({ authModalOpen: true }),
  closeAuthModal: () => set({ authModalOpen: false }),

  getIdToken: async () => {
    const { user } = get();
    if (!user || !isFirebaseConfigured) return '';
    try {
      const { getAuth, onAuthStateChanged } = await import('firebase/auth');
      const { app } = await import('@/lib/firebase-app');
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();
      return token || '';
    } catch {
      return '';
    }
  },

  signOut: async () => {
    if (!isFirebaseConfigured) return;
    try {
      const { getAuth } = await import('firebase/auth');
      const { app } = await import('@/lib/firebase-app');
      const auth = getAuth(app);
      await auth.signOut();
      set({ user: null });
    } catch {
      console.error('Sign out error');
    }
  },

  setUser: (user) => set({ user, loading: false }),
}));
