import React, { useState, useEffect, createContext, useContext } from 'react';
import { signInAnon, onAuthChange, hasFirebaseConfig } from '../services/firebase.js';
import { registerPush } from '../services/pushNotifications.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasFirebaseConfig) {
      // No Firebase configured — skip auth, run in dev mode
      setLoading(false);
      return;
    }

    // Hard timeout: if Firebase hasn't responded in 8s, unblock the app anyway
    // The server will return 401 and the error screen will show, which is better
    // than being stuck on "Loading Tire Empire..." forever
    const timeout = setTimeout(() => {
      console.warn('[AuthGate] Firebase auth timed out after 8s — unblocking');
      setLoading(false);
    }, 8000);

    const unsub = onAuthChange(async (firebaseUser) => {
      console.log('[AuthGate] onAuthChange:', firebaseUser ? `uid=${firebaseUser.uid}` : 'null');
      if (firebaseUser) {
        clearTimeout(timeout);
        setUser(firebaseUser);
        setLoading(false);
        registerPush().catch(() => {});
      } else {
        // No user — sign in anonymously for zero-friction onboarding
        try {
          console.log('[AuthGate] Attempting anonymous sign-in...');
          await signInAnon();
          console.log('[AuthGate] Anonymous sign-in succeeded');
          // onAuthChange will fire again with the new user
        } catch (err) {
          console.error('[AuthGate] Anonymous sign-in failed:', err);
          clearTimeout(timeout);
          setLoading(false);
        }
      }
    });

    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  if (loading) {
    return <div className="loading">Loading Tire Empire...</div>;
  }

  // If Firebase timed out or failed and we have no user, still render children
  // but they'll hit 401s — GameContext will show the error screen
  return (
    <AuthContext.Provider value={user}>
      {children}
    </AuthContext.Provider>
  );
}
