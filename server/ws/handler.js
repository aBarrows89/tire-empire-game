import { getPlayer, addChatMessage, getChatMutes, removeChatMute } from '../db/queries.js';
import admin from 'firebase-admin';
import { NODE_ENV } from '../config.js';

/**
 * Handle a new WebSocket connection.
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Set} clients - Set of all connected clients
 */
export function handleConnection(ws, clients) {
  clients.add(ws);
  console.log(`WS connected (${clients.size} total)`);

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'subscribe': {
          // Verify Firebase token in production, or accept playerId in dev
          if (msg.token && admin.apps.length > 0) {
            try {
              const decoded = await admin.auth().verifyIdToken(msg.token);
              ws.playerId = decoded.uid;
            } catch {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
              break;
            }
          } else if (NODE_ENV !== 'production' && msg.playerId) {
            ws.playerId = msg.playerId;
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
            break;
          }
          ws.send(JSON.stringify({ type: 'subscribed', playerId: ws.playerId }));
          break;
        }

        case 'chat': {
          if (!ws.playerId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not subscribed' }));
            break;
          }
          const player = await getPlayer(ws.playerId);
          if (!player) {
            ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
            break;
          }
          // Check ban
          if (player.game_state?.isBanned) {
            ws.send(JSON.stringify({ type: 'error', message: 'Your account is banned' }));
            break;
          }
          // Check mute
          const mutes = await getChatMutes();
          const mute = mutes[ws.playerId];
          if (mute) {
            if (mute.expiresAt && Date.now() > mute.expiresAt) {
              removeChatMute(ws.playerId); // expired, clean up
            } else {
              const muteMsg = mute.expiresAt
                ? `You are muted until ${new Date(mute.expiresAt).toLocaleString()}`
                : 'You are permanently muted from chat';
              ws.send(JSON.stringify({ type: 'error', message: muteMsg }));
              break;
            }
          }
          const text = (msg.text || '').trim().slice(0, 200);
          if (!text) break;
          const chatMsg = {
            id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            playerId: ws.playerId,
            playerName: player.game_state?.companyName || player.name || 'Unknown',
            text,
            timestamp: Date.now(),
          };
          await addChatMessage(chatMsg);
          const broadcast = JSON.stringify({ type: 'chat', message: chatMsg });
          for (const client of clients) {
            if (client.readyState === 1) client.send(broadcast);
          }
          break;
        }

        case 'shopOffer': {
          // Client-side relay: forward shop offer notifications to specific player
          if (!msg.targetPlayerId) break;
          for (const client of clients) {
            if (client.playerId === msg.targetPlayerId && client.readyState === 1) {
              client.send(JSON.stringify({ type: 'shopOffer', ...msg.data }));
            }
          }
          break;
        }

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
