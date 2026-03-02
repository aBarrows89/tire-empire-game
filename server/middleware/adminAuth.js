import admin from 'firebase-admin';
import { NODE_ENV, ADMIN_UIDS } from '../config.js';

const ALLOW_DEV_AUTH = process.env.ALLOW_DEV_AUTH === 'true';

/**
 * Admin auth middleware: verifies the requester is in ADMIN_UIDS.
 * Uses Firebase token verification in production, X-Player-Id in dev.
 */
export async function adminAuthMiddleware(req, res, next) {
  if (ADMIN_UIDS.length === 0) {
    return res.status(503).json({ error: 'No admin UIDs configured' });
  }

  // Dev mode fallback
  if (NODE_ENV !== 'production' || ALLOW_DEV_AUTH) {
    const devId = req.headers['x-player-id'];
    if (devId && ADMIN_UIDS.includes(devId)) {
      req.adminId = devId;
      return next();
    }
  }

  // Firebase token verification
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    if (!ADMIN_UIDS.includes(decoded.uid)) {
      return res.status(403).json({ error: 'Not an admin' });
    }
    req.adminId = decoded.uid;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token or not admin' });
  }
}
