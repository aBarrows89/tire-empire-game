import { TICK_MS } from '../config.js';
import { getAllActivePlayers, savePlayerState, getGame, saveGame, upsertLeaderboard } from '../db/queries.js';
import { simWeek } from '../engine/simWeek.js';
import { getWealth } from '../../shared/helpers/wealth.js';
import { CITIES } from '../../shared/constants/cities.js';
import { broadcast } from './broadcast.js';

let tickInterval = null;

/**
 * Run one tick: advance all active players by one week.
 * @param {Set} clients - WebSocket client set for broadcasting
 */
export async function runTick(clients) {
  try {
    const game = await getGame();
    if (!game) return;

    const players = await getAllActivePlayers();
    const week = (game.week || 0) + 1;

    const shared = {
      cities: CITIES,
      aiShops: game.ai_shops || [],
      liquidation: game.liquidation || [],
    };

    for (const player of players) {
      const state = player.game_state;
      const newState = simWeek(state, shared);
      await savePlayerState(player.id, newState);

      // Update leaderboard
      await upsertLeaderboard(
        player.id,
        newState.name || 'Unknown',
        getWealth(newState),
        newState.reputation,
        newState.locations.length,
        newState.week
      );
    }

    // Update game week
    await saveGame(
      'default',
      week,
      game.economy || {},
      game.ai_shops || [],
      game.liquidation || []
    );

    // Broadcast tick to all clients
    broadcast(clients, {
      type: 'tick',
      week,
      playerCount: players.length,
      timestamp: Date.now(),
    });

    console.log(`Tick ${week}: ${players.length} players processed`);
  } catch (err) {
    console.error('Tick error:', err);
  }
}

/**
 * Start the tick loop.
 * @param {Set} clients - WebSocket client set
 */
export function startTickLoop(clients) {
  if (tickInterval) return;
  console.log(`Starting tick loop (${TICK_MS}ms interval)`);
  tickInterval = setInterval(() => runTick(clients), TICK_MS);
}

/**
 * Stop the tick loop.
 */
export function stopTickLoop() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    console.log('Tick loop stopped');
  }
}
