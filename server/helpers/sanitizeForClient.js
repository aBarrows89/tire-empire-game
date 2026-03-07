/**
 * Sanitize game state before sending to client (via API or WebSocket).
 * Prevents React Error #31 ("Objects are not valid as a React child")
 * by ensuring all renderable fields contain only primitives.
 *
 * This is the LAST LINE OF DEFENSE — even if a bug elsewhere pushes
 * a raw object into g.log or g._notifications, this ensures the client
 * never sees it.
 */
export function sanitizeForClient(g) {
  if (!g || typeof g !== 'object') return g;

  // ── Sanitize log entries ──
  // Log entries should be strings or { msg: string, cat: string } objects.
  // Anything else (e.g. a factory line object accidentally pushed) gets converted.
  if (Array.isArray(g.log)) {
    g.log = g.log.map(entry => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        // Valid log entry: has msg field
        if (entry.msg !== undefined) {
          // Ensure msg is a string
          if (typeof entry.msg !== 'string') {
            entry.msg = String(entry.msg);
          }
          return entry;
        }
        // Invalid entry (no msg field) — likely a leaked object
        // Convert to a string log entry so it doesn't crash React
        return { msg: '[sanitized log entry]', cat: 'other' };
      }
      // Primitive or null — convert to string
      return String(entry ?? '');
    }).filter(Boolean);
  }

  // ── Sanitize _notifications ──
  // Notifications must have { title: string, message: string }
  if (Array.isArray(g._notifications)) {
    g._notifications = g._notifications.filter(n => {
      if (!n || typeof n !== 'object') return false;
      if (!n.title) return false; // Missing title = malformed
      // Coerce to string
      if (typeof n.title !== 'string') n.title = String(n.title);
      if (typeof n.message !== 'string') n.message = String(n.message || '');
      return true;
    });
  }

  // ── Sanitize factory lines ──
  // Ensure all line properties are primitives (prevents a line object
  // from crashing React if it somehow ends up rendered)
  if (g.factory && Array.isArray(g.factory.lines)) {
    for (const line of g.factory.lines) {
      if (typeof line.switchCooldown !== 'number') line.switchCooldown = 0;
      if (typeof line.runStreak !== 'number') line.runStreak = 0;
      if (typeof line.lastMaintDay !== 'number') line.lastMaintDay = 0;
      if (typeof line.status !== 'string') line.status = 'active';
      if (line.currentType !== null && typeof line.currentType !== 'string') {
        line.currentType = null;
      }
      // Ensure queue items have primitive values
      if (Array.isArray(line.queue)) {
        for (const job of line.queue) {
          if (job && typeof job === 'object') {
            if (typeof job.tire !== 'string') job.tire = String(job.tire || 'unknown');
            if (typeof job.qty !== 'number') job.qty = Number(job.qty) || 0;
          }
        }
      }
    }
  }

  // ── Sanitize _newAchievements ──
  if (Array.isArray(g._newAchievements)) {
    g._newAchievements = g._newAchievements.filter(a => {
      if (!a || typeof a !== 'object') return false;
      if (typeof a.name !== 'string' && a.name !== undefined) a.name = String(a.name);
      return true;
    });
  }

  return g;
}
