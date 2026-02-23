/**
 * Handle a new WebSocket connection.
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Set} clients - Set of all connected clients
 */
export function handleConnection(ws, clients) {
  clients.add(ws);
  console.log(`WS connected (${clients.size} total)`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'subscribe':
          // Player subscribes to tick updates — already receiving via broadcast
          ws.playerId = msg.playerId;
          ws.send(JSON.stringify({ type: 'subscribed', playerId: msg.playerId }));
          break;

        default:
          ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`WS disconnected (${clients.size} total)`);
  });

  ws.on('error', (err) => {
    console.error('WS error:', err.message);
    clients.delete(ws);
  });

  // Send welcome
  ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
}
