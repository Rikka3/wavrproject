'use client';
import { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Loader2, LogIn, Chrome, Disc3 } from 'lucide-react';
import { isFirebaseConfigured } from '@/lib/firebase-config';
import { useAuthStore } from '@/store/auth-store';
import { motion, AnimatePresence } from 'framer-motion';
import { appToast as toast } from '@/components/ui/AppToaster';

type AuthView = 'login' | 'signup';

export default function AuthModal({ compact = false }: { compact?: boolean }) {
  const { user, loading, setUser, authModalOpen, closeAuthModal } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [firebaseReady, setFirebaseReady] = useState(false);

  // Open on demand (e.g. upload without being signed in)
  useEffect(() => {
    if (authModalOpen) {
      setView('login');
      setEmail('');
      setPassword('');
      setDisplayName('');
      setIsOpen(true);
      closeAuthModal();
    }
  }, [authModalOpen, closeAuthModal]);

  // Lazy-init Firebase auth listener
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { getFirebaseApp } = await import('@/lib/firebase-app');
      const result = await getFirebaseApp();
      if (!cancelled) setFirebaseReady(!!result.app);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setSubmitting(true);
    try {
      const { getFirebaseAuth } = await import('@/lib/firebase-app');
      const auth = await getFirebaseAuth();
      if (!auth) throw new Error('Firebase not initialized');

      const { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');

      if (view === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        setUser({ uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName, photoURL: cred.user.photoURL });
        toast.success('WELCOME BACK');
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        setUser({ uid: cred.user.uid, email: cred.user.email, displayName: displayName.trim() || null, photoURL: cred.user.photoURL });
        toast.success('ACCOUNT CREATED');
      }
      setIsOpen(false);
      setEmail(''); setPassword(''); setDisplayName('');
    } catch (e: any) {
      const msg = e.code?.replace('auth/', '').replace(/-/g, ' ').toUpperCase() || e.message;
      toast.error(msg);
    }
    setSubmitting(false);
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    try {
      const { getFirebaseAuth } = await import('@/lib/firebase-app');
      const auth = await getFirebaseAuth();
      if (!auth) throw new Error('Firebase not initialized');
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      setUser({ uid: cred.user.uid, email: cred.user.email, displayName: cred.user.displayName, photoURL: cred.user.photoURL });
      toast.success('SIGNED IN WITH GOOGLE');
      setIsOpen(false);
    } catch (e: any) {
      if (e.code !== 'auth/popup-closed-by-user') {
        toast.error(e.code?.replace('auth/', '').replace(/-/g, ' ').toUpperCase() || 'GOOGLE SIGN-IN FAILED');
      }
    }
    setSubmitting(false);
  };

  // If Firebase is not configured, show a notice instead
  if (!isFirebaseConfigured) {
    return (
      <div className="w-full flex items-center gap-2 px-2">
        <Disc3 size={14} className="text-foreground/20" strokeWidth={1.5} />
        <span className="text-[8px] text-foreground/15 uppercase tracking-widest">LOCAL MODE</span>
      </div>
    );
  }

  // If user is logged in, show avatar/profile button
  if (user) {
    return <UserProfileMenu compact={compact} />;
  }

  // Show login button
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase font-bold tracking-wider text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-all ${compact ? 'justify-center h-8 w-8 !p-0 gap-0' : 'w-full justify-center'}`}
        style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.08)' }}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
        {!compact && 'SIGN IN'}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center"
            style={{ zIndex: 300, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-sm mx-4"
              style={{ background: 'var(--dialog-bg)', border: '1px solid rgb(var(--rgb-foreground) / 0.1)', boxShadow: 'var(--dialog-shadow)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Disc3 size={16} className="text-foreground" strokeWidth={2} />
                    <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-foreground">WAVR</h2>
                  </div>
                  <p className="text-[9px] text-foreground/20 uppercase tracking-widest mt-0.5">
                    {view === 'login' ? 'SIGN IN TO YOUR ACCOUNT' : 'CREATE A NEW ACCOUNT'}
                  </p>
                </div>
                <button className="text-foreground/30 hover:text-foreground p-1" onClick={() => setIsOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
                {view === 'signup' && (
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/15" strokeWidth={1.5} />
                    <input
                      type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display name"
                      className="w-full pl-9 pr-3 py-2.5 bg-foreground/5 text-foreground text-[11px] uppercase tracking-wide placeholder:text-foreground/15 outline-none"
                      style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/15" strokeWidth={1.5} />
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address" required
                    className="w-full pl-9 pr-3 py-2.5 bg-foreground/5 text-foreground text-[11px] uppercase tracking-wide placeholder:text-foreground/15 outline-none"
                    style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
                  />
                </div>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/15" strokeWidth={1.5} />
                  <input
                    type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password" required minLength={6}
                    className="w-full pl-9 pr-3 py-2.5 bg-foreground/5 text-foreground text-[11px] uppercase tracking-wide placeholder:text-foreground/15 outline-none"
                    style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.1)' }}
                  />
                </div>

                <button
                  type="submit" disabled={submitting}
                  className="w-full py-2.5 text-[11px] uppercase font-bold tracking-wider text-foreground transition-all disabled:opacity-40 min-h-[44px]"
                  style={{ border: '1px solid var(--accent)', background: 'rgb(var(--rgb-accent) / 0.15)' }}
                >
                  {submitting ? <Loader2 size={14} className="mx-auto animate-spin" /> : (view === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT')}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-foreground/8" />
                  <span className="text-[9px] text-foreground/15 uppercase tracking-widest">OR</span>
                  <div className="flex-1 h-px bg-foreground/8" />
                </div>

                {/* Google button */}
                <button
                  type="button" onClick={handleGoogle} disabled={submitting}
                  className="w-full py-2.5 text-[11px] uppercase font-bold tracking-wider text-foreground/60 hover:text-foreground transition-all disabled:opacity-40 flex items-center justify-center gap-2 min-h-[44px]"
                  style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.15)', background: 'rgb(var(--rgb-foreground) / 0.03)' }}
                >
                  <Chrome size={14} />CONTINUE WITH GOOGLE
                </button>

                {/* Toggle login/signup */}
                <p className="text-center text-[10px] text-foreground/25 uppercase tracking-wider">
                  {view === 'login' ? 'NO ACCOUNT?' : 'ALREADY HAVE AN ACCOUNT?'}
                  <button type="button" onClick={() => setView(view === 'login' ? 'signup' : 'login')} className="ml-1.5 text-foreground/50 hover:text-foreground font-bold">
                    {view === 'login' ? 'SIGN UP' : 'SIGN IN'}
                  </button>
                </p>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function UserProfileMenu({ compact = false }: { compact?: boolean }) {
  const { user, signOut } = useAuthStore();
  const [showMenu, setShowMenu] = useState(false);
  if (!user) return null;

  const initials = (user.displayName || user.email || 'U').charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`flex items-center gap-2 px-2 py-1.5 hover:bg-foreground/5 transition-all max-w-full min-w-0 ${compact ? 'w-auto p-1' : 'w-full'}`}
        style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.08)' }}
      >
        <div className="w-6 h-6 flex items-center justify-center text-[10px] font-bold uppercase text-foreground/70 flex-shrink-0" style={{ border: '1px solid rgb(var(--rgb-foreground) / 0.15)', background: 'rgb(var(--rgb-foreground) / 0.06)' }}>
          {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" alt="" /> : initials}
        </div>
        {!compact && (
          <span className="text-[10px] text-foreground/40 uppercase tracking-wider font-bold hidden lg:inline flex-1 min-w-0 truncate text-left">
            {user.displayName || user.email?.split('@')[0]}
          </span>
        )}
      </button>

      <AnimatePresence>
        {showMenu && (
          <>
            <div className="fixed inset-0" style={{ zIndex: 199 }} onClick={() => setShowMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute top-full right-0 mt-1 w-52 py-1.5"
              style={{ zIndex: 200, background: 'var(--dialog-bg)', border: '1px solid rgb(var(--rgb-foreground) / 0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
            >
              <div className="px-3 py-2" style={{ borderBottom: '1px solid rgb(var(--rgb-foreground) / 0.06)' }}>
                <p className="text-[11px] font-bold text-foreground uppercase tracking-wide truncate">{user.displayName || 'User'}</p>
                <p className="text-[9px] text-foreground/25 uppercase tracking-wider truncate mt-0.5">{user.email}</p>
              </div>
              <button
                onClick={async () => { await signOut(); setShowMenu(false); toast.success('SIGNED OUT'); }}
                className="w-full text-left px-3 py-2 text-[10px] uppercase font-bold tracking-wider text-foreground/40 hover:text-(--accent) hover:bg-foreground/5 transition-all"
              >
                SIGN OUT
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
