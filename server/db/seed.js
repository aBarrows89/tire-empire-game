import { init } from '../engine/init.js';
import { initAIShops } from '../engine/aiShops.js';

export async function seedMemoryStore(store) {
  console.log('Seeding in-memory store...');

  // Create default game with AI shops
  const aiShops = initAIShops();
  await store.saveGame('default', 1, {}, aiShops, []);
  console.log(`  Created game with ${aiShops.length} AI shops`);

  // Create a default player
  const state = init('Player');
  state.id = 'dev-player';
  await store.createPlayer('dev-player', 'Player', state);
  console.log('  Created default player (dev-player)');
}
