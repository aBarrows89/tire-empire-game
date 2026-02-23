import { STORAGE_TYPE } from '../config.js';

let impl;

if (STORAGE_TYPE === 'postgres') {
  const pg = await import('./pgStore.js');
  impl = pg;
} else {
  const { createMemoryStore } = await import('./memoryStore.js');
  impl = createMemoryStore();
  const { seedMemoryStore } = await import('./seed.js');
  await seedMemoryStore(impl);
}

export const getPlayer = (...args) => impl.getPlayer(...args);
export const createPlayer = (...args) => impl.createPlayer(...args);
export const savePlayerState = (...args) => impl.savePlayerState(...args);
export const isCompanyNameTaken = (...args) => impl.isCompanyNameTaken(...args);
export const getAllActivePlayers = (...args) => impl.getAllActivePlayers(...args);
export const getGame = (...args) => impl.getGame(...args);
export const saveGame = (...args) => impl.saveGame(...args);
export const getLeaderboard = (...args) => impl.getLeaderboard(...args);
export const upsertLeaderboard = (...args) => impl.upsertLeaderboard(...args);
export const getPlayerListings = (...args) => impl.getPlayerListings(...args);
export const addPlayerListing = (...args) => impl.addPlayerListing(...args);
export const updatePlayerListing = (...args) => impl.updatePlayerListing(...args);
export const getPlayerListingById = (...args) => impl.getPlayerListingById(...args);
