/**
 * Broadcast a message to all connected WebSocket clients.
 * @param {Set} clients - Set of WebSocket connections
 * @param {object} data - Data to broadcast
 */
export function broadcast(clients, data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) { // OPEN
      ws.send(msg);
    }
  }
}
