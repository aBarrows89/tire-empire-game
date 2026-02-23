/**
 * Placeholder auth middleware.
 * In production, replace with Firebase/Supabase token validation.
 *
 * For now, expects header: X-Player-Id
 */
export function authMiddleware(req, res, next) {
  const playerId = req.headers['x-player-id'];
  if (!playerId) {
    return res.status(401).json({ error: 'Missing X-Player-Id header' });
  }
  req.playerId = playerId;
  next();
}
