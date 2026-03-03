import admin from 'firebase-admin';
import { NODE_ENV, ADMIN_UIDS } from '../config.js';
import { getGame } from '../db/queries.js';

const ALLOW_DEV_AUTH = process.env.ALLOW_DEV_AUTH === 'true';

/** Check if a UID is in the admin whitelist (env vars + DB). */
async function isAdminUid(uid) {
  if (ADMIN_UIDS.includes(uid)) return true;
  try {
    const game = await getGame('default');
    const dbAdmins = game?.economy?.adminUids || [];
    return dbAdmins.some(a => a.uid === uid);
  } catch {
    return false;
  }
}

/**
 * Admin auth middleware: verifies the requester is in ADMIN_UIDS (env + DB).
 * Uses Firebase token verification in production, X-Player-Id in dev.
 */
export async function adminAuthMiddleware(req, res, next) {
  // Dev mode fallback
  if (NODE_ENV !== 'production' || ALLOW_DEV_AUTH) {
    const devId = req.headers['x-player-id'];
    if (devId && await isAdminUid(devId)) {
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
    if (!await isAdminUid(decoded.uid)) {
      console.log(`[adminAuth] Rejected UID: ${decoded.uid} (email: ${decoded.email || 'unknown'}). Add to ADMIN_UIDS to grant access.`);
      return res.status(403).json({ error: 'Not an admin', uid: decoded.uid });
    }
    req.adminId = decoded.uid;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token or not admin' });
  }
}
