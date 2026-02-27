import admin from 'firebase-admin';
import { NODE_ENV } from '../config.js';

const ALLOW_DEV_AUTH = process.env.ALLOW_DEV_AUTH === 'true';

// Initialize firebase-admin once at module load
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  } else if (NODE_ENV === 'production') {
    console.error('Firebase credentials missing in production!');
  }
}

/**
 * Auth middleware: verifies Firebase ID tokens in production,
 * falls back to X-Player-Id header in development.
 */
export async function authMiddleware(req, res, next) {
  // Dev mode fallback: allow X-Player-Id header
  if (NODE_ENV !== 'production' || ALLOW_DEV_AUTH) {
    const devId = req.headers['x-player-id'];
    if (devId) {
      req.playerId = devId;
      return next();
    }
  }

  // Check for Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // In dev, also try X-Player-Id as final fallback
    if (NODE_ENV !== 'production' || ALLOW_DEV_AUTH) {
      const fallbackId = req.headers['x-player-id'];
      if (fallbackId) {
        req.playerId = fallbackId;
        return next();
      }
    }
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.playerId = decoded.uid; // Firebase UID becomes player ID
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
