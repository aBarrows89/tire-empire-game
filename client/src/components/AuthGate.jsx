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

    const unsub = onAuthChange(async (firebaseUser) => {
      console.log('[AuthGate] onAuthChange:', firebaseUser ? `uid=${firebaseUser.uid}` : 'null');
      if (firebaseUser) {
        setUser(firebaseUser);
        setLoading(false);
        // Register for push notifications after auth
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
          setLoading(false);
        }
      }
    });
    return unsub;
  }, []);

  if (loading) {
    return <div className="loading">Loading Tire Empire...</div>;
  }

  return (
    <AuthContext.Provider value={user}>
      {children}
    </AuthContext.Provider>
  );
}
