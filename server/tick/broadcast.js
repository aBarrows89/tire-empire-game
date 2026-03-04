/**
 * Broadcast tick data to all connected WebSocket clients.
 * Section 11: Per-player state delivery via WebSocket.
 *
 * Authenticated clients (with ws.playerId) get their personal game state
 * embedded in the tick message, eliminating the need for a separate HTTP fetch.
 * Unauthenticated clients get shared data only.
 *
 * @param {Set} clients - Set of WebSocket connections
 * @param {object} data - Shared tick data (day, events, exchange, etc.)
 * @param {Map} [playerStates] - Map of playerId → game state
 */
export function broadcast(clients, data, playerStates) {
  // Pre-serialize the shared data for unauthenticated clients
  const sharedMsg = JSON.stringify(data);

  for (const ws of clients) {
    if (ws.readyState !== 1) continue; // OPEN

    if (playerStates && ws.playerId && playerStates.has(ws.playerId)) {
      // Send personalized state + shared data
      try {
        ws.send(JSON.stringify({
          ...data,
          state: playerStates.get(ws.playerId),
        }));
      } catch {
        // If personalized send fails, fall back to shared
        try { ws.send(sharedMsg); } catch {}
      }
    } else {
      // Unauthenticated or unknown — send shared data only
      try { ws.send(sharedMsg); } catch {}
    }
  }
}
