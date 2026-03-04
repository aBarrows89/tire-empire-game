import { getPlayer, addChatMessage, getChatMutes, removeChatMute, addDM } from '../db/queries.js';
import admin from 'firebase-admin';
import { NODE_ENV } from '../config.js';

const HEARTBEAT_INTERVAL_MS = 30000; // 30s between pings
const HEARTBEAT_TIMEOUT_PINGS = 2;   // close after 2 missed pings
const VALID_CHANNELS = ['global', 'trade', 'help'];
const DM_RATE_LIMIT_MS = 5000; // 1 DM per 5 seconds per sender

/**
 * Start server-side heartbeat that detects stale WebSocket connections.
 * Call once after creating the WebSocketServer.
 */
export function startHeartbeat(clients) {
  setInterval(() => {
    for (const ws of clients) {
      if (ws._missedPings >= HEARTBEAT_TIMEOUT_PINGS) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      ws._missedPings = (ws._missedPings || 0) + 1;
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Handle a new WebSocket connection.
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Set} clients - Set of all connected clients
 */
export function handleConnection(ws, clients) {
  clients.add(ws);
  ws._missedPings = 0;
  ws._lastDM = 0;
  console.log(`WS connected (${clients.size} total)`);

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'pong':
          ws._missedPings = 0;
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
          const channel = VALID_CHANNELS.includes(msg.channel) ? msg.channel : 'global';
          const chatMsg = {
            id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            playerId: ws.playerId,
            playerName: player.game_state?.companyName || player.name || 'Unknown',
            channel,
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

        case 'dm': {
          if (!ws.playerId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not subscribed' }));
            break;
          }
          // Rate limit DMs
          if (Date.now() - ws._lastDM < DM_RATE_LIMIT_MS) {
            ws.send(JSON.stringify({ type: 'error', message: 'Sending too fast. Wait a moment.' }));
            break;
          }
          ws._lastDM = Date.now();
          const targetId = msg.targetPlayerId;
          if (!targetId || targetId === ws.playerId) break;
          const text = (msg.text || '').trim().slice(0, 500);
          if (!text) break;
          const sender = await getPlayer(ws.playerId);
          if (!sender) break;
          // Check if blocked
          const target = await getPlayer(targetId);
          if (!target) {
            ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
            break;
          }
          const blockedBy = target.game_state?.blockedPlayers || [];
          if (blockedBy.some(b => b.id === ws.playerId)) {
            ws.send(JSON.stringify({ type: 'error', message: 'This player has blocked you' }));
            break;
          }
          const dmMsg = {
            id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            fromId: ws.playerId,
            fromName: sender.game_state?.companyName || sender.name || 'Unknown',
            toId: targetId,
            text,
            timestamp: Date.now(),
          };
          await addDM(dmMsg);
          // Deliver to sender (confirmation)
          ws.send(JSON.stringify({ type: 'dm', message: dmMsg }));
          // Deliver to target if online
          for (const client of clients) {
            if (client.playerId === targetId && client.readyState === 1) {
              client.send(JSON.stringify({ type: 'dm', message: dmMsg }));
            }
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
          break; // Silently ignore unknown types
      }
    } catch (err) {
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      } catch {}
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
