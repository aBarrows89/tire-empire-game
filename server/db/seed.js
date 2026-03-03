import { init } from '../engine/init.js';
import { initAIShops } from '../engine/aiShops.js';
import { createAIPlayers } from '../engine/aiPlayers.js';

export async function seedMemoryStore(store) {
  console.log('Seeding in-memory store...');

  // Create default game with AI shops
  const aiShops = initAIShops();
  await store.saveGame('default', 1, {}, aiShops, []);
  console.log(`  Created game with ${aiShops.length} AI shops`);

  // Create a default player (no companyName = will see welcome screen)
  const state = init('Player', 1);
  state.id = 'dev-player';
  // Dev testing: preload with cash and rep for factory testing
  state.cash = 50_000_000;
  state.reputation = 100;
  state.tireCoins = 500;
  await store.createPlayer('dev-player', 'Player', state);
  console.log('  Created default player (dev-player)');

  // Create AI players for a populated economy
  const aiPlayers = createAIPlayers(1, 12);
  for (const ap of aiPlayers) {
    await store.createPlayer(ap.id, ap.game_state.name, ap.game_state);
  }
  console.log(`  Created ${aiPlayers.length} AI players`);
}
