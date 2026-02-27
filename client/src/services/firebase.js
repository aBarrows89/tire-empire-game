import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithCredential,
  signInWithCredential,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/** Sign in anonymously (zero-friction onboarding) */
export async function signInAnon() {
  const cred = await signInAnonymously(auth);
  return cred.user;
}

/** Get a fresh Firebase ID token (auto-refreshes if near expiry) */
export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/** Get the current user's UID synchronously (for WebSocket) */
export function getUid() {
  return auth.currentUser?.uid || null;
}

/** Subscribe to auth state changes */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/** Link anonymous account to Google (upgrade) */
export async function linkGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = GoogleAuthProvider.credential();
  return linkWithCredential(auth.currentUser, cred);
}

/** Link anonymous account to Apple (upgrade) */
export async function linkApple() {
  const provider = new OAuthProvider('apple.com');
  // Apple Sign-In linking requires a native plugin in Capacitor
  // This is a placeholder for the credential flow
  return null;
}

export { auth };
