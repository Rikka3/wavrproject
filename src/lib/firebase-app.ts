// Lazy-initialized Firebase app singleton
let _app: any = null;
let _initPromise: Promise<any> | null = null;
let _authListenerSetup = false;

export async function getFirebaseApp() {
  if (_app) return { app: _app, auth: (await import('firebase/auth')).getAuth(_app) };
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const { initializeApp } = await import('firebase/app');
    const { getAuth, onAuthStateChanged } = await import('firebase/auth');
    const { firebaseConfig, isFirebaseConfigured } = await import('@/lib/firebase-config');

    if (!isFirebaseConfigured) {
      console.log('[firebase] Not configured, running in single-user mode');
      return { app: null, auth: null };
    }

    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);

      // Listen for auth state changes (setup once)
      if (!_authListenerSetup) {
        _authListenerSetup = true;
        onAuthStateChanged(auth, (user) => {
          // Dynamically import to avoid circular deps; use setTimeout for sync context
          setTimeout(() => {
            import('@/store/auth-store').then(({ useAuthStore }) => {
              if (user) {
                useAuthStore.getState().setUser({
                  uid: user.uid,
                  email: user.email,
                  displayName: user.displayName,
                  photoURL: user.photoURL,
                });
              } else {
                useAuthStore.getState().setUser(null);
              }
            });
          }, 0);
        });
      }

      _app = app;
      return { app, auth };
    } catch (e) {
      console.error('[firebase] Init error:', e);
      return { app: null, auth: null };
    }
  })();

  return _initPromise;
}

export async function getFirebaseAuth() {
  const { auth } = await getFirebaseApp();
  return auth;
}
