import 'dotenv/config';

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/tire_empire';
export const TICK_MS = parseInt(process.env.TICK_MS || '20000', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const CORS_ORIGIN = process.env.CORS_ORIGIN || (
  process.env.NODE_ENV === 'production' ? 'capacitor://localhost' : '*'
);
export const STORAGE_TYPE = process.env.STORAGE || 'memory';
export const ADMIN_UIDS = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);

// Firebase Admin credentials (set via environment variables, never commit)
export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
export const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
export const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
