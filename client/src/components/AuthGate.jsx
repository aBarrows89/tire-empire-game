import React, { useState, useEffect, createContext, useContext } from 'react';
import { signInAnon, onAuthChange } from '../services/firebase.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setLoading(false);
      } else {
        // No user — sign in anonymously for zero-friction onboarding
        try {
          await signInAnon();
          // onAuthChange will fire again with the new user
        } catch (err) {
          console.error('Anonymous sign-in failed:', err);
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
